<template>
  <section class="detail-composer">
    <header class="detail-composer__header">
      <div>
        <span class="eyebrow">跨端详情内容</span>
        <h3>会议详情编辑器</h3>
        <p>按内容块编排详情，不需要粘贴 HTML 或 JSON。后台预览、H5 和小程序使用同一份内容结构。</p>
      </div>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存详情内容</el-button>
    </header>

    <div class="insert-toolbar" aria-label="插入内容块">
      <span class="insert-toolbar__label">插入</span>
      <el-button
        v-for="tool in blockTools"
        :key="tool.type"
        :icon="tool.icon"
        plain
        @click="addBlock(tool.type)"
      >
        {{ tool.label }}
      </el-button>
    </div>

    <div class="detail-composer__workspace">
      <div class="block-column">
        <div v-if="draftBlocks.length === 0" class="empty-editor">
          <Picture class="empty-editor__icon" />
          <strong>从第一个内容块开始</strong>
          <span>建议先插入“标题”，再添加正文、图片或列表。内容块数量不受限制。</span>
          <el-button type="primary" plain @click="addBlock('heading')">插入标题</el-button>
        </div>

        <article
          v-for="(block, index) in draftBlocks"
          :key="block.id"
          :class="['content-block', { 'is-disabled': !block.enabled, 'is-expanded': expandedBlockId === block.id }]"
        >
          <header class="content-block__header">
            <button class="content-block__summary" type="button" @click="toggleBlock(block.id)">
              <span class="content-block__index">{{ index + 1 }}</span>
              <span>
                <strong>{{ blockTypeLabel(block.type) }}</strong>
                <small>{{ blockSummary(block) }}</small>
              </span>
            </button>
            <div class="content-block__actions">
              <el-switch v-model="block.enabled" inline-prompt active-text="显" inactive-text="隐" />
              <el-button circle :icon="ArrowUp" :disabled="index === 0" title="上移" @click="moveBlock(index, -1)" />
              <el-button circle :icon="ArrowDown" :disabled="index === draftBlocks.length - 1" title="下移" @click="moveBlock(index, 1)" />
              <el-button circle :icon="CopyDocument" title="复制" @click="duplicateBlock(index)" />
              <el-button circle type="danger" plain :icon="Delete" title="删除" @click="removeBlock(index)" />
            </div>
          </header>

          <div v-if="expandedBlockId === block.id" class="content-block__form">
            <label class="field">
              <span>内容类型</span>
              <el-select v-model="block.type">
                <el-option v-for="tool in blockTools" :key="tool.type" :label="tool.label" :value="tool.type" />
              </el-select>
            </label>

            <label v-if="block.type === 'heading'" class="field field--wide">
              <span>标题文字</span>
              <el-input v-model="block.title" maxlength="80" show-word-limit placeholder="例如：费用包含" />
            </label>

            <label v-if="block.type === 'paragraph' || block.type === 'quote'" class="field field--wide">
              <span>{{ block.type === "quote" ? "重点提示" : "正文内容" }}</span>
              <el-input
                v-model="block.text"
                type="textarea"
                :rows="5"
                maxlength="3000"
                show-word-limit
                placeholder="支持多段文字和换行"
              />
            </label>

            <label v-if="block.type === 'list'" class="field field--wide">
              <span>列表内容</span>
              <el-input
                :model-value="block.items.join('\n')"
                type="textarea"
                :rows="5"
                placeholder="每行一项，例如：参会费、会期资料包"
                @update:model-value="block.items = splitLines(String($event))"
              />
            </label>

            <template v-if="block.type === 'image'">
              <label class="field field--wide">
                <span>图片</span>
                <div class="image-field">
                  <el-input v-model="block.imageUrl" placeholder="上传图片、从素材库选择或粘贴图片地址" />
                  <el-button :icon="Upload" :loading="uploadingBlockId === block.id" @click="emit('upload-image', block.id)">上传</el-button>
                  <el-button :icon="FolderOpened" @click="emit('choose-material', block.id)">素材库</el-button>
                </div>
              </label>
              <label class="field">
                <span>显示方式</span>
                <el-select v-model="block.imageMode">
                  <el-option label="按宽度完整展示" value="widthFix" />
                  <el-option label="等比裁切" value="aspectFill" />
                  <el-option label="完整放入画面" value="aspectFit" />
                </el-select>
              </label>
              <label class="field">
                <span>图片比例</span>
                <el-select v-model="block.imageRatio" :disabled="block.imageMode === 'widthFix'">
                  <el-option label="自动高度" value="auto" />
                  <el-option label="16:9 横图" value="16:9" />
                  <el-option label="4:3 横图" value="4:3" />
                  <el-option label="1:1 方图" value="1:1" />
                </el-select>
              </label>
              <label class="field field--wide">
                <span>图片说明</span>
                <el-input v-model="block.caption" maxlength="120" placeholder="可选，显示在图片下方" />
              </label>
            </template>

            <template v-if="block.type === 'button'">
              <label class="field">
                <span>按钮文案</span>
                <el-input v-model="block.buttonText" maxlength="24" placeholder="例如：立即报名" />
              </label>
              <label class="field">
                <span>按钮样式</span>
                <el-select v-model="block.buttonStyle">
                  <el-option label="主按钮" value="primary" />
                  <el-option label="次按钮" value="secondary" />
                  <el-option label="文字按钮" value="text" />
                </el-select>
              </label>
              <label class="field">
                <span>点击动作</span>
                <el-select v-model="block.actionTargetType">
                  <el-option label="会议报名" value="registration" />
                  <el-option label="拨打电话" value="phone" />
                  <el-option label="复制内容" value="copy" />
                  <el-option label="打开外部 H5" value="external-h5" />
                  <el-option label="无动作" value="none" />
                </el-select>
              </label>
              <label v-if="block.actionTargetType === 'phone'" class="field">
                <span>电话号码</span>
                <el-input v-model="block.phone" placeholder="例如：400-000-0000" />
              </label>
              <label v-if="block.actionTargetType === 'copy'" class="field field--wide">
                <span>复制内容</span>
                <el-input v-model="block.copyText" placeholder="用户点击后复制的文字" />
              </label>
              <label v-if="block.actionTargetType === 'external-h5'" class="field field--wide">
                <span>外部链接</span>
                <el-input v-model="block.externalUrl" placeholder="https://example.com" />
              </label>
            </template>

            <label v-if="!['image', 'divider', 'button'].includes(block.type)" class="field">
              <span>文字对齐</span>
              <el-radio-group v-model="block.align" size="small">
                <el-radio-button value="left">左</el-radio-button>
                <el-radio-button value="center">中</el-radio-button>
                <el-radio-button value="right">右</el-radio-button>
              </el-radio-group>
            </label>
            <label v-if="!['image', 'divider', 'button'].includes(block.type)" class="field">
              <span>内容语气</span>
              <el-select v-model="block.tone">
                <el-option label="标准" value="default" />
                <el-option label="重点" value="accent" />
                <el-option label="辅助" value="muted" />
              </el-select>
            </label>
          </div>
        </article>
      </div>

      <ConferenceDetailContentPreview
        :blocks="draftBlocks"
        :title="title"
        :subtitle="subtitle"
        :cover-image="coverImage"
        :long-image-segments="longImageSegments"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, type Component } from "vue";
