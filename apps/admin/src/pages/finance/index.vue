<template>
  <section class="admin-page">
    <AdminPageHeader
      :title="pageTitle"
      eyebrow="财务管理"
      :subtitle="pageSubtitle"
    >
      <AdminFeatureBadge
        v-if="activeSection === 'invoices'"
        label="人工开票流程"
        description="当前不直连电子发票平台，后台只记录审核、驳回、开票号和发票链接。"
        tone="info"
      />
      <AdminFeatureBadge
        v-if="activeSection === 'wechat-bills'"
        label="官方下载可选"
        description="未配置微信账单下载时只允许手动导入，不伪造下载成功。"
        tone="info"
      />
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <div v-if="overview" class="admin-stat-grid">
      <AdminStatCard v-for="item in cards" :key="item.label" :label="item.label" :value="item.value" :tone="item.tone" />
    </div>

    <AdminSectionCard v-if="activeSection === 'payments' || activeSection === 'home'" title="支付流水" subtitle="报名支付和商城支付统一只读查询，不允许后台人工改支付成功。">
      <AdminFilterBar>
        <el-input v-model="paymentFilters.keyword" clearable placeholder="订单号 / 商户单号 / 微信单号 / 用户" style="width: 300px" @keyup.enter="loadPayments" />
        <el-select v-model="paymentFilters.sourceType" placeholder="来源" style="width: 140px">
          <el-option label="全部" value="ALL" />
          <el-option label="报名" value="REGISTRATION" />
          <el-option label="商城" value="MALL" />
        </el-select>
        <el-select v-model="paymentFilters.status" clearable placeholder="支付状态" style="width: 140px">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="待支付" value="PENDING" />
          <el-option label="失败" value="FAILED" />
          <el-option label="关闭" value="CLOSED" />
        </el-select>
        <el-select v-model="paymentFilters.provider" clearable placeholder="渠道" style="width: 120px">
          <el-option label="微信" value="WECHAT" />
          <el-option label="Mock" value="MOCK" />
        </el-select>
        <template #actions>
          <el-button type="primary" @click="loadPayments">查询</el-button>
        </template>
      </AdminFilterBar>
      <el-table v-loading="paymentsLoading" :data="payments" empty-text="暂无支付流水">
        <el-table-column label="来源" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.sourceType" :label="sourceText(row.sourceType)" /></template></el-table-column>
        <el-table-column prop="orderNo" label="订单号" min-width="160" />
        <el-table-column prop="businessTitle" label="业务摘要" min-width="180" show-overflow-tooltip />
        <el-table-column prop="provider" label="渠道" width="100" />
        <el-table-column label="支付状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="statusText(row.status)" /></template></el-table-column>
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        <el-table-column prop="outTradeNo" label="商户单号" min-width="190" show-overflow-tooltip />
        <el-table-column prop="transactionId" label="微信交易号 / mock 标识" min-width="190" show-overflow-tooltip />
        <el-table-column label="退款" width="110"><template #default="{ row }">{{ statusText(row.refundStatus) }}</template></el-table-column>
        <el-table-column label="对账" width="120"><template #default="{ row }">{{ statusText(row.reconciliationStatus) }}</template></el-table-column>
        <el-table-column prop="paidAt" label="支付时间" width="190" />
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :page-size="paymentFilters.pageSize" :current-page="paymentFilters.page" :total="paymentTotal" @current-change="(page: number) => { paymentFilters.page = page; void loadPayments(); }" />
    </AdminSectionCard>

    <AdminSectionCard v-if="activeSection === 'refunds'" title="退款管理" subtitle="报名退款与商城退款统一审核，微信未配置时进入处理中并记录原因，不会伪造到账。">
      <AdminFilterBar>
        <el-input v-model="refundFilters.keyword" clearable placeholder="订单号 / 退款号 / 商户退款号" style="width: 300px" @keyup.enter="loadRefunds" />
        <el-select v-model="refundFilters.sourceType" placeholder="来源" style="width: 140px">
          <el-option label="全部" value="ALL" />
          <el-option label="报名" value="REGISTRATION" />
          <el-option label="商城" value="MALL" />
        </el-select>
        <el-select v-model="refundFilters.status" clearable placeholder="退款状态" style="width: 150px">
          <el-option v-for="item in refundStatuses" :key="item" :label="statusText(item)" :value="item" />
        </el-select>
        <template #actions>
          <el-button @click="loadRefunds">查询</el-button>
        </template>
      </AdminFilterBar>
      <div class="inline-form">
        <el-select v-model="refundForm.sourceType" style="width: 130px">
          <el-option label="报名" value="REGISTRATION" />
          <el-option label="商城" value="MALL" />
        </el-select>
        <el-input v-model="refundForm.orderNo" placeholder="已支付订单号" style="width: 220px" />
        <el-input-number v-model="refundForm.amountYuan" :min="0" :precision="2" placeholder="退款金额" />
        <el-input v-model="refundForm.reason" placeholder="退款原因" style="width: 260px" />
        <el-button type="primary" @click="createRefundRequest">创建退款申请</el-button>
      </div>
      <el-table v-loading="refundsLoading" :data="refunds" empty-text="暂无退款记录">
        <el-table-column label="来源" width="90"><template #default="{ row }">{{ sourceText(row.sourceType) }}</template></el-table-column>
        <el-table-column prop="refundNo" label="退款号" min-width="150" />
        <el-table-column prop="orderNo" label="订单号" min-width="160" />
        <el-table-column prop="businessTitle" label="业务摘要" min-width="160" show-overflow-tooltip />
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="statusText(row.status)" /></template></el-table-column>
        <el-table-column prop="provider" label="渠道" width="100" />
        <el-table-column prop="failedReason" label="失败 / 处理说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="申请时间" width="190" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'REQUESTED'" size="small" type="primary" @click="approveRefundRow(row.id)">通过</el-button>
            <el-button v-if="row.status === 'REQUESTED' || row.status === 'APPROVED'" size="small" @click="rejectRefundRow(row.id)">驳回</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :page-size="refundFilters.pageSize" :current-page="refundFilters.page" :total="refundTotal" @current-change="(page: number) => { refundFilters.page = page; void loadRefunds(); }" />
    </AdminSectionCard>

    <AdminSectionCard v-if="activeSection === 'invoices'" title="发票申请" subtitle="用户申请金额由后端按已支付订单计算；当前为人工开票流程。">
      <AdminFilterBar>
        <el-input v-model="invoiceFilters.keyword" clearable placeholder="订单号 / 发票申请号 / 抬头 / 税号" style="width: 320px" @keyup.enter="loadInvoices" />
        <el-select v-model="invoiceFilters.sourceType" placeholder="来源" style="width: 140px">
          <el-option label="全部" value="ALL" />
          <el-option label="报名" value="REGISTRATION" />
          <el-option label="商城" value="MALL" />
        </el-select>
        <el-select v-model="invoiceFilters.status" clearable placeholder="发票状态" style="width: 150px">
          <el-option v-for="item in invoiceStatuses" :key="item" :label="statusText(item)" :value="item" />
        </el-select>
        <template #actions>
          <el-button @click="loadInvoices">查询</el-button>
        </template>
      </AdminFilterBar>
      <el-table v-loading="invoicesLoading" :data="invoices" empty-text="暂无发票申请">
        <el-table-column label="来源" width="90"><template #default="{ row }">{{ sourceText(row.sourceType) }}</template></el-table-column>
        <el-table-column prop="invoiceNo" label="申请号" min-width="150" />
        <el-table-column prop="orderNo" label="订单号" min-width="160" />
        <el-table-column prop="title" label="抬头" min-width="180" show-overflow-tooltip />
        <el-table-column prop="taxNo" label="税号" min-width="160" show-overflow-tooltip />
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="statusText(row.status)" /></template></el-table-column>
        <el-table-column prop="issuedInvoiceNo" label="开票号" min-width="150" />
        <el-table-column prop="rejectReason" label="驳回原因" min-width="160" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="申请时间" width="190" />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'REQUESTED'" size="small" type="primary" @click="approveInvoiceRow(row.id)">通过</el-button>
            <el-button v-if="row.status === 'REQUESTED' || row.status === 'APPROVED'" size="small" @click="rejectInvoiceRow(row.id)">驳回</el-button>
            <el-button v-if="row.status === 'APPROVED'" size="small" type="success" @click="openIssueDialog(row.id)">开票</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :page-size="invoiceFilters.pageSize" :current-page="invoiceFilters.page" :total="invoiceTotal" @current-change="(page: number) => { invoiceFilters.page = page; void loadInvoices(); }" />
    </AdminSectionCard>

    <AdminSectionCard v-if="activeSection === 'wechat-bills'" title="微信账单" subtitle="支持手动导入 CSV/TXT 账单并落库解析；官方下载未配置时只记录跳过原因。">
      <div class="inline-form">
        <el-date-picker v-model="billForm.billDate" type="date" value-format="YYYY-MM-DD" placeholder="账单日期" />
        <el-select v-model="billForm.billType" style="width: 140px">
          <el-option label="交易账单" value="TRADE" />
          <el-option label="资金账单" value="FUND_FLOW" />
        </el-select>
        <el-button type="primary" @click="createBill">创建账单批次</el-button>
      </div>
      <el-input v-model="billImportText" type="textarea" :rows="5" placeholder="粘贴微信支付 CSV/TXT 账单内容，需包含商户订单号、微信支付订单号、金额、交易状态等字段。" />
      <div class="inline-actions">
        <el-button :disabled="!selectedBillId" @click="importSelectedBill">导入到选中账单</el-button>
      </div>
      <el-table v-loading="billsLoading" :data="bills" highlight-current-row empty-text="暂无微信账单" @current-change="(row: any) => { selectedBillId = row?.id || ''; if (row?.billDate) billForm.billDate = row.billDate; if (row?.billType) billForm.billType = row.billType; }">
        <el-table-column prop="billDate" label="账单日期" width="130" />
        <el-table-column prop="billType" label="类型" width="120" />
        <el-table-column label="状态" width="140"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="statusText(row.status)" /></template></el-table-column>
        <el-table-column prop="storagePath" label="文件 / 导入来源" min-width="220" show-overflow-tooltip />
        <el-table-column label="行数" width="90"><template #default="{ row }">{{ readRowCount(row) }}</template></el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="190" />
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="downloadBill(row.id)">下载</el-button>
            <el-button size="small" type="primary" @click="reconcileBill(row.id)">对账</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :page-size="billFilters.pageSize" :current-page="billFilters.page" :total="billTotal" @current-change="(page: number) => { billFilters.page = page; void loadBills(); }" />
    </AdminSectionCard>

    <AdminSectionCard v-if="activeSection === 'reconciliation' || activeSection === 'home'" title="财务对账" subtitle="对账只记录差异和核查备注，不自动改订单或支付状态。">
      <AdminFilterBar>
        <el-input v-model="reconciliationFilters.keyword" clearable placeholder="订单号 / 商户单号 / 微信单号" style="width: 300px" @keyup.enter="loadReconciliationResults" />
        <el-select v-model="reconciliationFilters.status" placeholder="核查状态" style="width: 140px">
          <el-option label="全部" value="ALL" />
          <el-option label="待核查" value="OPEN" />
          <el-option label="已核查" value="REVIEWED" />
          <el-option label="已匹配" value="RESOLVED" />
        </el-select>
        <el-select v-model="reconciliationFilters.type" clearable placeholder="差异类型" style="width: 180px">
          <el-option v-for="item in reconciliationTypes" :key="item" :label="statusText(item)" :value="item" />
        </el-select>
        <template #actions>
          <el-button @click="loadReconciliationResults">查询</el-button>
          <el-button type="primary" @click="createLocalBatch">生成本地批次</el-button>
        </template>
      </AdminFilterBar>
      <el-table v-loading="reconciliationLoading" :data="reconciliationResults" empty-text="暂无对账结果">
        <el-table-column prop="billDate" label="账单日期" width="120" />
        <el-table-column prop="type" label="类型" min-width="150"><template #default="{ row }">{{ statusText(row.type) }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="statusText(row.status)" /></template></el-table-column>
        <el-table-column prop="orderNo" label="订单号" min-width="160" />
        <el-table-column prop="outTradeNo" label="商户单号" min-width="190" show-overflow-tooltip />
        <el-table-column label="系统金额" width="110"><template #default="{ row }">{{ row.localAmountCent === null ? "-" : `¥${formatCent(row.localAmountCent)}` }}</template></el-table-column>
        <el-table-column label="账单金额" width="110"><template #default="{ row }">{{ row.remoteAmountCent === null ? "-" : `¥${formatCent(row.remoteAmountCent)}` }}</template></el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="190" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'OPEN'" size="small" @click="markReviewed(row.id)">核查</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :page-size="reconciliationFilters.pageSize" :current-page="reconciliationFilters.page" :total="reconciliationTotal" @current-change="(page: number) => { reconciliationFilters.page = page; void loadReconciliationResults(); }" />
    </AdminSectionCard>

    <el-dialog v-model="issueDialog.visible" title="标记已开票" width="520px">
      <el-form label-width="90px">
        <el-form-item label="开票号码"><el-input v-model="issueDialog.issuedInvoiceNo" placeholder="人工开票号" /></el-form-item>
        <el-form-item label="发票链接"><el-input v-model="issueDialog.invoiceLink" placeholder="PDF 或图片链接（选填）" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="issueDialog.remark" type="textarea" :rows="3" placeholder="开票备注（选填）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="issueDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitIssueInvoice">确认开票</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatCard from "../../components/AdminStatCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { currentRoute } from "../../router";
