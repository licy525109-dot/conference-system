<template>
  <section class="admin-page">
    <AdminPageHeader :title="currentRoute.title" :eyebrow="currentRoute.group" :badge="currentRoute.badge || ''" badge-tone="warning" :subtitle="currentRoute.description || ''">
      <AdminFeatureBadge :label="statusLabel" :description="statusDescription" :tone="currentRoute.badge ? 'warning' : 'success'" />
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <template v-if="section === 'inventory'">
      <AdminFilterBar>
        <el-select v-model="conferenceId" filterable placeholder="选择会议" style="width: 280px" @change="loadInventory">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <template #actions>
          <el-button type="primary" :disabled="!conferenceId" @click="saveInventoryRule">保存规则</el-button>
          <el-button :loading="submitting" @click="scanInventory">手动扫描库存</el-button>
        </template>
      </AdminFilterBar>
      <AdminSectionCard title="库存预警规则" subtitle="按会议配置阈值，扫描时会逐票种生成真实预警日志。">
        <el-form :model="inventoryRule" label-width="120px" class="inline-form">
          <el-form-item label="启用"><el-switch v-model="inventoryRule.enabled" /></el-form-item>
          <el-form-item label="剩余阈值"><el-input-number v-model="inventoryRule.thresholdRemaining" :min="0" /></el-form-item>
          <el-form-item label="提醒方式"><el-select v-model="inventoryRule.notifyMode"><el-option label="后台提醒" value="ADMIN_ONLY" /><el-option label="通知任务预留" value="NOTIFICATION_TASK" /></el-select></el-form-item>
        </el-form>
      </AdminSectionCard>
      <AdminSectionCard title="库存预警日志">
        <el-table :data="inventoryLogs" empty-text="暂无库存预警日志">
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column prop="remainingStock" label="剩余" width="90" />
          <el-table-column prop="thresholdRemaining" label="阈值" width="90" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="message" label="说明" min-width="220" />
          <el-table-column prop="createdAt" label="时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('checkin')">
      <AdminFilterBar>
        <el-input v-if="section === 'checkin-verify'" v-model="checkinCredential" placeholder="凭证码 / 报名号 / 二维码内容" style="width: 320px" @keyup.enter="verifyCredential" />
        <el-select v-model="conferenceId" clearable filterable placeholder="统计会议" style="width: 280px" @change="loadCheckin">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <template #actions>
          <el-button v-if="section === 'checkin-verify'" type="primary" :disabled="!checkinCredential" @click="verifyCredential">核销</el-button>
        </template>
      </AdminFilterBar>
      <div class="admin-stat-grid">
        <AdminStatCard label="参会人" :value="checkinTotal" />
        <AdminStatCard label="已核销" :value="checkinCheckedIn" tone="success" />
        <AdminStatCard label="待核销" :value="checkinPending" tone="warning" />
        <AdminStatCard label="无需核销" :value="checkinNotRequired" />
      </div>
      <AdminSectionCard title="签到记录" subtitle="记录扫码核销、手动核销和撤销操作。">
        <el-table :data="checkinLogs" empty-text="暂无签到记录">
          <el-table-column prop="action" label="动作" width="110" />
          <el-table-column prop="beforeStatus" label="核销前" width="110" />
          <el-table-column prop="afterStatus" label="核销后" width="110" />
          <el-table-column prop="remark" label="备注" min-width="160" />
          <el-table-column prop="createdAt" label="时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section === 'payment-exceptions'">
      <AdminFilterBar>
        <el-input v-model="keyword" placeholder="订单号 / 姓名 / 手机 / 交易号" style="width: 300px" @keyup.enter="loadPaymentExceptions" />
        <template #actions><el-button type="primary" @click="loadPaymentExceptions">查询异常</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="支付异常" subtitle="只展示和记录处理备注，不允许人工修改支付成功状态。">
        <el-table :data="paymentExceptions" empty-text="暂无支付异常">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(toNumber(row.payableAmountCent)) }}</template></el-table-column>
          <el-table-column label="异常原因" min-width="260"><template #default="{ row }">{{ exceptionText(row.exceptions) }}</template></el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section === 'payment-records'">
      <AdminFilterBar>
        <el-input v-model="keyword" placeholder="订单号 / 商户单号 / 微信单号" style="width: 300px" @keyup.enter="loadPayments" />
        <el-select v-model="paymentStatus" clearable placeholder="状态" style="width: 160px">
          <el-option label="支付成功" value="SUCCESS" /><el-option label="待支付" value="PENDING" /><el-option label="支付失败" value="FAILED" />
        </el-select>
        <template #actions><el-button type="primary" @click="loadPayments">查询流水</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="支付记录" subtitle="来自真实 payments 表，不提供人工改支付状态。">
        <el-table :data="payments" empty-text="暂无支付记录">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column prop="provider" label="渠道" width="110" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
          <el-table-column prop="transactionId" label="交易号" min-width="180" />
          <el-table-column prop="paidAt" label="支付时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section === 'coupon-campaigns'">
      <AdminFilterBar>
        <el-input v-model="campaignForm.name" placeholder="活动名称" style="width: 220px" />
        <el-select v-model="campaignForm.couponIds" multiple collapse-tags placeholder="关联优惠券" style="width: 320px">
          <el-option v-for="item in coupons" :key="item.id" :label="`${item.name} (${item.code})`" :value="item.id" />
        </el-select>
        <template #actions><el-button type="primary" :disabled="!campaignForm.name || campaignForm.couponIds.length === 0" @click="createCampaign">创建券活动</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="券活动批次" subtitle="每个批次有 claimCode 和小程序领取路径，可用于二维码领取。">
        <el-table :data="couponCampaigns" empty-text="暂无券活动">
          <el-table-column prop="name" label="活动" min-width="180" />
          <el-table-column prop="claimCode" label="领取码" min-width="150" />
          <el-table-column prop="claimedCount" label="已领取" width="90" />
          <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="Boolean(row.enabled)" /></template></el-table-column>
          <el-table-column label="优惠券" min-width="220"><template #default="{ row }">{{ couponNames(row.coupons) }}</template></el-table-column>
          <el-table-column label="操作" width="130"><template #default="{ row }"><el-button size="small" @click="showCampaignQr(String(row.id))">二维码信息</el-button></template></el-table-column>
        </el-table>
      </AdminSectionCard>
      <pre v-if="qrInfo" class="json-block">{{ qrInfo }}</pre>
    </template>

    <template v-else-if="section.startsWith('notification-config')">
      <AdminSectionCard :title="section === 'notification-config-sms' ? '短信配置' : '微信订阅消息配置'" subtitle="读取服务端 env 开关和数据库模板映射；密钥不进入前端。">
        <el-descriptions v-if="channelConfig" :column="2" border>
          <el-descriptions-item label="通道">{{ channelConfig.channel }}</el-descriptions-item>
          <el-descriptions-item label="启用状态">{{ channelConfig.statusText }}</el-descriptions-item>
          <el-descriptions-item label="Env Key">{{ channelConfig.envKey }}</el-descriptions-item>
          <el-descriptions-item label="密钥展示">{{ channelConfig.secretVisible ? "可见" : "不可见" }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="asRows(channelConfig?.templates)" empty-text="暂无模板映射">
          <el-table-column prop="code" label="模板编码" min-width="160" />
          <el-table-column prop="name" label="模板名称" min-width="160" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="templateKey" label="外部模板 Key" min-width="180" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('member')">
      <AdminFilterBar>
        <el-select v-model="memberForm.levelId" placeholder="会员等级" style="width: 220px">
          <el-option v-for="item in memberLevels" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-input v-if="section === 'member-benefits'" v-model="memberForm.title" placeholder="权益标题" style="width: 220px" />
        <el-input-number v-if="section === 'member-pricing'" v-model="memberForm.fixedPriceCent" :min="0" placeholder="固定价(分)" />
        <el-input-number v-if="section === 'member-pricing'" v-model="memberForm.discountPercent" :min="0" :max="10000" placeholder="折扣基点" />
        <el-input-number v-if="section === 'member-pricing'" v-model="memberForm.discountCent" :min="0" placeholder="立减(分)" />
        <template #actions><el-button type="primary" :disabled="!memberForm.levelId" @click="saveMemberConfig">保存配置</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard :title="section === 'member-benefits' ? '会员权益' : '会员价规则'" subtitle="会员价规则已参与报名 quote/create order；订单会保存会员价和优惠明细快照。">
        <el-table :data="section === 'member-benefits' ? memberBenefits : memberPriceRules" empty-text="暂无配置">
          <el-table-column prop="title" label="标题/等级" min-width="180"><template #default="{ row }">{{ row.title || row.level?.name }}</template></el-table-column>
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="fixedPriceCent" label="固定价分" width="120" />
          <el-table-column prop="discountPercent" label="折扣基点" width="120" />
          <el-table-column prop="discountCent" label="减免分" width="110" />
          <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="Boolean(row.enabled)" /></template></el-table-column>
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('mall')">
      <AdminSectionCard :title="currentRoute.title" subtitle="读取商城真实商品、SKU、订单、发货和售后数据。">
        <el-table :data="mallRows" empty-text="暂无商城数据">
          <el-table-column prop="name" label="名称" min-width="180"><template #default="{ row }">{{ row.name || row.title || row.orderNo || row.productTitle || row.id }}</template></el-table-column>
          <el-table-column prop="code" label="编码" width="140" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="价格/金额" width="130"><template #default="{ row }">{{ moneyMaybe(row.priceCent ?? row.payableAmountCent) }}</template></el-table-column>
          <el-table-column prop="stock" label="库存" width="90" />
          <el-table-column prop="receiverName" label="收件人" width="120" />
          <el-table-column prop="createdAt" label="创建时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('finance')">
      <AdminFilterBar v-if="section === 'finance-wechat-bills'">
        <el-date-picker v-model="billDate" type="date" value-format="YYYY-MM-DD" placeholder="账单日期" />
        <template #actions><el-button type="primary" :disabled="!billDate" @click="createBill">创建账单批次</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard :title="currentRoute.title">
        <el-table :data="financeRows" empty-text="暂无财务数据">
          <el-table-column prop="refundNo" label="退款号" min-width="150" />
          <el-table-column prop="invoiceNo" label="发票号" min-width="150" />
          <el-table-column prop="billType" label="账单类型" width="110" />
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="金额" width="120"><template #default="{ row }">{{ moneyMaybe(row.amountCent ?? row.localAmountCent ?? row.remoteAmountCent) }}</template></el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="190" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button v-if="section === 'finance-refunds'" size="small" @click="approveRefundRow(String(row.id))">批准</el-button>
              <el-button v-if="section === 'finance-invoices'" size="small" @click="approveInvoiceRow(String(row.id))">通过</el-button>
              <el-button v-if="section === 'finance-wechat-bills'" size="small" @click="reconcileBill(String(row.id))">对账</el-button>
            </template>
          </el-table-column>
        </el-table>
      </AdminSectionCard>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
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
  createCouponCampaign,
  createMemberBenefit,
  createMemberPricingRule,
  createWechatBill,
  generateCouponCampaignQr,
  getCheckinStats,
  getInventoryAlertRule,
  getNotificationChannelConfig,
  listCheckinLogs,
  listConferences,
  listCouponCampaigns,
  listCoupons,
  listFinancePayments,
  listInventoryAlertLogs,
  listInvoices,
  listMallAfterSales,
  listMallOrders,
  listMallShipments,
  listMemberBenefits,
  listMemberLevels,
  listMemberPricingRules,
  listPaymentExceptions,
  listProductCategories,
  listProducts,
  listProductSkus,
  listReconciliationResults,
  listRefunds,
  listWechatBills,
  reconcileWechatBill,
  scanInventoryAlerts,
  updateInventoryAlertRule,
  verifyCheckin
} from "../../services/admin";
import type { Conference, Coupon, FinancePayment, MemberLevel } from "../../services/types";

