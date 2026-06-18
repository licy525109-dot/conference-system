<template>
  <el-popover placement="top-start" :width="300" trigger="hover">
    <template #reference>
      <span class="material-spec-help" aria-label="素材规格说明">?</span>
    </template>
    <div class="material-spec-help__body">
      <strong>{{ resolved.label }}</strong>
      <dl>
        <div><dt>建议尺寸</dt><dd>{{ resolved.size }}</dd></div>
        <div><dt>支持格式</dt><dd>{{ resolved.formats }}</dd></div>
        <div><dt>最大大小</dt><dd>{{ resolved.maxSize }}</dd></div>
      </dl>
      <p>{{ resolved.tip }}</p>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { materialSpecs, type MaterialSpec, type MaterialSpecKey } from "../constants/materialSpecs";

const props = defineProps<{ specKey?: MaterialSpecKey; spec?: MaterialSpec }>();
const resolved = computed(() => props.spec ?? materialSpecs[props.specKey ?? "materialUpload"]);
</script>

<style scoped>
.material-spec-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  border-radius: 999px;
  background: #eef2f7;
  color: #476179;
  font-size: 12px;
  font-weight: 900;
  cursor: help;
  vertical-align: middle;
}

.material-spec-help__body {
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}

.material-spec-help__body strong {
  display: block;
  margin-bottom: 8px;
  color: #0f172a;
}

.material-spec-help__body dl {
  margin: 0;
}

.material-spec-help__body div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 4px;
}

.material-spec-help__body dt {
  color: #64748b;
}

.material-spec-help__body dd {
  margin: 0;
}

.material-spec-help__body p {
  margin: 8px 0 0;
  color: #64748b;
}
</style>