import {
  approveInvoice,
  approveRefund,
  createFinanceBatch,
  createRefund,
  createWechatBill,
  downloadWechatBill,
  getFinanceOverview,
  importWechatBill,
  listFinancePayments,
  listInvoices,
  listReconciliationResults,
  listRefunds,
  listWechatBills,
  markInvoiceIssued,
  markReconciliationReviewed,
  reconcileWechatBill,
  rejectInvoice,
  rejectRefund
} from "../../services/admin";
import type { FinanceInvoice, FinanceOverview, FinancePayment, FinanceRefund, ReconciliationResult, WechatBill } from "../../services/types";

const overview = ref<FinanceOverview | null>(null);
const loading = ref(false);
const paymentsLoading = ref(false);
const refundsLoading = ref(false);
const invoicesLoading = ref(false);
const billsLoading = ref(false);
const reconciliationLoading = ref(false);
const payments = ref<FinancePayment[]>([]);
const refunds = ref<FinanceRefund[]>([]);
const invoices = ref<FinanceInvoice[]>([]);
const bills = ref<WechatBill[]>([]);
const reconciliationResults = ref<ReconciliationResult[]>([]);
const paymentTotal = ref(0);
const refundTotal = ref(0);
const invoiceTotal = ref(0);
const billTotal = ref(0);
const reconciliationTotal = ref(0);
const selectedBillId = ref("");
const billImportText = ref("");