const loading = ref(false);
const submitting = ref(false);
const conferences = ref<Conference[]>([]);
const conferenceId = ref("");
const keyword = ref("");
const paymentStatus = ref("");
const coupons = ref<Coupon[]>([]);
const inventoryRule = reactive({ enabled: false, thresholdRemaining: 10, notifyMode: "ADMIN_ONLY" });
const inventoryLogs = ref<Record<string, unknown>[]>([]);
const checkinCredential = ref("");
const checkinLogs = ref<Record<string, unknown>[]>([]);
const checkinStats = ref<Record<string, unknown>>({});
const paymentExceptions = ref<Record<string, unknown>[]>([]);
const payments = ref<FinancePayment[]>([]);
const couponCampaigns = ref<Record<string, unknown>[]>([]);
const campaignForm = reactive({ name: "", couponIds: [] as string[] });
const qrInfo = ref("");
const channelConfig = ref<Record<string, unknown> | null>(null);
const memberLevels = ref<MemberLevel[]>([]);
const memberBenefits = ref<Record<string, unknown>[]>([]);
const memberPriceRules = ref<Record<string, unknown>[]>([]);
const memberForm = reactive({
  levelId: "",
  title: "",
  fixedPriceCent: undefined as number | undefined,
  discountPercent: 9000,
  discountCent: undefined as number | undefined
});
const mallRows = ref<Record<string, unknown>[]>([]);
const financeRows = ref<Record<string, unknown>[]>([]);
const billDate = ref("");