import {
  ArrowDown,
  ArrowUp,
  ChatLineSquare,
  CopyDocument,
  Delete,
  Document,
  EditPen,
  FolderOpened,
  List,
  Minus,
  Picture,
  Pointer,
  Upload
} from "@element-plus/icons-vue";
import {
  normalizeConferenceDetailBlock,
  type ConferenceDetailBlockType,
  type ConferenceDetailContentBlock
} from "@conference/shared";
import ConferenceDetailContentPreview from "./ConferenceDetailContentPreview.vue";

const props = withDefaults(defineProps<{
  modelValue: ConferenceDetailContentBlock[];
  title?: string;
  subtitle?: string;
  coverImage?: string;
  saving?: boolean;
  uploadingBlockId?: string;
  longImageSegments?: Array<{ url: string }>;
}>(), {
  title: "",
  subtitle: "",
  coverImage: "",
  saving: false,
  uploadingBlockId: "",
  longImageSegments: () => []
});

const emit = defineEmits<{
  "update:modelValue": [value: ConferenceDetailContentBlock[]];
  save: [];
  "upload-image": [blockId: string];
  "choose-material": [blockId: string];
}>();

const blockTools: Array<{ type: ConferenceDetailBlockType; label: string; icon: Component }> = [
  { type: "heading", label: "标题", icon: Document },
  { type: "paragraph", label: "正文", icon: EditPen },
  { type: "image", label: "图片", icon: Picture },
  { type: "quote", label: "重点提示", icon: ChatLineSquare },
  { type: "list", label: "列表", icon: List },
  { type: "divider", label: "分隔线", icon: Minus },
  { type: "button", label: "按钮", icon: Pointer }
];

const draftBlocks = ref<ConferenceDetailContentBlock[]>([]);
const expandedBlockId = ref("");
let blockSequence = 0;

watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value) === JSON.stringify(draftBlocks.value)) return;
    draftBlocks.value = cloneBlocks(value);
  },
  { deep: true, immediate: true }
);

watch(
  draftBlocks,
  (value) => emit("update:modelValue", resequence(cloneBlocks(value))),
  { deep: true }
);

function addBlock(type: ConferenceDetailBlockType) {
  const block = normalizeConferenceDetailBlock({
    id: nextBlockId(),
    type,
    title: type === "heading" ? "新的详情标题" : "",
    text: type === "paragraph" ? "请输入正文内容" : type === "quote" ? "请输入重点提示" : "",
    items: type === "list" ? ["第一项内容", "第二项内容"] : [],
    buttonText: type === "button" ? "立即报名" : "",
    actionTargetType: type === "button" ? "registration" : "none"
  }, draftBlocks.value.length);
  draftBlocks.value.push(block);
  expandedBlockId.value = block.id;
}

