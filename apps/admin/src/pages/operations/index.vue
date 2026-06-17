<template>
  <section class="admin-page">
    <AdminPageHeader title="运营闭环" eyebrow="PR3-PR9" subtitle="库存预警、客户群运营、AI 知识库、券活动、签到、退款发票和财务对账。">
      <template #actions>
        <el-button @click="loadAll">刷新</el-button>
      </template>
    </AdminPageHeader>

    <el-tabs v-model="tab">
      <el-tab-pane label="库存预警" name="inventory">
        <section class="table-panel actions-panel">
          <el-input v-model="conferenceId" placeholder="会议 ID" />
          <el-input-number v-model="inventoryForm.thresholdRemaining" :min="0" />
          <el-switch v-model="inventoryForm.enabled" active-text="启用" />
          <el-button type="primary" @click="saveInventoryRule">保存规则</el-button>
          <el-button @click="scanInventory">扫描</el-button>
        </section>
        <SimpleTable :items="inventoryLogs" />
      </el-tab-pane>

      <el-tab-pane label="企业微信客户群" name="groups">
        <section class="table-panel actions-panel">
          <el-input v-model="groupForm.name" placeholder="客户群名称" />
          <el-input v-model="groupForm.ownerName" placeholder="群主" />
          <el-button type="primary" @click="saveGroup">新增客户群</el-button>
          <el-button @click="syncGroups">官方同步</el-button>
        </section>
        <section class="table-panel actions-panel">
          <el-input v-model="groupTaskForm.name" placeholder="群发任务名称" />
          <el-input v-model="groupTaskForm.contentText" type="textarea" :rows="3" placeholder='{"text":"内容"}' />
          <el-button type="primary" @click="saveGroupTask">创建任务</el-button>
        </section>
        <SimpleTable :items="groupTasks" />
      </el-tab-pane>

      <el-tab-pane label="AI 知识库" name="ai">
        <section class="table-panel actions-panel">
          <el-input v-model="conferenceId" placeholder="会议 ID" />
          <el-input v-model="kbForm.title" placeholder="文档标题" />
          <el-input v-model="kbForm.contentText" type="textarea" :rows="5" placeholder="会议资料文本" />
          <el-button type="primary" @click="saveKnowledgeDocument">新增文档</el-button>
        </section>
        <pre class="json-panel">{{ knowledgeBase }}</pre>
      </el-tab-pane>

      <el-tab-pane label="券活动" name="coupons">
        <section class="table-panel actions-panel">
          <el-input v-model="campaignForm.name" placeholder="活动名称" />
          <el-input v-model="campaignForm.couponIdsText" placeholder="优惠券 ID，逗号分隔" />
          <el-button type="primary" @click="saveCampaign">创建活动批次</el-button>
          <el-button :disabled="!campaignId" @click="genCampaignQr">生成二维码信息</el-button>
        </section>
        <pre class="json-panel">{{ campaignQr }}</pre>
      </el-tab-pane>

      <el-tab-pane label="签到" name="checkin">
        <section class="table-panel actions-panel">
          <el-input v-model="checkinCredential" placeholder="报名号或凭证码" />
          <el-button type="primary" @click="doVerifyCheckin">扫码/凭证核销</el-button>
        </section>
        <pre class="json-panel">{{ checkinStats }}</pre>
        <SimpleTable :items="checkinLogs" />
      </el-tab-pane>

      <el-tab-pane label="退款发票" name="refunds">
        <section class="table-panel actions-panel">
          <el-input v-model="refundForm.orderNo" placeholder="订单号" />
          <el-input-number v-model="refundForm.amountCent" :min="0" />
          <el-button type="primary" @click="saveRefund">申请退款</el-button>
        </section>
        <SimpleTable :items="refunds" />
        <SimpleTable :items="invoices" />
      </el-tab-pane>

      <el-tab-pane label="财务对账" name="finance">
        <section class="table-panel actions-panel">
          <el-date-picker v-model="billDate" value-format="YYYY-MM-DD" type="date" placeholder="账单日期" />
          <el-button type="primary" @click="saveBill">创建账单</el-button>
        </section>
        <SimpleTable :items="wechatBills" />
        <SimpleTable :items="reconciliationResults" />
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import {
  createCouponCampaign,
  createCustomerGroup,
  createCustomerGroupMessageTask,
  createKnowledgeDocument,
  createRefund,
  createWechatBill,
  generateCouponCampaignQr,
  getCheckinStats,
  getInventoryAlertRule,
  getKnowledgeBase,
  listCheckinLogs,
  listCustomerGroupMessageTasks,
  listInventoryAlertLogs,
  listInvoices,
  listReconciliationResults,
  listRefunds,
  listWechatBills,
  scanInventoryAlerts,
  syncCustomerGroupsFromWecom,
  updateInventoryAlertRule,
  verifyCheckin
} from "../../services/admin";

