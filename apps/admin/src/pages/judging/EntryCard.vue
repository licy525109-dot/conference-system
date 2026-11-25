<template>
  <section class="j-entry-card" aria-labelledby="judging-entry-title">
    <div v-if="url" class="j-entry-code" aria-live="polite">
      <img v-if="qr" :src="qr" width="168" height="168" alt="本赛事统一评分二维码" />
      <span v-else>{{ qrError || "正在生成二维码…" }}</span>
    </div>
    <div class="j-entry-copy">
      <div class="j-entry-title">
        <h3 id="judging-entry-title">评委评分入口</h3>
        <span class="j-entry-state">{{ url ? "已发布" : "未发布" }}</span>
        <el-button v-if="canDesign" @click="emit('design')">设计评分入口</el-button>
      </div>
      <p>把同一个二维码或链接发给全体评委。评委用手机打开，输入名单中的姓名，即可进入自己的场次。</p>
      <template v-if="url">
        <label class="j-share-label" for="judging-share-url">可转发的评分链接</label>
        <input
          id="judging-share-url"
          ref="field"
          class="j-share-url"
          :value="url"
          readonly
          @focus="field?.select()"
        />
        <div class="j-tools">
          <el-button type="primary" @click="copy">复制评分链接</el-button>
          <el-button :disabled="!qr" @click="download">下载二维码</el-button>
          <a :href="url" target="_blank" rel="noopener noreferrer">打开评分页</a>
        </div>
        <el-button v-if="canPublish" link class="j-retire-entry" @click="close">停用入口</el-button>
      </template>
      <el-button
        v-else-if="canPublish && activePhase"
        type="primary"
        :loading="busy"
        @click="operate('entry-open')"
      >
        发布评分入口
      </el-button>
      <p v-else class="j-note">{{ activePhase ? "请由本场赛事的场控发布入口。" : "赛事已进入确认阶段。" }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import QRCode from "qrcode";
import { guestScoringPath } from "@conference/shared";
import { judgingH5Origin, type EventDetail, type Operate } from "../../services/judging";

const props = defineProps<{
  event: EventDetail;
  canPublish: boolean;
  canDesign: boolean;
  busy: boolean;
  operate: Operate;
}>();
const emit = defineEmits<{ (e: "design"): void }>();
const activePhase = computed(() => ["SETUP", "LIVE", "REVIEW"].includes(props.event.phase));
const url = computed(() => {
  if (!props.event.entryCode) return "";
  return judgingH5Origin + "/#/" + guestScoringPath(props.event.id, props.event.entryCode);
});
const qr = ref(""),
  qrError = ref(""),
  field = ref<HTMLInputElement>();
watch(
  url,
  async (value, _, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    qr.value = "";
    qrError.value = "";
    if (!value) return;
    try {
      const image = await QRCode.toDataURL(value, { width: 960, margin: 4, errorCorrectionLevel: "M" });
      if (current) qr.value = image;
    } catch {
      if (current) qrError.value = "二维码生成失败，可使用右侧链接";
    }
  },
  { immediate: true }
);
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    ElMessage.success("已复制，可发给全体评委");
  } catch {
    field.value?.focus();
    field.value?.select();
    ElMessage.info("已选中评分链接，请复制后转发");
  }
}
function download() {
  if (!qr.value) return;
  const a = document.createElement("a");
  a.href = qr.value;
  a.download = props.event.title.replace(/[\\/:*?"<>|]/g, "_") + "-评委统一评分二维码.png";
  a.click();
}
async function close() {
  try {
    await ElMessageBox.confirm(
      "已发出的二维码和链接将立即失效。再次发布会生成新入口。",
      "停用本赛事评分入口",
      { confirmButtonText: "停用入口", cancelButtonText: "保留入口" }
    );
  } catch {
    return;
  }
  await props.operate("entry-close");
}
</script>