function toggleBlock(id: string) {
  expandedBlockId.value = expandedBlockId.value === id ? "" : id;
}

function moveBlock(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= draftBlocks.value.length) return;
  const [block] = draftBlocks.value.splice(index, 1);
  if (block) draftBlocks.value.splice(target, 0, block);
}

function duplicateBlock(index: number) {
  const source = draftBlocks.value[index];
  if (!source) return;
  const clone = normalizeConferenceDetailBlock({ ...source, id: nextBlockId() }, index + 1);
  draftBlocks.value.splice(index + 1, 0, clone);
  expandedBlockId.value = clone.id;
}

function removeBlock(index: number) {
  const [removed] = draftBlocks.value.splice(index, 1);
  if (removed?.id === expandedBlockId.value) expandedBlockId.value = "";
}

function blockTypeLabel(type: ConferenceDetailBlockType): string {
  return blockTools.find((tool) => tool.type === type)?.label ?? "内容";
}

function blockSummary(block: ConferenceDetailContentBlock): string {
  if (!block.enabled) return "已隐藏";
  if (block.type === "heading") return block.title || "未填写标题";
  if (block.type === "paragraph" || block.type === "quote") return block.text || "未填写内容";
  if (block.type === "list") return block.items.join("、") || "未填写列表";
  if (block.type === "image") return block.caption || block.imageUrl || "未选择图片";
  if (block.type === "button") return block.buttonText || "未填写按钮";
  return "内容分隔线";
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function cloneBlocks(value: ConferenceDetailContentBlock[]): ConferenceDetailContentBlock[] {
  return value.map((block) => ({ ...block, items: [...block.items] }));
}

function resequence(value: ConferenceDetailContentBlock[]): ConferenceDetailContentBlock[] {
  return value.map((block, index) => ({ ...block, sort: (index + 1) * 10 }));
}

function nextBlockId(): string {
  blockSequence += 1;
  return `conference-detail-${Date.now()}-${blockSequence}`;
}

</script>

<style scoped>
.detail-composer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-composer__header,
.insert-toolbar,
.content-block__header,
.image-field {
  display: flex;
  align-items: center;
}

.detail-composer__header {
  justify-content: space-between;
  gap: 24px;
}

.detail-composer__header h3,
.detail-composer__header p {
  margin: 0;
}

.detail-composer__header h3 {
  margin-top: 4px;
  color: #172236;
  font-size: 20px;
}

.detail-composer__header p {
  margin-top: 6px;
  color: #68758a;
  font-size: 13px;
  line-height: 1.6;
}

.eyebrow {
  color: #2f6484;
  font-size: 12px;
  font-weight: 700;
}

.insert-toolbar {
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #f8fafc;
}

.insert-toolbar__label {
  margin-right: 4px;
  color: #4d5b70;
  font-size: 13px;
  font-weight: 700;
}

.detail-composer__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 388px;
  gap: 20px;
  align-items: start;
}

.block-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.empty-editor {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed #c7d1dd;
  border-radius: 8px;
  color: #68758a;
  text-align: center;
}

.empty-editor strong {
  color: #172236;
  font-size: 16px;
}

.empty-editor span {
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
}

.empty-editor__icon {
  width: 38px;
  color: #8190a4;
}

.content-block {
  overflow: hidden;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #fff;
}

.content-block.is-expanded {
  border-color: #78a2bc;
  box-shadow: 0 8px 22px rgba(30, 64, 86, 0.08);
}

.content-block.is-disabled {
  background: #f7f8fa;
  opacity: 0.72;
}

.content-block__header {
  min-height: 66px;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}

.content-block__summary {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #172236;
  cursor: pointer;
  text-align: left;
}

.content-block__summary > span:last-child {
  min-width: 0;
}

.content-block__summary strong,
.content-block__summary small {
  display: block;
}

.content-block__summary small {
  max-width: 520px;
  margin-top: 4px;
  overflow: hidden;
  color: #7a8798;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-block__index {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 6px;
  background: #eaf2f7;
  color: #2f6484;
  font-size: 13px;
  font-weight: 800;
}

.content-block__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.content-block__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.content-block__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
  border-top: 1px solid #e7ebf0;
  background: #f8fafc;
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  color: #4d5b70;
  font-size: 12px;
  font-weight: 700;
}

.field--wide {
  grid-column: 1 / -1;
}

.image-field {
  gap: 8px;
}

.image-field .el-input {
  min-width: 0;
  flex: 1;
}

@media (max-width: 1180px) {
  .detail-composer__workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .detail-composer__header,
  .content-block__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .content-block__actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .content-block__form {
    grid-template-columns: 1fr;
  }

  .field--wide {
    grid-column: auto;
  }

  .image-field {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
