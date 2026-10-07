<template>
  <div ref="studioElement" class="invitation-studio">
    <div class="studio-workspace-heading">
      <el-tabs v-model="studioTab"
        ><el-tab-pane label="封面设计" name="cover" /><el-tab-pane
          label="视觉与动效"
          name="effects" /><el-tab-pane
          label="章节导航"
          name="navigation" /><el-tab-pane label="微信分享" name="share"
      /></el-tabs>
      <el-input
        :model-value="previewName"
        aria-label="预览受邀人姓名"
        placeholder="预览姓名"
        maxlength="80"
        @update:model-value="$emit('update:previewName', $event)"
      />
    </div>
    <section v-if="studioTab === 'cover'">
      <div class="studio-cover-mode">
        <el-radio-group
          :model-value="modelValue.cover.mode"
          aria-label="封面模式"
          @update:model-value="setCoverMode(String($event))"
          ><el-radio-button value="artwork">上传成品海报</el-radio-button
          ><el-radio-button value="template"
            >使用排版模板</el-radio-button
          ></el-radio-group
        >
        <el-button
          v-if="modelValue.cover.mode !== 'artwork'"
          :icon="Rank"
          :disabled="disabled"
          @click="openCoverCanvas"
          >打开定位画布</el-button
        >
      </div>
      <InvitationCoverEditor
        v-if="modelValue.cover.mode === 'artwork'"
        :model-value="modelValue"
        :campaign-id="campaignId"
        :preview-name="previewName"
        :disabled="disabled"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <template v-else>
        <div class="studio-heading">
          <h2>会议视觉</h2>
          <span>{{ presetName }}</span>
        </div>
        <div class="studio-presets" role="group" aria-label="视觉预设">
          <button
            v-for="preset in INVITATION_PRESETS"
            :key="preset.id"
            type="button"
            :aria-pressed="modelValue.visualPreset === preset.id"
            :disabled="disabled"
            :class="{ active: modelValue.visualPreset === preset.id }"
            @click="apply(preset.id)"
          >
            <div
              class="studio-preset-art"
              :style="{
                color: preset.primaryColor,
                fontFamily:
                  preset.headingFont === 'serif'
                    ? 'Songti SC, serif'
                    : 'inherit',
              }"
            >
              <img :src="preset.image" alt="" /><span>诚挚相邀</span
              ><strong>{{ modelValue.title || "观潮会集" }}</strong
              ><small>{{
                preset.id === "booklet" ? "九章 · 会议长卷" : "INVITATION"
              }}</small>
              <el-icon v-if="modelValue.visualPreset === preset.id"
                ><Check
              /></el-icon>
            </div>
            <span class="studio-preset-label"
              >{{ preset.name
              }}<i :style="{ background: preset.primaryColor }" /><i
                :style="{ background: preset.accentColor }"
            /></span>
          </button>
        </div>
        <div class="studio-options">
          <el-form-item label="标题字体"
            ><el-radio-group
              :model-value="modelValue.headingFont"
              @update:model-value="set('headingFont', $event)"
              ><el-radio-button value="serif">宋体</el-radio-button
              ><el-radio-button value="sans"
                >黑体</el-radio-button
              ></el-radio-group
            ></el-form-item
          >
          <el-form-item label="主色"
            ><el-color-picker
              :model-value="modelValue.primaryColor"
              @update:model-value="set('primaryColor', $event)"
          /></el-form-item>
          <el-form-item label="点缀"
            ><el-color-picker
              :model-value="modelValue.accentColor"
              @update:model-value="set('accentColor', $event)"
          /></el-form-item>
        </div>
        <el-collapse class="studio-advanced">
          <el-collapse-item title="自定义主视觉与精细调整" name="visual">
            <el-form-item label="主视觉"
              ><InvitationImageField
                :model-value="modelValue.coverImageUrl"
                :campaign-id="campaignId"
                label="会议主视觉"
                :disabled="disabled"
                @update:model-value="customCover"
            /></el-form-item>
            <el-form-item label="品牌标识"
              ><InvitationImageField
                :model-value="modelValue.logoUrl"
                :campaign-id="campaignId"
                label="品牌标识"
                :disabled="disabled"
                @update:model-value="set('logoUrl', $event)"
            /></el-form-item>
            <div class="studio-options">
              <el-form-item label="封面构图"
                ><el-radio-group
                  :model-value="modelValue.heroLayout"
                  @update:model-value="set('heroLayout', $event)"
                  ><el-radio-button value="immersive">沉浸式</el-radio-button
                  ><el-radio-button value="poster"
                    >完整海报</el-radio-button
                  ></el-radio-group
                ></el-form-item
              >
              <el-form-item label="封面文字"
                ><el-color-picker
                  :model-value="modelValue.heroTextColor"
                  @update:model-value="set('heroTextColor', $event)"
              /></el-form-item>
              <el-form-item label="章节底色"
                ><el-color-picker
                  :model-value="modelValue.backgroundColor"
                  @update:model-value="set('backgroundColor', $event)"
              /></el-form-item>
            </div>
            <el-form-item label="图片焦点"
              ><el-radio-group
                :model-value="modelValue.heroPosition"
                @update:model-value="set('heroPosition', $event)"
                ><el-radio-button value="top">顶部</el-radio-button
                ><el-radio-button value="center">居中</el-radio-button
                ><el-radio-button value="bottom"
                  >底部</el-radio-button
                ></el-radio-group
              ></el-form-item
            >
            <el-form-item label="封面遮罩"
              ><el-slider
                :model-value="modelValue.heroOverlayOpacity"
                :min="0"
                :max="80"
                :step="5"
                @update:model-value="set('heroOverlayOpacity', $event)"
            /></el-form-item>
          </el-collapse-item>
        </el-collapse>
      </template>
      <el-collapse class="studio-advanced"
        ><el-collapse-item title="会议文字 · 选填" name="facts"
          ><div class="studio-facts">
            <el-form-item
              v-for="(label, key) in {
                title: '会议名称',
                subtitle: '副标题',
                host: '落款 / 品牌',
                dateLabel: '会议时间',
                location: '会议地点',
              }"
              :key="key"
              :label="label"
              ><el-input
                :model-value="modelValue[key]"
                maxlength="200"
                @update:model-value="set(key, $event)"
            /></el-form-item></div></el-collapse-item
      ></el-collapse>
    </section>
    <section v-else-if="studioTab === 'effects'" class="studio-effects">
      <InvitationThemeEditor
        :model-value="modelValue"
        :campaign-id="campaignId"
        :disabled="disabled"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <div class="studio-heading">
        <h2>章节入场</h2>
        <el-button :icon="Refresh" @click="$emit('replay')">预览动效</el-button>
      </div>
      <div class="studio-effect-options" role="group" aria-label="章节入场效果">
        <button
          v-for="(label, value) in {
            rise: '柔和上浮',
            fade: '渐入',
            unfold: '幕布展开',
            none: '无动效',
          }"
          :key="value"
          type="button"
          :disabled="disabled"
          :aria-pressed="modelValue.effects.entrance === value"
          @click="effect('entrance', value)"
        >
          <span class="effect-miniature" :class="`effect-miniature--${value}`"
            ><i /><i /><i /></span
          ><span>{{ label }}</span>
        </button>
      </div>
      <div class="studio-effects-settings">
        <el-form-item label="封面入场"
          ><el-radio-group
            :model-value="modelValue.effects.cover"
            @update:model-value="effect('cover', $event)"
            ><el-radio-button value="none">静态</el-radio-button
            ><el-radio-button value="fade">淡入</el-radio-button
            ><el-radio-button value="focus"
              >聚焦展开</el-radio-button
            ></el-radio-group
          ></el-form-item
        >
        <el-form-item label="下滑形式"
          ><el-radio-group
            :model-value="modelValue.effects.scroll"
            @update:model-value="effect('scroll', $event)"
            ><el-radio-button value="continuous">连续长页</el-radio-button
            ><el-radio-button value="chapters"
              >章节停靠</el-radio-button
            ></el-radio-group
          ></el-form-item
        >
        <el-form-item label="动效时长"
          ><el-slider
            :model-value="modelValue.effects.duration"
            :min="200"
            :max="1200"
            :step="50"
            :format-tooltip="(value: number) => `${value} ms`"
            @update:model-value="effect('duration', $event)"
        /></el-form-item>
        <div class="studio-options">
          <el-form-item label="主色"
            ><el-color-picker
              :model-value="modelValue.primaryColor"
              @update:model-value="set('primaryColor', $event)" /></el-form-item
          ><el-form-item label="点缀"
            ><el-color-picker
              :model-value="modelValue.accentColor"
              @update:model-value="set('accentColor', $event)" /></el-form-item
          ><el-form-item label="章节底色"
            ><el-color-picker
              :model-value="modelValue.backgroundColor"
              @update:model-value="
                set('backgroundColor', $event)
              " /></el-form-item
          ><el-form-item label="章节字体"
            ><el-radio-group
              :model-value="modelValue.headingFont"
              @update:model-value="set('headingFont', $event)"
              ><el-radio-button value="serif">宋体</el-radio-button
              ><el-radio-button value="sans"
                >黑体</el-radio-button
              ></el-radio-group
            ></el-form-item
          >
        </div>
      </div>
    </section>
    <InvitationNavigationEditor
      v-else-if="studioTab === 'navigation'"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <section v-else class="studio-share-section">
      <div class="studio-heading studio-share-heading">
        <h2>微信分享</h2>
      </div>
      <el-form-item label="分享标题">
        <el-input
          ref="titleInput"
          :model-value="modelValue.shareTitle"
          placeholder="{姓名}专属邀请函"
          maxlength="200"
          aria-label="分享标题"
          @update:model-value="set('shareTitle', $event)"
        >
          <template #append
            ><el-dropdown
              :disabled="disabled"
              trigger="click"
              @command="insertVariable"
              ><el-button
                :icon="Connection"
                title="插入变量"
                aria-label="插入变量"
              /><template #dropdown
                ><el-dropdown-menu
                  ><el-dropdown-item
                    v-for="name in ['姓名', '称谓', '会议名称']"
                    :key="name"
                    :command="name"
                    >{{ "{" + name + "}" }}</el-dropdown-item
                  ></el-dropdown-menu
                ></template
              ></el-dropdown
            ></template
          >
        </el-input>
      </el-form-item>
      <el-form-item label="分享摘要"
        ><el-input
          :model-value="modelValue.shareDescription"
          type="textarea"
          :rows="2"
          maxlength="300"
          @update:model-value="set('shareDescription', $event)"
      /></el-form-item>
      <div class="studio-share-card" aria-label="微信分享卡片预览">
        <div>
          <strong>{{ share.title }}</strong>
          <p>{{ share.description }}</p>
          <small>观潮会集 · guanchaohuiji.com</small>
        </div>
        <img
          v-if="share.imageUrl"
          :src="assetUrl(share.imageUrl)"
          alt="分享封面"
        />
      </div>
      <el-collapse class="studio-advanced"
        ><el-collapse-item title="独立分享封面" name="share"
          ><InvitationImageField
            :model-value="modelValue.shareImageUrl"
            :campaign-id="campaignId"
            label="微信分享封面"
            :disabled="disabled"
            @update:model-value="
              set('shareImageUrl', $event)
            " /></el-collapse-item
      ></el-collapse>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Check, Connection, Rank, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  applyInvitationPreset,
  applyInvitationBooklet,
  invitationShare,
  INVITATION_PRESETS,
  createInvitationLayer,
  type InvitationContent,
} from "@conference/shared";
import InvitationImageField from "./InvitationImageField.vue";
import InvitationCoverEditor from "./InvitationCoverEditor.vue";
import InvitationThemeEditor from "./InvitationThemeEditor.vue";
import InvitationNavigationEditor from "./InvitationNavigationEditor.vue";
import { API_BASE_URL } from "../../config";
const props = defineProps<{
  modelValue: InvitationContent;
  campaignId: string;
  previewName: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationContent];
  "update:previewName": [value: string];
  replay: [];
}>();
const titleInput = ref<{ input?: HTMLInputElement; focus(): void }>();
const studioTab = ref("cover");
const studioElement = ref<HTMLElement>();
async function openCoverCanvas() {
  studioTab.value = "cover";
  if (props.modelValue.cover.mode !== "artwork") {
    if (props.disabled) return;
    const campaignId = props.campaignId;
    try {
      await ElMessageBox.confirm(
        "将保留当前封面图片与已有文字图层，改为在画布上拖拽排版；模板文字不再自动叠加。保存并发布后才会更新嘉宾页面。",
        "切换为定位画布",
        {
          confirmButtonText: "切换并打开",
          cancelButtonText: "保留模板",
          type: "warning",
        },
      );
    } catch {
      return;
    }
    if (props.disabled || props.campaignId !== campaignId) return;
    setCoverMode("artwork");
  }
  await nextTick();
  studioElement.value
    ?.querySelector(".cover-workspace")
    ?.scrollIntoView({ block: "start", behavior: "instant" });
}
defineExpose({ openCoverCanvas });
function setCoverMode(mode: string) {
  set("cover", {
    ...props.modelValue.cover,
    mode,
    layers:
      mode === "artwork" && !props.modelValue.cover.layers.length
        ? [createInvitationLayer(crypto.randomUUID())]
        : props.modelValue.cover.layers,
  });
}
function effect(key: keyof InvitationContent["effects"], value: unknown) {
  if (!props.disabled)
    emit("update:modelValue", {
      ...props.modelValue,
      motion: "elegant",
      effects: { ...props.modelValue.effects, [key]: value },
    });
}
const presetName = computed(
  () =>
    INVITATION_PRESETS.find((item) => item.id === props.modelValue.visualPreset)
      ?.name || "自定义视觉",
);
const share = computed(() =>
  invitationShare({
    content: props.modelValue,
    recipient: { name: props.previewName || "受邀嘉宾", salutation: "老师" },
    shareUrl: "",
  }),
);
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? `${new URL(API_BASE_URL).origin}${url}` : url;
function set(key: keyof InvitationContent, value: unknown) {
  if (!props.disabled && value != null)
    emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function apply(id: string) {
  if (props.disabled) return;
  try {
    emit(
      "update:modelValue",
      id === "booklet"
        ? applyInvitationBooklet(props.modelValue)
        : applyInvitationPreset(props.modelValue, id),
    );
  } catch (error) {
    ElMessage.warning(
      error instanceof Error ? error.message : "模板应用失败，现有内容未修改。",
    );
  }
}
function customCover(url: string) {
  if (props.disabled) return;
  emit("update:modelValue", {
    ...props.modelValue,
    coverImageUrl: url,
    visualPreset: "custom",
  });
}
async function insertVariable(name: string) {
  const input = titleInput.value?.input;
  const value = props.modelValue.shareTitle;
  const start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? start;
  const variable = `{${name}}`;
  if (value.length - (end - start) + variable.length > 200) return;
  set("shareTitle", value.slice(0, start) + variable + value.slice(end));
  await nextTick();
  titleInput.value?.focus();
  input?.setSelectionRange(start + variable.length, start + variable.length);
}
</script>
<style scoped>
.studio-workspace-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 12px;
}
.studio-workspace-heading > .el-input {
  max-width: 160px;
}
.studio-workspace-heading > .el-tabs {
  flex: 1;
  min-width: 0;
}
.studio-cover-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0 0 24px;
}
.studio-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}
.studio-share-section {
  max-width: 720px;
}
.studio-effect-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.studio-effect-options button {
  border: 1px solid #dde3e6;
  border-radius: 6px;
  background: #fff;
  padding: 16px;
  text-align: left;
  color: #34424b;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.studio-effect-options button[aria-pressed="true"] {
  border-color: #43897c;
  box-shadow: inset 0 0 0 1px #43897c;
}
.effect-miniature {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  height: 98px;
  background: #f1f4f5;
  margin-bottom: 14px;
  padding: 20px;
}
.effect-miniature i {
  display: block;
  background: #64877c;
  height: 5px;
  width: 75%;
}
.effect-miniature i:first-child {
  height: 10px;
  width: 45%;
  background: #ac667b;
}
.effect-miniature i:last-child {
  width: 60%;
}
.studio-effect-options button:hover .effect-miniature--rise i {
  animation: studio-rise 0.9s both;
}
.studio-effect-options button:hover .effect-miniature--fade i {
  animation: studio-fade 0.9s both;
}
.studio-effect-options button:hover .effect-miniature--unfold i {
  animation: studio-unfold 0.9s both;
}
.studio-effects-settings {
  max-width: 700px;
}
@keyframes studio-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes studio-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes studio-unfold {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .studio-effect-options button:hover .effect-miniature i {
    animation: none;
  }
}
@media (max-width: 700px) {
  .studio-effect-options {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .studio-workspace-heading {
    flex-wrap: wrap;
    gap: 8px;
  }
  .studio-workspace-heading > .el-tabs {
    flex-basis: 100%;
  }
  .studio-facts {
    grid-template-columns: 1fr;
  }
}
.studio-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 18px;
}
.studio-heading h2 {
  font-size: 17px;
  margin: 0;
  font-weight: 600;
}
.studio-heading > span {
  font-size: 12px;
  color: #788078;
}
.studio-presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.studio-presets button {
  padding: 0;
  border: 1px solid #d9dedb;
  border-radius: 6px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  min-width: 0;
}
.studio-presets button.active {
  outline: 2px solid #355e4a;
  outline-offset: 2px;
}
.studio-presets button:disabled {
  cursor: default;
}
.studio-preset-art {
  aspect-ratio: 3/4;
  position: relative;
  padding: 16px 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.studio-preset-art img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.studio-preset-art > span,
.studio-preset-art > strong,
.studio-preset-art > small {
  position: relative;
  z-index: 1;
}
.studio-preset-art > span {
  font-size: 10px;
}
.studio-preset-art > strong {
  font-size: 16px;
  line-height: 1.6;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.studio-preset-art > small {
  font-size: 8px;
}
.studio-preset-art .el-icon {
  position: absolute;
  bottom: 8px;
  right: 8px;
  color: #fff;
  background: #355e4a;
  padding: 4px;
  border-radius: 50%;
  box-sizing: content-box;
}
.studio-preset-label {
  display: flex;
  align-items: center;
  padding: 12px 10px;
  gap: 4px;
  font-size: 12px;
  flex-wrap: wrap;
  color: #34463a;
}
.studio-preset-label i {
  height: 8px;
  width: 8px;
  border-radius: 50%;
}
.studio-preset-label i:first-of-type {
  margin-left: auto;
}
.studio-options {
  display: flex;
  align-items: flex-start;
  gap: 16px 24px;
  flex-wrap: wrap;
}
.studio-options :deep(.el-form-item) {
  margin-bottom: 18px;
}
.studio-advanced {
  border-top: 0;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
}
.studio-advanced :deep(.el-collapse-item__header) {
  font-weight: 500;
  color: #536256;
}
.studio-share-heading {
  margin-top: 28px;
}
.studio-share-heading > .el-input {
  width: 150px;
}
.studio-share-card {
  padding: 18px;
  background: #fff;
  border: 1px solid #e0e5e0;
  border-radius: 6px;
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.studio-share-card > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.studio-share-card strong {
  font-size: 15px;
  line-height: 1.6;
}
.studio-share-card p {
  font-size: 12px;
  line-height: 1.7;
  color: #69726d;
  margin: 6px 0 12px;
}
.studio-share-card small {
  font-size: 11px;
  color: #7b837e;
}
.studio-share-card img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .studio-presets {
    gap: 8px;
  }
  .studio-preset-art {
    padding: 12px 8px;
  }
  .studio-preset-art > strong {
    font-size: 14px;
  }
  .studio-preset-label {
    padding: 10px 6px;
    font-size: 11px;
  }
  .studio-preset-label i {
    display: none;
  }
  .studio-options {
    gap: 12px 18px;
  }
}
.studio-preset-art {
  width: 100%;
  height: 240px;
  aspect-ratio: auto;
  max-height: 240px;
}
.studio-preset-art img {
  object-fit: fill;
}
@media (max-width: 640px) {
  .studio-preset-art {
    height: 180px;
    max-height: 180px;
  }
}
</style>
