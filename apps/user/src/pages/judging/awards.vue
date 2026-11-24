<template>
  <view class="awards">
    <text class="title">{{ title }}</text>
    <text>{{ hint }}</text>
    <view v-for="group in groups" :key="group.label" class="block">
      <text class="head">{{ group.label }}</text>
      <view v-for="(row, i) in group.items" :key="i" class="line">
        <text v-for="(value, k) in row" :key="k">
          {{ awardFieldOptions[k as AwardField] }}　{{ value }}　
        </text>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { awardFieldOptions, type AwardField } from "@conference/shared";
import { request } from "@/services/request";
const title = ref("颁奖名单"),
  hint = ref("正在查询"),
  groups = ref<{ label: string; items: Record<string, string | number>[] }[]>([]);
onLoad(async (q: any) => {
  try {
    const v = await request<{
      title: string;
      edition: number;
      teachers: Record<string, string | number>[];
      merits: Record<string, string | number>[];
      schools: Record<string, string | number>[];
    }>("/judging/" + encodeURIComponent(String(q?.event || "")) + "/published", { auth: false });
    title.value = v.title;
    hint.value = "已公布 · 第 " + v.edition + " 版";
    groups.value = [
      { label: "总决赛教师", items: v.teachers },
      { label: "优秀奖", items: v.merits },
      { label: "教学示范校", items: v.schools }
    ];
  } catch {
    hint.value = "组委会尚未公布此份名单";
  }
});
</script>
<style scoped>
.awards {
  padding: 24px;
  color: #213931;
}
.title,
.head {
  display: block;
  font-weight: 700;
  font-size: 23px;
}
.head {
  font-size: 18px;
}
.block {
  margin: 24px 0;
}
.line {
  padding: 10px 0;
  border-bottom: 1px solid #dae2dc;
}
</style>
