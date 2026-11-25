<template>
  <el-button @click="open">从会议报名名单选择</el-button>
  <el-dialog v-model="visible" title="从会议报名分配评委" width="min(780px,94vw)" append-to-body>
    <div class="j-tools">
      <el-select v-model="conference" filterable placeholder="选择获授权的报名会议" @change="search">
        <el-option v-for="c in conferences" :key="c.id" :label="c.title" :value="c.id" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="报名人姓名，可缩小范围"
        style="width: 210px"
        @keyup.enter="search"
      />
      <el-button @click="search">查找</el-button>
    </div>
    <el-table :data="rows" max-height="310" @selection-change="selection = $event">
      <el-table-column type="selection" />
      <el-table-column prop="name" label="参会人" />
      <el-table-column prop="org" label="机构" />
      <el-table-column prop="id" label="报名记录编号" show-overflow-tooltip />
    </el-table>
    <div class="j-tools">
      <el-select v-model="role" style="width: 150px">
        <el-option v-for="(v, k) in roleLabels" :key="k" :value="k" :label="v" />
      </el-select>
      <el-select v-if="role !== 'expert'" v-model="room" placeholder="分配教室" style="width: 160px">
        <el-option v-for="r in config.rooms" :key="r.id" :value="r.id" :label="r.name" />
      </el-select>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!selection.length" @click="apply">
        核对并加入 {{ selection.length }} 位到草稿
      </el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { roleLabels, type JudgingConfig, type JudgeRole } from "@conference/shared";
import { judgingApi } from "../../services/judging";
const props = defineProps<{ eventId: string; config: JudgingConfig }>();
const visible = ref(false),
  conference = ref(""),
  keyword = ref(""),
  role = ref<JudgeRole>("experience"),
  room = ref(""),
  conferences = ref<{ id: string; title: string }[]>([]);
type Person = { id: string; name: string; org: string };
const rows = ref<Person[]>([]),
  selection = ref<Person[]>([]);
async function open() {
  try {
    conferences.value = await judgingApi.conferences(props.eventId);
    room.value = props.config.rooms[0]?.id || "";
    visible.value = true;
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
async function search() {
  if (!conference.value) return;
  try {
    rows.value = await judgingApi.registered(props.eventId, conference.value, keyword.value);
    selection.value = [];
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
async function apply() {
  try {
    const judges = [...props.config.judges];
    for (const p of selection.value) {
      const id = p.id + (role.value === "expert" ? "-ted" : "-class");
      if (judges.some((j) => j.id === id)) throw new Error(p.name + " 已分配此环节");
      judges.push({
        id,
        name: p.name,
        org: p.org,
        phone: "",
        userId: "",
        role: role.value,
        room: role.value === "expert" ? "" : room.value
      });
    }
    await judgingApi.validate(props.eventId, { ...props.config, judges });
    props.config.judges = judges;
    visible.value = false;
    ElMessage.success("已加入草稿，请保存赛前配置");
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
</script>