const paymentFilters = reactive({ page: 1, pageSize: 20, keyword: "", sourceType: "ALL", status: "", provider: "" });
const refundFilters = reactive({ page: 1, pageSize: 20, keyword: "", sourceType: "ALL", status: "" });
const invoiceFilters = reactive({ page: 1, pageSize: 20, keyword: "", sourceType: "ALL", status: "" });
const billFilters = reactive({ page: 1, pageSize: 20, status: "" });
const reconciliationFilters = reactive({ page: 1, pageSize: 20, keyword: "", status: "ALL", type: "" });
const refundForm = reactive({ sourceType: "REGISTRATION", orderNo: "", amountYuan: 0, reason: "" });
const billForm = reactive({ billDate: new Date().toISOString().slice(0, 10), billType: "TRADE" });
const issueDialog = reactive({ visible: false, id: "", issuedInvoiceNo: "", invoiceLink: "", remark: "" });

const refundStatuses = ["REQUESTED", "APPROVED", "PROCESSING", "SUCCESS", "FAILED", "REJECTED"];
const invoiceStatuses = ["REQUESTED", "APPROVED", "ISSUED", "REJECTED"];
const reconciliationTypes = ["MATCHED", "SYSTEM_ONLY", "WECHAT_ONLY", "AMOUNT_MISMATCH", "STATUS_MISMATCH", "TIME_MISMATCH", "DUPLICATE"];