const tab = ref("inventory");
const conferenceId = ref("");
const campaignId = ref("");
const billDate = ref(new Date().toISOString().slice(0, 10));
const checkinCredential = ref("");
const inventoryLogs = ref<Record<string, unknown>[]>([]);
const groupTasks = ref<Record<string, unknown>[]>([]);
const knowledgeBase = ref<Record<string, unknown> | null>(null);
const campaignQr = ref<Record<string, unknown> | null>(null);
const checkinStats = ref<Record<string, unknown> | null>(null);
const checkinLogs = ref<Record<string, unknown>[]>([]);
const refunds = ref<Record<string, unknown>[]>([]);
const invoices = ref<Record<string, unknown>[]>([]);
const wechatBills = ref<Record<string, unknown>[]>([]);
const reconciliationResults = ref<Record<string, unknown>[]>([]);
const inventoryForm = reactive({ enabled: false, thresholdRemaining: 10 });
const groupForm = reactive({ name: "", ownerName: "" });
const groupTaskForm = reactive({ name: "", contentText: "{\"text\":\"\"}" });
const kbForm = reactive({ title: "", contentText: "" });
const campaignForm = reactive({ name: "", couponIdsText: "" });
const refundForm = reactive({ orderNo: "", amountCent: 0 });

const SimpleTable = defineComponent({
  props: { items: { type: Array, required: true } },
  setup(props) {
    return () => h("pre", { class: "json-panel" }, JSON.stringify(props.items, null, 2));
  }
});

onMounted(() => void loadAll());

async function loadAll() {
  const [inventory, tasks, stats, logs, refundData, invoiceData, bills, results] = await Promise.all([
    listInventoryAlertLogs({ page: 1, pageSize: 20 }),
    listCustomerGroupMessageTasks({ page: 1, pageSize: 20 }),
    getCheckinStats(),
    listCheckinLogs({ page: 1, pageSize: 20 }),
    listRefunds({ page: 1, pageSize: 20 }),
    listInvoices({ page: 1, pageSize: 20 }),
    listWechatBills(),
    listReconciliationResults({ page: 1, pageSize: 20 })
  ]);
  inventoryLogs.value = inventory.items;
  groupTasks.value = tasks.items;
  checkinStats.value = stats;
  checkinLogs.value = logs.items;
  refunds.value = refundData.items;
  invoices.value = invoiceData.items;
  wechatBills.value = bills.items;
  reconciliationResults.value = results.items;
}

async function saveInventoryRule() {
  if (!conferenceId.value) return ElMessage.warning("请填写会议 ID");
  await updateInventoryAlertRule(conferenceId.value, inventoryForm);
  await getInventoryAlertRule(conferenceId.value);
  ElMessage.success("库存预警规则已保存");
}

async function scanInventory() {
  await scanInventoryAlerts();
  await loadAll();
  ElMessage.success("库存扫描已触发");
}

async function saveGroup() {
  await createCustomerGroup(groupForm);
  Object.assign(groupForm, { name: "", ownerName: "" });
  ElMessage.success("客户群已创建");
}

async function syncGroups() {
  const result = await syncCustomerGroupsFromWecom();
  ElMessage.info(JSON.stringify(result));
}

async function saveGroupTask() {
  const created = await createCustomerGroupMessageTask({ name: groupTaskForm.name, contentJson: parseJson(groupTaskForm.contentText) });
  if (typeof created.id === "string") {
    // 只创建企业微信客户群任务，不做内部群机器人。
  }
  await loadAll();
  ElMessage.success("客户群任务已创建");
}

async function saveKnowledgeDocument() {
  if (!conferenceId.value) return ElMessage.warning("请填写会议 ID");
  await createKnowledgeDocument(conferenceId.value, kbForm);
  knowledgeBase.value = await getKnowledgeBase(conferenceId.value);
  ElMessage.success("知识库文档已保存");
}

async function saveCampaign() {
  const created = await createCouponCampaign({ name: campaignForm.name, couponIds: campaignForm.couponIdsText.split(",").map((item) => item.trim()).filter(Boolean) });
  campaignId.value = String(created.id || "");
  ElMessage.success("券活动已创建");
}

async function genCampaignQr() {
  campaignQr.value = await generateCouponCampaignQr(campaignId.value);
}

async function doVerifyCheckin() {
  await verifyCheckin({ credentialCode: checkinCredential.value });
  await loadAll();
  ElMessage.success("核销完成");
}

async function saveRefund() {
  await createRefund(refundForm);
  await loadAll();
  ElMessage.success("退款申请已创建");
}

async function saveBill() {
  await createWechatBill({ billDate: billDate.value });
  await loadAll();
  ElMessage.success("账单已创建");
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
</script>

<style scoped>
.actions-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.actions-panel .el-input {
  max-width: 260px;
}

.json-panel {
  max-height: 360px;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
}
</style>
