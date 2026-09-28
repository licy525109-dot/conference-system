<template>
  <section class="admin-page">
    <AdminPageHeader
      title="订单支付"
      eyebrow="订单交易"
      subtitle="查看会议报名订单、金额、支付流水和异常状态；后台不提供手动改支付状态。"
    >
      <template #actions>
        <el-button :loading="exporting" @click="exportExcel">导出 Excel</el-button>
        <el-button v-if="!deleted && hasPermission('order:delete')" :disabled="closeableFilteredCount === 0" :loading="deleting" type="warning" plain @click="closeFiltered">关闭筛选出的待支付订单</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" aria-label="订单搜索" clearable placeholder="订单号 / 姓名 / 手机 / 商户单号" style="width: 280px" @keyup.enter="searchOrders" />
      <el-select v-model="conferenceId" aria-label="会议筛选" clearable filterable placeholder="会议" style="width: 220px" @change="conferenceChanged">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <el-select v-model="skuId" aria-label="票种筛选" clearable filterable placeholder="全部票种" :loading="skusLoading" style="width: 240px">
        <el-option v-for="item in skuOptions" :key="item.id" :value="item.id" :label="conferenceId ? item.name : `${item.name} · ${item.conference.title}`" />
      </el-select>
      <el-select v-model="status" clearable placeholder="订单状态" style="width: 150px">
        <el-option label="待支付" value="PENDING" />
        <el-option label="已支付" value="PAID" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="已关闭" value="CLOSED" />
        <el-option label="已退款" value="REFUNDED" />
      </el-select>
      <el-select v-model="paymentStatus" clearable placeholder="支付状态" style="width: 150px">
        <el-option label="支付成功" value="SUCCESS" />
        <el-option label="待支付" value="PENDING" />
        <el-option label="支付失败" value="FAILED" />
        <el-option label="已关闭" value="CLOSED" />
      </el-select>
      <el-checkbox v-model="onlyExceptions" @change="searchOrders">只看异常</el-checkbox>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="searchOrders">查询</el-button>
      </template>
    </AdminFilterBar>

    <div class="order-view-bar">
      <el-radio-group v-model="deleted" aria-label="订单列表范围" @change="searchOrders">
        <el-radio-button :value="false">订单列表</el-radio-button>
        <el-radio-button :value="true">回收站</el-radio-button>
      </el-radio-group>
      <el-button v-if="!deleted && hasPermission('order:delete')" :icon="Delete" type="danger" plain :loading="deleting" :disabled="!selectedItems.length" @click="removeOrders(selectedItems)">删除所选 {{ selectedItems.length || '' }}</el-button>
    </div>
    <section v-if="summary && !listError" class="order-summary" aria-label="筛选结果金额合计">
      <div class="summary-scope">{{ appliedFilters.deleted ? '回收站' : '当前筛选' }} · 全部 {{ summary.orderCount }} 笔订单<span v-if="appliedFilters.skuId"> · 含所选票种的整单金额</span></div>
      <dl>
        <div><dt>实付总额</dt><dd>¥{{ formatCent(summary.paidAmountCent) }}</dd><small>{{ summary.paidOrderCount }} 笔已付款订单（含已退款）</small></div>
        <div><dt>已退款</dt><dd>¥{{ formatCent(summary.refundedAmountCent) }}</dd><small>仅计退款成功</small></div>
        <div class="net-paid"><dt>净收款</dt><dd>¥{{ formatCent(summary.netPaidAmountCent) }}</dd><small>实付总额减已退款</small></div>
        <div><dt>优惠合计</dt><dd>¥{{ formatCent(summary.discountAmountCent) }}</dd><small>订单应付合计 ¥{{ formatCent(summary.payableAmountCent) }}</small></div>
      </dl>
    </section>
    <el-alert v-if="listError" :title="listError" type="error" :closable="false" show-icon />
    <section class="table-panel">
      <el-table v-loading="loading" :data="displayedItems" row-key="id" :row-class-name="orderRowClassName" @selection-change="selectedItems = $event">
        <el-table-column v-if="!deleted && hasPermission('order:delete')" type="selection" width="44" :selectable="canRecycleOrder" />
        <AdminTableIndex :page="page" :page-size="pageSize" />
        <el-table-column label="订单信息" min-width="230">
          <template #default="{ row }">
            <strong>{{ row.orderNo }}</strong>
            <div class="order-conference">{{ row.conferenceTitle }}</div>
            <div class="muted-text">{{ row.outTradeNo || "未生成商户单号" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="票种 / 数量" min-width="245">
          <template #default="{ row }">
            <div v-for="ticket in row.items" :key="ticket.id" class="ticket-item">
              <strong class="ticket-heading"><span>{{ ticket.skuName }}</span><span class="ticket-quantity">× {{ ticket.quantity }}</span></strong>
              <span class="muted-text">单价 ¥{{ formatCent(ticket.unitPriceCent) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="125">
          <template #default="{ row }"><strong>{{ row.paidAmountCent === null ? "-" : `¥${formatCent(row.paidAmountCent)}` }}</strong><div v-if="row.refundedAmountCent" class="muted-text">已退 ¥{{ formatCent(row.refundedAmountCent) }}</div></template>
        </el-table-column>
        <el-table-column label="下单账号" min-width="160">
          <template #default="{ row }"><el-button v-if="row.user?.id && hasPermission('member:view')" class="account-button" link type="primary" @click="openAccount(row.user.id)"><span>{{ row.user.realName || row.user.nickname || row.user.wechatNickname || '待完善姓名' }}<small>{{ hasPermission('member:write') ? '编辑账号' : '查看账号' }}</small></span></el-button><span v-else>{{ row.user ? '无账号查看权限' : '未关联' }}</span></template>
        </el-table-column>
        <el-table-column label="参会人" width="150">
          <template #default="{ row }">
            <strong>{{ row.attendeeName || "-" }}</strong>
            <div class="muted-text">{{ row.phone || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
        <el-table-column label="支付状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.paymentStatus || row.status" :tone="isOrderAbnormal(row) ? 'danger' : undefined" /></template></el-table-column>
        <el-table-column label="应付" width="110"><template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template></el-table-column>
        <el-table-column label="优惠" width="100"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
        <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
        <el-table-column label="异常" width="110">
          <template #default="{ row }">
            <el-tooltip v-if="isOrderAbnormal(row)" placement="top" :content="exceptionText(row)">
              <AdminStatusBadge label="需关注" tone="danger" />
            </el-tooltip>
            <span v-else class="muted-text">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="deleted" label="删除原因" prop="adminDeleteReason" min-width="170" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.orderNo)">详情</el-button>
            <el-button v-if="!deleted && hasPermission('order:delete') && canCloseOrder(row)" size="small" type="warning" plain @click="closeSingle(row)">关闭</el-button>
            <el-button v-if="!deleted && hasPermission('order:delete') && canRecycleOrder(row)" size="small" type="danger" plain :disabled="deleting" @click="removeOrders([row])">删除</el-button>
            <el-button v-if="deleted && hasPermission('order:delete')" size="small" :disabled="deleting" @click="restore(row)">恢复</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState :title="listError ? '订单加载失败' : '暂无订单'" :description="listError || '调整筛选条件，或从用户端完成报名下单后再查看。'" :action-text="listError ? '重试' : '查看会议'" @action="listError ? load() : goConferences()" />
        </template>
      </el-table>
      <footer class="table-footer">
        <span role="status">{{ listError ? '加载失败' : `本页显示 ${displayedItems.length} 条 / 查询共 ${total} 条` }}</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :disabled="loading"
          layout="sizes, prev, pager, next"
          @current-change="load"
          @size-change="searchOrders"
        />
      </footer>
    </section>

    <UserAccountEditor v-model="accountVisible" :user-id="accountId" @saved="accountSaved" />
    <el-dialog v-model="detailVisible" title="订单详情" width="min(960px, 94vw)">
      <div v-if="detail" class="admin-page">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="订单状态"><AdminStatusBadge :status="detail.status" /></el-descriptions-item>
          <el-descriptions-item label="会议">{{ detail.conferenceTitle }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ detail.attendeeName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="下单账号" :span="2"><el-button v-if="detail.user && hasPermission('member:view')" link type="primary" @click="openAccount(detail.user.id)">{{ detail.user.realName || detail.user.nickname || detail.user.wechatNickname || '待完善姓名' }} · {{ hasPermission('member:write') ? '编辑账号' : '查看账号' }}</el-button><span v-else>未关联或无查看权限</span></el-descriptions-item>
          <el-descriptions-item label="原价">¥{{ formatCent(detail.originAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="优惠">¥{{ formatCent(detail.discountAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="应付">¥{{ formatCent(detail.payableAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="实付">{{ detail.paidAmountCent === null ? "-" : `¥${formatCent(detail.paidAmountCent)}` }}</el-descriptions-item>
          <el-descriptions-item label="支付状态"><AdminStatusBadge :status="detail.paymentStatus || detail.status" /></el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDate(detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="商户订单号">{{ detail.outTradeNo || "-" }}</el-descriptions-item>
          <el-descriptions-item label="微信交易号">{{ detail.transactionId || "-" }}</el-descriptions-item>
        </el-descriptions>
        <h3>订单票种明细</h3>
        <el-table :data="detail.items">
          <AdminTableIndex />
          <el-table-column prop="skuName" label="票种（下单时）" min-width="220" />
          <el-table-column prop="quantity" label="数量" width="80" />
          <el-table-column label="单价" width="110"><template #default="{ row }">¥{{ formatCent(row.unitPriceCent) }}</template></el-table-column>
          <el-table-column label="优惠前小计" width="130"><template #default="{ row }">¥{{ formatCent(row.totalAmountCent) }}</template></el-table-column>
        </el-table>
        <div v-if="detail.registration" class="inline-actions">
          <el-button type="primary" @click="navigateTo('/registrations/detail', { id: detail.registration.id })">查看报名详情</el-button>
        </div>
        <el-alert class="reserved-alert" title="报名退款请前往“财务管理 > 退款管理”审核。退款成功只以微信退款结果或已验签回调为准，本页不允许手动修改支付状态。" type="info" :closable="false" />
        <div v-if="detail.status === 'PAID' && hasPermission('refund:view')" class="inline-actions">
          <el-button @click="navigateTo('/finance/refunds')">前往退款管理</el-button>
        </div>
        <section v-if="detail.paymentExceptions.length > 0" class="exception-panel">
          <h3>异常识别</h3>
          <el-alert
            v-for="item in detail.paymentExceptions"
            :key="item.code"
            :title="item.message"
            :type="item.level === 'danger' ? 'error' : 'warning'"
            :closable="false"
            show-icon
          />
          <el-input v-model="reviewNote" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="填写人工核对结果，例如：已核对微信商户后台，用户未支付；或已联系开发排查报名缺失。" />
          <div class="inline-actions">
            <el-button type="primary" :disabled="!reviewNote.trim()" :loading="reviewSaving" @click="saveExceptionReview">记录处理备注</el-button>
          </div>
          <el-timeline v-if="detail.exceptionReviewLogs.length > 0">
            <el-timeline-item v-for="log in detail.exceptionReviewLogs" :key="log.id" :timestamp="formatDate(log.createdAt)">
              <strong>{{ log.adminName }}</strong>
              <div class="muted-text">{{ readReviewNote(log.metadataJson) || log.summary || "-" }}</div>
            </el-timeline-item>
          </el-timeline>
        </section>
        <h3>优惠明细</h3>
        <el-table :data="detail.discounts" empty-text="暂无优惠">
          <AdminTableIndex />
          <el-table-column prop="type" label="类型" width="130" />
          <el-table-column prop="title" label="名称" min-width="180" />
          <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        </el-table>
        <h3>支付记录</h3>
        <el-table :data="detail.payments" empty-text="暂无支付">
          <AdminTableIndex />
          <el-table-column prop="provider" label="渠道" width="100"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180" />
          <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
        </el-table>
        <h3>提交表单</h3>
        <pre class="json-block">{{ formatJson(detail.submittedFormJson) }}</pre>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import UserAccountEditor from "../../components/UserAccountEditor.vue";
import { Delete } from "@element-plus/icons-vue";
import { navigateTo, routeQuery } from "../../router";
import { closeOrder, closeOrdersByFilter, exportOrdersExcel, getOrder, listConferences, listOrders, reviewPaymentException, listOrderSkuOptions, recycleOrders, restoreOrder, type OrderFilters } from "../../services/admin";
import { useAdminSession } from "../../stores/admin-session";
import type { AdminOrder, AdminOrderDetail, AdminOrderSummary, Conference } from "../../services/types";

const items = ref<AdminOrder[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const { hasPermission } = useAdminSession();
const conferences = ref<Conference[]>([]);
const detail = ref<AdminOrderDetail | null>(null);
const keyword = ref("");
const conferenceId = ref("");
const skuId = ref(''), deleted = ref(false), skusLoading = ref(false);
const skuOptions = ref<Awaited<ReturnType<typeof listOrderSkuOptions>>['items']>([]);
const summary = ref<AdminOrderSummary | null>(null);
const selectedItems = ref<AdminOrder[]>([]);
const appliedFilters = ref<OrderFilters>({});
const accountVisible = ref(false), accountId = ref('');
const status = ref("");
const paymentStatus = ref("");
const onlyExceptions = ref(false);
const loading = ref(false);
const listError = ref("");
const exporting = ref(false);
const deleting = ref(false);
const reviewSaving = ref(false);
const detailVisible = ref(false);
const reviewNote = ref("");

const displayedItems = computed(() => items.value);
const closeableFilteredCount = computed(() => displayedItems.value.filter(canCloseOrder).length);
let listRequest = 0;

onMounted(async () => {
  if (routeQuery.value.orderNo) keyword.value = routeQuery.value.orderNo;
  appliedFilters.value = currentFilters();
  await Promise.all([loadConferences(), loadSkuOptions(), load()]);
  if (routeQuery.value.orderNo) await openDetail(routeQuery.value.orderNo);
});

async function loadConferences() {
  if (!hasPermission('conference:view')) return;
  try { conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items; }
  catch (e) { ElMessage.error(errorText(e, '会议筛选项加载失败')); }
}

let skuRequest = 0;
async function loadSkuOptions() {
  const request = ++skuRequest;
  skusLoading.value = true;
  try { const result = await listOrderSkuOptions(conferenceId.value); if (request === skuRequest) skuOptions.value = result.items; }
  catch (e) { if (request === skuRequest) { skuOptions.value = []; ElMessage.error(errorText(e, '票种读取失败')); } }
  finally { if (request === skuRequest) skusLoading.value = false; }
}
function conferenceChanged() { skuId.value = ''; skuOptions.value = []; void loadSkuOptions(); }
function currentFilters(): OrderFilters { return { keyword: keyword.value, conferenceId: conferenceId.value, skuId: skuId.value, status: status.value, paymentStatus: paymentStatus.value, onlyExceptions: onlyExceptions.value, deleted: deleted.value }; }
function openAccount(id: string) { accountId.value = id; accountVisible.value = true; }
async function accountSaved() { await load(); if (detailVisible.value && detail.value) await openDetail(detail.value.orderNo); }

async function load() {
  const request = ++listRequest;
  loading.value = true;
  listError.value = "";
  items.value = [];
  selectedItems.value = [];
  summary.value = null;
  try {
    const result = await listOrders({ ...appliedFilters.value, page: page.value, pageSize: pageSize.value });
    if (request !== listRequest) return;
    total.value = result.total;
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
    if (page.value > lastPage) {
      page.value = lastPage;
      return await load();
    }
    items.value = result.items;
    summary.value = result.summary;
  } catch {
    if (request === listRequest) {
      total.value = 0;
      listError.value = "订单加载失败，请重试";
    }
  } finally {
    if (request === listRequest) loading.value = false;
  }
}

function searchOrders() {
  page.value = 1;
  appliedFilters.value = currentFilters();
  return load();
}

async function openDetail(orderNo: string) {
  try { detail.value = await getOrder(orderNo); reviewNote.value = ""; detailVisible.value = true; }
  catch (e) { ElMessage.error(errorText(e, '订单详情加载失败')); }
}

async function exportExcel() {
  exporting.value = true;
  try {
    await exportOrdersExcel(appliedFilters.value);
    ElMessage.success("订单 Excel 已开始下载");
  } catch (e) { ElMessage.error(errorText(e, '导出失败'));
  } finally {
    exporting.value = false;
  }
}

async function saveExceptionReview() {
  if (!detail.value || !reviewNote.value.trim()) return;
  reviewSaving.value = true;
  try {
    await reviewPaymentException(detail.value.orderNo, reviewNote.value);
    detail.value = await getOrder(detail.value.orderNo);
    reviewNote.value = "";
    ElMessage.success("处理备注已记录");
  } finally {
    reviewSaving.value = false;
  }
}

async function closeSingle(row: AdminOrder) {
  try {
    await ElMessageBox.confirm("仅待支付、未生成报名且没有成功支付流水的订单可关闭；不会影响已支付订单。确认关闭该订单？", "关闭待支付订单", {
      confirmButtonText: "确认关闭",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  deleting.value = true;
  try {
    const result = await closeOrder(row.orderNo);
    await load();
    ElMessage.success(`已关闭 ${result.closed} 单${result.skipped ? `，跳过 ${result.skipped} 单` : ""}`);
  } catch (e) { ElMessage.error(errorText(e, '关闭失败'));
  } finally {
    deleting.value = false;
  }
}

async function closeFiltered() {
  if (closeableFilteredCount.value === 0) {
    ElMessage.warning("当前没有可关闭的待支付订单");
    return;
  }
  const applied = { ...appliedFilters.value };
  const filters = [
    `关键字：${applied.keyword || "全部"}`,
    `会议：${applied.conferenceId ? conferences.value.find((item) => item.id === applied.conferenceId)?.title || applied.conferenceId : "全部"}`,
    `票种：${skuOptions.value.find(item => item.id === applied.skuId)?.name || applied.skuId || '全部'}`,
    `订单状态：${applied.status || "全部"}`,
    `支付状态：${applied.paymentStatus || "全部"}`,
    `只看异常：${applied.onlyExceptions ? "是" : "否"}`
  ].join("\n");
  try {
    await ElMessageBox.confirm(`当前筛选条件：\n${filters}\n\n本页有 ${closeableFilteredCount.value} 单符合关闭条件。本操作会处理所有页面中符合以上条件的待支付订单，不仅限于本页；实际数量以后台处理结果为准。不会影响已支付订单。确认继续？`, "关闭筛选出的待支付订单", {
      confirmButtonText: "确认关闭",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  deleting.value = true;
  try {
    const result = await closeOrdersByFilter(applied);
    await load();
    const message = `已匹配 ${result.matched} 单，关闭 ${result.closed} 单，跳过 ${result.skipped} 单，失败 ${result.failed} 单`;
    if (result.closed > 0) {
      ElMessage.success(message);
    } else {
      ElMessage.warning(`${message}；仅待支付、无报名、无成功支付流水的订单可关闭`);
    }
  } catch (e) { ElMessage.error(errorText(e, '关闭失败'));
  } finally {
    deleting.value = false;
  }
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function canRecycleOrder(row: AdminOrder) { return row.status !== 'PENDING' && !row.adminDeletedAt; }
async function removeOrders(rows: AdminOrder[]) {
  if (deleting.value || !rows.length) return;
  const orderNos = rows.map(row => row.orderNo);
  let reason: string;
  try {
    const result = await ElMessageBox.prompt(`确认将选中的 ${orderNos.length} 笔订单移入回收站？\n不会退款、取消报名或删除支付流水，可在回收站恢复。请输入删除原因。`, '删除订单', {
      type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消', inputPlaceholder: '例如：测试订单',
      inputValidator: (value: string) => Boolean(value?.trim()) && value.trim().length <= 300 || '请填写 1 至 300 字的删除原因'
    }); reason = result.value.trim();
  } catch { return; }
  deleting.value = true;
  try { const result = await recycleOrders(orderNos, reason); await load(); ElMessage.success(`已将 ${result.deleted} 笔订单移入回收站`); }
  catch (e) { ElMessage.error(errorText(e, '删除失败')); }
  finally { deleting.value = false; }
}
async function restore(row: AdminOrder) {
  deleting.value = true;
  try { await restoreOrder(row.orderNo); await load(); ElMessage.success('订单已恢复'); }
  catch (e) { ElMessage.error(errorText(e, '恢复失败')); }
  finally { deleting.value = false; }
}
function errorText(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isOrderAbnormal(row: AdminOrder) {
  if (row.paymentExceptions?.length > 0) return true;
  const statusText = String(row.status || "").toUpperCase();
  const paymentText = String(row.paymentStatus || "").toUpperCase();
  return ["FAILED", "CANCELLED", "CANCELED", "CLOSED"].includes(statusText) || ["FAILED", "CANCELLED", "CANCELED"].includes(paymentText);
}

function canCloseOrder(row: AdminOrder) {
  return row.status === "PENDING" && row.paymentStatus !== "SUCCESS";
}

function exceptionText(row: AdminOrder) {
  return row.paymentExceptions?.map((item) => item.message).join("；") || "订单状态需关注";
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "Mock 测试", WECHAT: "微信支付" }[value] ?? value) : "-";
}

function readReviewNote(value: Record<string, unknown> | null) {
  return typeof value?.note === "string" ? value.note : "";
}

function orderRowClassName({ row }: { row: AdminOrder }) {
  return isOrderAbnormal(row) ? "is-warning-row" : "";
}

function goConferences() {
  navigateTo("/conferences");
}
</script>

<style scoped>
.order-view-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
.order-summary { border-block: 1px solid var(--admin-border-color, #e1e4e8); padding: 16px 0; }
.summary-scope { font-size: 14px; color: #606773; margin-bottom: 16px; }
.order-summary dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin: 0; }
.order-summary dt, .order-summary small { color: #606773; font-size: 13px; }
.order-summary dd { font-size: 24px; font-weight: 700; margin: 6px 0; line-height: 1.4; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.order-summary .net-paid dd { color: var(--admin-color-primary); }
.ticket-item { display: grid; gap: 4px; padding: 6px 0; line-height: 1.5; }
.ticket-heading { display: flex; gap: 8px; justify-content: space-between; }
.order-conference { margin: 6px 0; font-size: 13px; line-height: 1.5; }
.ticket-item + .ticket-item { border-top: 1px solid #e5e7eb; }
.ticket-quantity { white-space: nowrap; color: var(--admin-color-primary); }
.account-button { white-space: normal; height: auto; line-height: 1.5; text-align: left; overflow-wrap: anywhere; }
.account-button :deep(span) { display: block; }
.account-button small { display: block; margin-top: 4px; font-size: 13px; }
@media (max-width: 700px) { .order-summary dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .order-summary dd { font-size: 20px; } }
.table-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.reserved-alert {
  margin-top: 14px;
}

.exception-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:deep(.is-warning-row) {
  --el-table-tr-bg-color: #fffafa;
}
</style>