const activeSection = computed(() => {
  const path = currentRoute.value.path;
  if (path.includes("refunds")) return "refunds";
  if (path.includes("invoices")) return "invoices";
  if (path.includes("wechat-bills")) return "wechat-bills";
  if (path.includes("reconciliation")) return "reconciliation";
  if (path.includes("payments") || path.includes("payment-records")) return "payments";
  return "home";
});
const pageTitle = computed(() => currentRoute.value.title || "财务管理");
const pageSubtitle = computed(() => {
  const map: Record<string, string> = {
    payments: "统一查询报名 Payment 与商城 MallPayment，只读展示，不允许人工改成功状态。",
    refunds: "统一处理报名和商城退款，mock 可完成，微信退款待配置和回调确认。",
    invoices: "用户基于已支付报名或商城订单申请发票，后台人工审核和开票。",
    "wechat-bills": "支持手动导入微信账单并对账；官方下载无配置时明确跳过。",
    reconciliation: "记录 MATCHED 与差异结果，人工核查只写备注，不改订单状态。",
    home: "财务管理汇总、支付流水和对账入口。"
  };
  return map[activeSection.value] ?? map.home;
});

const cards = computed(() => {
  const data = overview.value?.cards;
  if (!data) return [];
  return [
    { label: "累计收入", value: `¥${formatCent(data.totalRevenueCent)}`, tone: "primary" as const },
    { label: "报名收入", value: `¥${formatCent(data.registrationPaidAmountCent || 0)}`, tone: "success" as const },
    { label: "商城收入", value: `¥${formatCent(data.mallPaidAmountCent || 0)}`, tone: "success" as const },
    { label: "退款金额", value: `¥${formatCent(data.refundAmountCent)}`, tone: "warning" as const },
    { label: "净收入", value: `¥${formatCent(data.netRevenueCent)}`, tone: "primary" as const },
    { label: "已支付订单", value: data.paidOrders, tone: "success" as const },
    { label: "待支付订单", value: data.pendingOrders, tone: "warning" as const },
    { label: "报名数", value: data.registrationCount, tone: "default" as const }
  ];
});