const section = computed(() => {
  const path = currentRoute.value.path;
  if (path.includes("inventory")) return "inventory";
  if (path.includes("checkin/verify")) return "checkin-verify";
  if (path.includes("checkin/logs")) return "checkin-logs";
  if (path.includes("checkin/stats")) return "checkin-stats";
  if (path.includes("payment-exceptions")) return "payment-exceptions";
  if (path.includes("payment-records")) return "payment-records";
  if (path.includes("coupon-campaigns")) return "coupon-campaigns";
  if (path.includes("wechat-subscribe")) return "notification-config-wechat";
  if (path.includes("notifications/sms")) return "notification-config-sms";
  if (path.includes("members/benefits")) return "member-benefits";
  if (path.includes("members/pricing-rules")) return "member-pricing";
  if (path.includes("mall/categories")) return "mall-categories";
  if (path.includes("mall/skus")) return "mall-skus";
  if (path.includes("mall/fulfillment")) return "mall-fulfillment";
  if (path.includes("mall/aftersales")) return "mall-aftersales";
  if (path.includes("finance/refunds")) return "finance-refunds";
  if (path.includes("finance/invoices")) return "finance-invoices";
  if (path.includes("finance/wechat-bills")) return "finance-wechat-bills";
  if (path.includes("finance/reconciliation")) return "finance-reconciliation";
  return "unknown";
});
const statusLabel = computed(() => (currentRoute.value.badge ? `${currentRoute.value.badge}能力` : "已接入真实数据"));
const statusDescription = computed(() => (currentRoute.value.badge ? "该页面已接入真实接口；是否移除标签以审计表为准。" : "页面、接口和数据链路已接入。"));
const checkinTotal = computed(() => toNumber(checkinStats.value.total));
const checkinCheckedIn = computed(() => toNumber(checkinStats.value.checkedIn));
const checkinPending = computed(() => toNumber(checkinStats.value.pending));
const checkinNotRequired = computed(() => toNumber(checkinStats.value.notRequired));

