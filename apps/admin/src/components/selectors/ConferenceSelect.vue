<template>
  <el-select
    :model-value="modelValue"
    clearable
    filterable
    remote
    reserve-keyword
    :remote-method="search"
    :loading="loading"
    :placeholder="placeholder"
    @update:model-value="emit('update:modelValue', String($event || ''))"
    @visible-change="(visible: boolean) => visible && ensureLoaded()"
  >
    <el-option v-for="item in options" :key="item.id" :label="item.title" :value="item.id">
      <span>{{ item.title }}</span>
      <small class="conference-select__meta">{{ item.status }}</small>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { listConferences } from "../../services/admin";
import type { Conference } from "../../services/types";

withDefaults(defineProps<{ modelValue: string; placeholder?: string }>(), {
  placeholder: "选择会议"
});

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const options = ref<Conference[]>([]);
const loading = ref(false);
let loaded = false;

onMounted(() => void ensureLoaded());

async function ensureLoaded() {
  if (loaded) return;
  await search("");
  loaded = true;
}

async function search(keyword: string) {
  loading.value = true;
  try {
    options.value = (await listConferences({ page: 1, pageSize: 30, keyword })).items;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.conference-select__meta {
  float: right;
  color: #94a3b8;
  font-size: 12px;
}
</style>