onMounted(() => void load());
watch(activeSection, () => void load());

async function load() {
  loading.value = true;
  try {
    overview.value = await getFinanceOverview();
    if (activeSection.value === "payments" || activeSection.value === "home") await loadPayments();
    if (activeSection.value === "refunds") await loadRefunds();
    if (activeSection.value === "invoices") await loadInvoices();
    if (activeSection.value === "wechat-bills") await loadBills();
    if (activeSection.value === "reconciliation" || activeSection.value === "home") await loadReconciliationResults();
  } finally {
    loading.value = false;
  }
}

async function loadPayments() {
  paymentsLoading.value = true;
  try {
    const data = await listFinancePayments(paymentFilters);
    payments.value = data.items;
    paymentTotal.value = data.total;
  } finally {
    paymentsLoading.value = false;
  }
}

async function loadRefunds() {
  refundsLoading.value = true;
  try {
    const data = await listRefunds(refundFilters);
    refunds.value = data.items;
    refundTotal.value = data.total;
  } finally {
    refundsLoading.value = false;
  }
}

async function loadInvoices() {
  invoicesLoading.value = true;
  try {
    const data = await listInvoices(invoiceFilters);
    invoices.value = data.items;
    invoiceTotal.value = data.total;
  } finally {
    invoicesLoading.value = false;
  }
}

async function loadBills() {
  billsLoading.value = true;
  try {
    const data = await listWechatBills(billFilters);
    bills.value = data.items;
    billTotal.value = data.total;
  } finally {
    billsLoading.value = false;
  }
}

async function loadReconciliationResults() {
  reconciliationLoading.value = true;
  try {
    const data = await listReconciliationResults(reconciliationFilters);
    reconciliationResults.value = data.items;
    reconciliationTotal.value = data.total;
  } finally {
    reconciliationLoading.value = false;
  }
}

async function createRefundRequest() {
  if (!refundForm.orderNo.trim()) {
    ElMessage.warning("请填写订单号");
    return;
  }
  await createRefund({
    sourceType: refundForm.sourceType,
    orderNo: refundForm.orderNo.trim(),
    amountCent: Math.round(refundForm.amountYuan * 100),
    reason: refundForm.reason
  });
  ElMessage.success("退款申请已创建");
  refundForm.orderNo = "";
  refundForm.amountYuan = 0;
  refundForm.reason = "";
  await loadRefunds();
}

async function approveRefundRow(id: string) {
  await ElMessageBox.confirm("确认通过退款？mock 退款会立即成功，微信退款未配置时只进入处理中。", "确认退款", { type: "warning" });
  await approveRefund(id);
  ElMessage.success("退款已处理");
  await loadRefunds();
}

async function rejectRefundRow(id: string) {
  const { value } = await ElMessageBox.prompt("请输入驳回原因", "驳回退款", { inputPlaceholder: "原因会展示给用户" });
  await rejectRefund(id, value || "");
  ElMessage.success("退款已驳回");
  await loadRefunds();
}