onMounted(() => void load());
watch(() => currentRoute.value.path, () => void load());

async function load() {
  loading.value = true;
  try {
    await ensureConferences();
    if (section.value === "inventory") await loadInventory();
    else if (section.value.startsWith("checkin")) await loadCheckin();
    else if (section.value === "payment-exceptions") await loadPaymentExceptions();
    else if (section.value === "payment-records") await loadPayments();
    else if (section.value === "coupon-campaigns") await loadCampaigns();
    else if (section.value.startsWith("notification-config")) await loadChannelConfig();
    else if (section.value.startsWith("member")) await loadMemberConfig();
    else if (section.value.startsWith("mall")) await loadMall();
    else if (section.value.startsWith("finance")) await loadFinance();
  } finally {
    loading.value = false;
  }
}

async function ensureConferences() {
  if (conferences.value.length === 0) {
    conferences.value = (await listConferences({ page: 1, pageSize: 200 })).items;
    conferenceId.value ||= conferences.value[0]?.id ?? "";
  }
}

async function loadInventory() {
  if (!conferenceId.value) return;
  const rule = await getInventoryAlertRule(conferenceId.value);
  Object.assign(inventoryRule, { enabled: Boolean(rule.enabled), thresholdRemaining: toNumber(rule.thresholdRemaining) || 10, notifyMode: String(rule.notifyMode || "ADMIN_ONLY") });
  inventoryLogs.value = (await listInventoryAlertLogs({ page: 1, pageSize: 100, conferenceId: conferenceId.value })).items;
}

async function saveInventoryRule() {
  await updateInventoryAlertRule(conferenceId.value, inventoryRule);
  await loadInventory();
  ElMessage.success("库存预警规则已保存");
}

async function scanInventory() {
  submitting.value = true;
  try {
    const result = await scanInventoryAlerts();
    await loadInventory();
    ElMessage.success(`扫描完成，生成 ${toNumber(result.created)} 条日志`);
  } finally {
    submitting.value = false;
  }
}

async function loadCheckin() {
  checkinStats.value = await getCheckinStats({ conferenceId: conferenceId.value || undefined });
  checkinLogs.value = (await listCheckinLogs({ page: 1, pageSize: 100 })).items;
}

async function verifyCredential() {
  await verifyCheckin({ credentialCode: checkinCredential.value });
  checkinCredential.value = "";
  await loadCheckin();
  ElMessage.success("核销成功");
}

