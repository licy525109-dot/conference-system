<template>
  <el-table-column type="index" label="序号" width="72" align="center" fixed="left" class-name="admin-table-index" :index="rowNumber" />
</template>

<script setup lang="ts">
import { tableRowNumber } from "../utils/table-index";

const props = withDefaults(defineProps<{ page?: number; pageSize?: number }>(), {
  page: 1,
  pageSize: 20
});

function rowNumber(index: number) {
  return tableRowNumber(index, props.page, props.pageSize);
}
</script>