async function approveInvoiceRow(id: string) {
  await approveInvoice(id);
  ElMessage.success("发票申请已通过");
  await loadInvoices();
}

async function rejectInvoiceRow(id: string) {
  const { value } = await ElMessageBox.prompt("请输入驳回原因", "驳回发票", { inputPlaceholder: "原因会展示给用户" });
  await rejectInvoice(id, value || "");
  ElMessage.success("发票申请已驳回");
  await loadInvoices();
}

function openIssueDialog(id: string) {
  Object.assign(issueDialog, { visible: true, id, issuedInvoiceNo: "", invoiceLink: "", remark: "" });
}

async function submitIssueInvoice() {
  await markInvoiceIssued(issueDialog.id, {
    issuedInvoiceNo: issueDialog.issuedInvoiceNo,
    invoiceLink: issueDialog.invoiceLink,
    remark: issueDialog.remark
  });
  issueDialog.visible = false;
  ElMessage.success("已标记开票");
  await loadInvoices();
}

async function createBill() {
  await createWechatBill({ billDate: billForm.billDate, billType: billForm.billType });
  ElMessage.success("账单批次已创建");
  await loadBills();
}

async function importSelectedBill() {
  if (!selectedBillId.value) {
    ElMessage.warning("请先在表格中选中账单批次");
    return;
  }
  if (!billImportText.value.trim()) {
    ElMessage.warning("请粘贴账单文本");
    return;
  }
  await importWechatBill({ billDate: billForm.billDate, billType: billForm.billType, text: billImportText.value });
  billImportText.value = "";
  ElMessage.success("账单已导入");
  await loadBills();
}

async function downloadBill(id: string) {
  const result = await downloadWechatBill(id);
  ElMessage[result.skippedReason ? "warning" : "success"](result.skippedReason || "账单下载请求已记录");
  await loadBills();
}

async function reconcileBill(id: string) {
  await reconcileWechatBill(id);
  ElMessage.success("对账已完成");
  await Promise.all([loadBills(), loadReconciliationResults()]);
}

async function createLocalBatch() {
  await createFinanceBatch({ sourceType: "ALL" });
  ElMessage.success("本地对账批次已生成");
  await loadReconciliationResults();
}

async function markReviewed(id: string) {
  const { value } = await ElMessageBox.prompt("请输入核查备注", "标记已核查", { inputPlaceholder: "只记录备注，不会修改订单状态" });
  await markReconciliationReviewed(id, value || "");
  ElMessage.success("已标记核查");
  await loadReconciliationResults();
}

function readRowCount(row: WechatBill) {
  const summary = row.summaryJson;
  return typeof summary?.rowCount === "number" ? summary.rowCount : "-";
}

function formatCent(value: number | null | undefined) {
  return ((value || 0) / 100).toFixed(2);
}

function sourceText(value: string) {
  return { REGISTRATION: "报名", MALL: "商城", ALL: "全部" }[value] ?? value;
}

function statusText(value?: string | null) {
  if (!value) return "-";
  return {
    SUCCESS: "成功",
    PENDING: "待支付",
    FAILED: "失败",
    CLOSED: "关闭",
    REQUESTED: "待审核",
    APPROVED: "已通过",
    PROCESSING: "处理中",
    REJECTED: "已驳回",
    ISSUED: "已开票",
    CREATED: "已创建",
    IMPORTED: "已导入",
    DOWNLOADED: "已下载",
    DOWNLOAD_SKIPPED: "下载跳过",
    DOWNLOAD_REQUESTED: "请求下载",
    RECONCILED: "已对账",
    OPEN: "待核查",
    REVIEWED: "已核查",
    RESOLVED: "已匹配",
    UNRECONCILED: "未对账",
    MATCHED: "匹配",
    SYSTEM_ONLY: "系统有账单无",
    WECHAT_ONLY: "账单有系统无",
    AMOUNT_MISMATCH: "金额不一致",
    STATUS_MISMATCH: "状态不一致",
    TIME_MISMATCH: "时间不一致",
    DUPLICATE: "重复记录"
  }[value] ?? value;
}
</script>

<style scoped>
.pager {
  justify-content: flex-end;
  margin-top: 16px;
}

.inline-form,
.inline-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
</style>