async function loadPaymentExceptions() {
  paymentExceptions.value = (await listPaymentExceptions({ keyword: keyword.value })).items;
}

async function loadPayments() {
  payments.value = (await listFinancePayments({ page: 1, pageSize: 100, keyword: keyword.value, status: paymentStatus.value })).items;
}

async function loadCampaigns() {
  const [couponData, campaignData] = await Promise.all([listCoupons({ page: 1, pageSize: 100 }), listCouponCampaigns({ page: 1, pageSize: 100 })]);
  coupons.value = couponData.items;
  couponCampaigns.value = campaignData.items as unknown as Record<string, unknown>[];
}

async function createCampaign() {
  await createCouponCampaign({ name: campaignForm.name, couponIds: campaignForm.couponIds });
  Object.assign(campaignForm, { name: "", couponIds: [] });
  await loadCampaigns();
  ElMessage.success("券活动已创建");
}

async function showCampaignQr(id: string) {
  qrInfo.value = JSON.stringify(await generateCouponCampaignQr(id), null, 2);
}

async function loadChannelConfig() {
  channelConfig.value = await getNotificationChannelConfig(section.value === "notification-config-sms" ? "sms" : "wechat-subscribe");
}

async function loadMemberConfig() {
  memberLevels.value = (await listMemberLevels()).items;
  memberForm.levelId ||= memberLevels.value[0]?.id ?? "";
  const [benefits, rules] = await Promise.all([listMemberBenefits(), listMemberPricingRules()]);
  memberBenefits.value = benefits.items;
  memberPriceRules.value = rules.items;
}

async function saveMemberConfig() {
  if (section.value === "member-benefits") await createMemberBenefit({ levelId: memberForm.levelId, title: memberForm.title || "会员权益", type: "TEXT", enabled: true });
  else {
    await createMemberPricingRule({
      levelId: memberForm.levelId,
      fixedPriceCent: memberForm.fixedPriceCent,
      discountPercent: memberForm.discountPercent,
      discountCent: memberForm.discountCent,
      enabled: true
    });
  }
  Object.assign(memberForm, { title: "", fixedPriceCent: undefined, discountPercent: 9000, discountCent: undefined });
  await loadMemberConfig();
  ElMessage.success("会员配置已保存");
}

async function loadMall() {
  if (section.value === "mall-categories") mallRows.value = (await listProductCategories()).items as unknown as Record<string, unknown>[];
  else if (section.value === "mall-skus") mallRows.value = (await listProductSkus()).items;
  else if (section.value === "mall-fulfillment") mallRows.value = (await listMallShipments()).items;
  else if (section.value === "mall-aftersales") mallRows.value = (await listMallAfterSales()).items;
  else mallRows.value = (await listMallOrders({ page: 1, pageSize: 100 })).items as unknown as Record<string, unknown>[];
}

async function loadFinance() {
  if (section.value === "finance-refunds") financeRows.value = (await listRefunds({ page: 1, pageSize: 100 })).items;
  else if (section.value === "finance-invoices") financeRows.value = (await listInvoices({ page: 1, pageSize: 100 })).items;
  else if (section.value === "finance-wechat-bills") financeRows.value = (await listWechatBills()).items;
  else financeRows.value = (await listReconciliationResults({ page: 1, pageSize: 100 })).items;
}

async function approveRefundRow(id: string) {
  await approveRefund(id);
  await loadFinance();
  ElMessage.success("退款已批准");
}

async function approveInvoiceRow(id: string) {
  await approveInvoice(id);
  await loadFinance();
  ElMessage.success("发票已通过");
}

async function createBill() {
  await createWechatBill({ billDate: billDate.value, billType: "TRADE" });
  await loadFinance();
  ElMessage.success("微信账单批次已创建");
}

async function reconcileBill(id: string) {
  await reconcileWechatBill(id);
  await loadFinance();
  ElMessage.success("对账完成");
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) || 0 : 0;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function moneyMaybe(value: unknown) {
  return typeof value === "number" ? `¥${formatCent(value)}` : "-";
}

function exceptionText(value: unknown) {
  return asRows(value).map((item) => item.message).filter(Boolean).join("；") || "-";
}

function couponNames(value: unknown) {
  return asRows(value).map((item) => item.name || item.code).filter(Boolean).join("，") || "-";
}
</script>

<style scoped>
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.json-block {
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: #0f172a;
  color: #e2e8f0;
}
</style>
