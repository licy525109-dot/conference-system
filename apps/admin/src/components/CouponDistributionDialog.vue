<template>
  <el-dialog
    :model-value="modelValue"
    title="优惠券定向发放"
    width="min(960px, calc(100vw - 24px))"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @update:model-value="close"
  >
    <el-tabs v-model="tab" class="distribution-dialog">
      <el-tab-pane v-if="canWrite" label="定向发放" name="issue" :disabled="busy">
        <template v-if="!issued">
          <el-alert type="warning" :closable="false" show-icon :title="distributionPolicy" description="定向发放后，该券需先领取才能使用，仅有券码无法直接使用；不可再关联公开活动，也不可改为每人多次或不限次数。" />
          <el-form label-position="top" :disabled="busy || !!attempt" class="distribution-form" @submit.prevent="submit">
            <el-form-item label="优惠券" required>
              <div v-if="coupon" class="identity-block">
                <strong>{{ coupon.name }}</strong><span>{{ coupon.code }}</span>
              </div>
              <el-select
                v-else v-model="couponId" filterable remote :remote-method="searchCoupons" :loading="couponsLoading"
                placeholder="搜索券名称或券码" aria-label="优惠券" :disabled="!canRead"
              >
                <el-option v-for="item in coupons" :key="item.id" :label="`${item.name} · ${item.code}${item.perUserLimit !== 1 ? '（须每人限用 1 次）' : ''}`" :value="item.id" :disabled="!item.enabled || item.perUserLimit !== 1" />
              </el-select>
              <span v-if="!coupon && !canRead" class="field-note">缺少 coupon:view 权限，无法读取优惠券。</span>
            </el-form-item>
            <el-form-item v-if="!user" label="接收方式">
              <el-radio-group v-model="mode" aria-label="接收方式">
                <el-radio-button value="user">已有用户</el-radio-button>
                <el-radio-button value="phone">手机号邀请</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="user || mode === 'user'" label="接收用户" required>
              <div v-if="user" class="identity-block">
                <strong>{{ userLabel(user) }}</strong><span>用户 ID：{{ user.id }}</span>
              </div>
              <template v-else>
                <el-select
                  v-model="targetUser" value-key="id" filterable remote :remote-method="searchUsers" :loading="usersLoading"
                  placeholder="搜索姓名 / 昵称 / 手机号" aria-label="接收用户" @visible-change="onUserSelectOpen"
                >
                  <el-option v-for="item in users" :key="item.id" :label="`${userLabel(item)} · ID: ${item.id}`" :value="item" />
                </el-select>
                <span v-if="targetUser" class="field-note">用户 ID：{{ targetUser.id }}</span>
              </template>
              <span class="field-note">发放成功即归入该账号并生成站内通知，无需生成领取链接。</span>
            </el-form-item>
            <el-form-item v-else label="中国大陆手机号" required>
              <el-input v-model="phone" maxlength="11" inputmode="tel" autocomplete="off" placeholder="11 位手机号" aria-label="中国大陆手机号" />
              <span class="field-note">生成待领取邀请；领取账号须验证与接收手机号一致，未验证不能领取。</span>
            </el-form-item>
            <div class="distribution-fields" :class="{ 'distribution-fields--direct': !phoneInvitation }">
              <el-form-item v-if="phoneInvitation" label="领取有效期（小时）" required>
                <el-input-number v-model="expiryHours" :min="1" :max="168" :precision="0" :step="1" aria-label="领取有效期（小时）" />
                <span class="field-note">默认 24 小时，最多 168 小时；仅限制邀请领取期限，不改变券的使用有效期，且不晚于优惠券到期时间。</span>
              </el-form-item>
              <el-form-item label="备注">
                <el-input v-model="remark" type="textarea" :rows="2" maxlength="200" show-word-limit aria-label="备注" />
              </el-form-item>
            </div>
          </el-form>
          <el-alert v-if="lookupError" :title="lookupError" type="error" :closable="false" role="alert" />
          <el-alert v-if="issueError" :title="issueError" type="error" :closable="false" role="alert" />
          <p class="field-note">不会自动发送短信或微信消息。同一接收人不能重复领取同一优惠券，最终以服务端校验为准。</p>
          <div class="distribution-actions">
            <el-button v-if="issueError && canRead" :disabled="busy" @click="tab = 'records'">查看发放记录</el-button>
            <el-button v-if="attempt && issueError" :disabled="busy" @click="editAttempt">修改发放信息</el-button>
            <el-button type="primary" :loading="submitting" :disabled="busy && !submitting" @click="submit">{{ attempt ? '重试同一发放' : '确认发放' }}</el-button>
          </div>
        </template>
        <template v-else>
          <el-alert :title="issued.status === 'CLAIMED' ? '发放成功，优惠券已归入接收账号。' : `发放记录已保存：${statusText(issued.status)}`" type="success" :closable="false" show-icon />
          <dl class="distribution-summary">
            <dt>优惠券</dt><dd>{{ issued.coupon.name }} · {{ issued.coupon.code }}</dd>
            <dt>接收人</dt><dd>{{ recipientLabel(issued) }}</dd>
            <dt>发放编号</dt><dd>{{ issued.id }}</dd>
            <template v-if="issued.targetPhoneMasked"><dt>领取截止时间</dt><dd>{{ formatDate(issued.expiresAt) }}</dd></template>
          </dl>
          <el-button v-if="isPending(issued)" :disabled="busy" @click="generateLink(issued)">生成 / 重试微信领取链接</el-button>
        </template>
      </el-tab-pane>
      <el-tab-pane v-if="canRead" label="发放记录" name="records" :disabled="busy">
        <div class="records-heading">
          <span>{{ coupon ? `${coupon.name} · ${coupon.code}` : user ? userLabel(user) : '全部优惠券' }}</span>
          <el-tooltip content="刷新记录"><el-button :icon="Refresh" circle aria-label="刷新记录" :loading="recordsLoading" :disabled="busy" @click="loadRecords" /></el-tooltip>
        </div>
        <el-alert v-if="recordsError" :title="recordsError" type="error" :closable="false" role="alert" />
        <el-table v-loading="recordsLoading" :data="records" empty-text="暂无发放记录">
          <AdminTableIndex :page="page" :page-size="20" />
          <el-table-column type="expand">
            <template #default="{ row }">
              <dl class="distribution-summary record-details">
                <dt>发放编号</dt><dd>{{ row.id }}</dd>
                <dt>发放时间</dt><dd>{{ formatDate(row.createdAt) }}</dd>
                <dt>领取时间</dt><dd>{{ formatDate(row.claimedAt) }}</dd>
                <dt>领取用户</dt><dd>{{ row.claimUser ? `${userLabel(row.claimUser)} · ID: ${row.claimUserId || row.claimUser.id}` : row.claimUserId || '-' }}</dd>
                <dt>备注</dt><dd>{{ row.remark || '-' }}</dd>
              </dl>
            </template>
          </el-table-column>
          <el-table-column label="优惠券" min-width="150"><template #default="{ row }"><strong>{{ row.coupon.name }}</strong><div class="field-note">{{ row.coupon.code }}</div></template></el-table-column>
          <el-table-column label="接收人" min-width="210"><template #default="{ row }"><span class="recipient-text">{{ recipientLabel(row) }}</span></template></el-table-column>
          <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="statusTone(row.status)">{{ statusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="领取截止时间" width="170"><template #default="{ row }">{{ row.targetPhoneMasked ? formatDate(row.expiresAt) : '直接到账，无需领取' }}</template></el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <template v-if="isPending(row)">
                <el-button link type="primary" :disabled="busy" @click="generateLink(row)">领取链接</el-button>
                <el-button link type="danger" :disabled="busy" @click="revoke(row)">撤销</el-button>
              </template>
              <span v-else class="field-note">-</span>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="page" :disabled="recordsLoading || busy" :total="total" :page-size="20" layout="total, prev, pager, next" small @current-change="loadRecords" />
      </el-tab-pane>
    </el-tabs>
    <section v-if="linkRecord && canWrite" class="link-panel" aria-label="微信领取链接">
      <h3>微信领取链接</h3>
      <p>{{ linkRecord.coupon.name }} · {{ recipientLabel(linkRecord) }}</p>
      <el-alert v-if="linkError" :title="linkError" type="warning" :closable="false" role="alert" />
      <template v-if="link">
        <el-input :model-value="link.url" readonly aria-label="微信领取链接地址" />
        <p class="field-note">链接到期：{{ formatDate(link.expiresAt) }}。请手动发送给接收人，不会自动发送短信或微信消息。</p>
        <el-button :icon="CopyDocument" :disabled="busy" @click="copyLink">复制微信链接</el-button>
      </template>
      <el-button v-else :loading="linkLoading" :disabled="busy && !linkLoading" @click="generateLink(linkRecord)">重试生成链接</el-button>
    </section>
    <el-alert v-if="!canRead && !canWrite" title="没有优惠券访问权限" type="error" :closable="false" />
    <template #footer><el-button :disabled="busy" @click="close(false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import AdminTableIndex from "./AdminTableIndex.vue";
import { computed, h, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { CopyDocument, Refresh } from "@element-plus/icons-vue";
import { listCoupons, listUsers } from "../services/admin";
import type { Coupon } from "../services/types";
import {
  createCouponDistribution, createCouponDistributionLink, listCouponDistributions, revokeCouponDistribution,
  type CouponDistribution, type CouponDistributionLink, type CreateCouponDistribution, type DistributionCoupon, type DistributionUser
} from "../services/coupon-distributions";
import { useAdminSession } from "../stores/admin-session";

const props = defineProps<{ modelValue: boolean; coupon?: (DistributionCoupon & { perUserLimit?: number | null }) | null; user?: DistributionUser | null; initialTab?: "issue" | "records" }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; distributed: [] }>();
const { hasPermission } = useAdminSession();
const canWrite = computed(() => hasPermission("coupon:write"));
const canRead = computed(() => hasPermission("coupon:view"));
const tab = ref("issue");
const mode = ref<"user" | "phone">("user");
const phoneInvitation = computed(() => !props.user && mode.value === "phone");
const distributionPolicy = "仅支持未关联任何公开活动、每人限用 1 次的优惠券；总量可以不限。";
// Exact messages only: do not expose API details, request IDs, or interpolated recipient data.
const businessErrors = new Set([
  "当前账号无权访问该功能",
  "该请求已用于其他发放操作，请重新确认收券人",
  "收券账号不存在，请重新选择",
  "定向券须设置每人限用 1 次，请先调整优惠券配置",
  "该券已关联公开领券活动，请新建独立的定向优惠券",
  "该接收人已领取过或使用过这张优惠券，请查看已有优惠券及使用记录",
  "该接收人已有待领取邀请，请到发放记录生成链接或撤销原邀请",
  "该账号已领取过这张优惠券，请查看已有优惠券及使用记录",
  "优惠券可发放额度不足，请检查已领取、待领取及使用记录",
  "优惠券不存在、已删除或已停用",
  "优惠券已过期",
  "优惠券即将到期，不能发放",
  "领取有效期须为 1 至 168 小时",
  "领取邀请已失效或已领取，不能生成链接",
  "领取凭证不可用，请撤销后重新发放",
  "领取邀请状态已变化，请刷新记录",
  "发放记录不存在",
  "该券已到账，不能撤销领取邀请",
  "领取状态已变化，请刷新后重试",
  "发放或领取请求正在处理，请稍后重试",
  "操作冲突，请重试",
  "邀请即将到期或无效，请重新生成邀请",
  "微信返回的邀请链接无效，请重试",
  "邀请链接生成超时，请重试",
  "邀请链接暂时无法生成，请重试"
]);
const couponId = ref("");
const targetUser = ref<DistributionUser>();
const phone = ref("");
const remark = ref("");
const expiryHours = ref<number | undefined>(24);
const coupons = ref<Coupon[]>([]);
const users = ref<DistributionUser[]>([]);
const couponsLoading = ref(false), usersLoading = ref(false), recordsLoading = ref(false);
const lookupError = ref(""), issueError = ref(""), recordsError = ref(""), linkError = ref("");
const submitting = ref(false), linkLoading = ref(false), revoking = ref(false);
const busy = computed(() => submitting.value || linkLoading.value || revoking.value);
const attempt = ref<CreateCouponDistribution>();
// Keep retry identities across closing/reopening this dialog, without storing recipient PII on disk.
const retryKeys = new Map<string, string>();
const issued = ref<CouponDistribution>();
const records = ref<CouponDistribution[]>([]);
const page = ref(1), total = ref(0);
const linkRecord = ref<CouponDistribution>();
const link = ref<CouponDistributionLink>();
let couponSearchVersion = 0, userSearchVersion = 0, recordsVersion = 0;

watch(() => props.modelValue, (visible) => {
  couponSearchVersion++; userSearchVersion++; recordsVersion++;
  couponsLoading.value = usersLoading.value = recordsLoading.value = false;
  if (!visible) return;
  tab.value = props.initialTab === "records" || !canWrite.value ? "records" : "issue";
  mode.value = "user";
  couponId.value = props.coupon?.id || "";
  targetUser.value = props.user || undefined;
  phone.value = remark.value = "";
  expiryHours.value = 24;
  attempt.value = issued.value = undefined;
  linkRecord.value = link.value = undefined;
  lookupError.value = issueError.value = recordsError.value = linkError.value = "";
  coupons.value = []; users.value = []; records.value = [];
  page.value = 1; total.value = 0;
}, { immediate: true });

watch([() => props.modelValue, tab], ([visible, value]) => {
  if (!visible) return;
  if (value === "records") void loadRecords();
  if (value === "issue" && !props.coupon && !coupons.value.length && canRead.value) void searchCoupons("");
}, { immediate: true });

async function searchCoupons(keyword: string) {
  if (!canRead.value) return;
  const version = ++couponSearchVersion;
  couponsLoading.value = true;
  lookupError.value = "";
  try {
    const result = await listCoupons({ keyword, page: 1, pageSize: 50 });
    if (version === couponSearchVersion) coupons.value = result.items;
  } catch (error) {
    if (version === couponSearchVersion) lookupError.value = businessError(error, "优惠券读取失败，请重新搜索或检查读取权限。");
  } finally { if (version === couponSearchVersion) couponsLoading.value = false; }
}

async function searchUsers(keyword: string) {
  if (!canWrite.value || props.user) return;
  const version = ++userSearchVersion;
  usersLoading.value = true;
  lookupError.value = "";
  try {
    const result = await listUsers({ keyword, page: 1, pageSize: 30 });
    if (version === userSearchVersion) users.value = result.items;
  } catch (error) {
    if (version === userSearchVersion) lookupError.value = businessError(error, "用户读取失败，请重新搜索或检查用户读取权限。");
  } finally { if (version === userSearchVersion) usersLoading.value = false; }
}

function onUserSelectOpen(open: boolean) { if (open && !users.value.length) void searchUsers(""); }

async function submit() {
  if (!canWrite.value || busy.value || issued.value) return;
  issueError.value = "";
  const selectedCoupon = props.coupon || coupons.value.find((item) => item.id === couponId.value);
  const recipient = props.user || targetUser.value;
  const toUser = !!props.user || mode.value === "user";
  if (!selectedCoupon || (toUser && !recipient?.id)) { issueError.value = "请选择优惠券和接收用户。"; return; }
  if (selectedCoupon.perUserLimit !== undefined && selectedCoupon.perUserLimit !== 1) { issueError.value = "定向发放要求每人限用 1 次，请先调整优惠券配置。"; return; }
  if (!toUser && !/^1[3-9]\d{9}$/.test(phone.value.trim())) { issueError.value = "请输入有效的 11 位中国大陆手机号。"; return; }
  if (!toUser && (!Number.isInteger(expiryHours.value) || expiryHours.value! < 1 || expiryHours.value! > 168)) { issueError.value = "领取有效期须为 1 至 168 小时的整数。"; return; }
  submitting.value = true;
  try {
    const details = [
      `优惠券：${selectedCoupon.name}（${selectedCoupon.code}）`,
      `接收人：${toUser ? `${userLabel(recipient!)} · ID: ${recipient!.id}` : maskPhone(phone.value.trim())}`,
      ...(toUser ? [] : [`领取有效期：${expiryHours.value} 小时，不晚于优惠券到期时间，不改变券的使用有效期`]),
      toUser ? "确认后优惠券立即归入该账号，并生成站内通知。" : "创建待领取邀请，接收账号必须验证同一手机号才能领取。",
      distributionPolicy,
      "定向发放后，该券需先领取才能使用，仅有券码无法直接使用。",
      "不会自动发送短信或微信消息；同一接收人不能重复发放同一优惠券。"
    ];
    try {
      await ElMessageBox.confirm(h("div", { style: "overflow-wrap:anywhere" }, details.map((text) => h("p", text))), "确认定向发放", {
        confirmButtonText: "确认发放", cancelButtonText: "返回检查", type: "warning", closeOnClickModal: false
      });
    } catch { return; }
    if (!canWrite.value) return;
    if (!attempt.value) {
      const payload = {
        couponId: selectedCoupon.id,
        ...(toUser ? { targetUserId: recipient!.id } : { targetPhone: phone.value.trim(), expiresInHours: expiryHours.value! }),
        ...(remark.value.trim() ? { remark: remark.value.trim() } : {})
      };
      const fingerprint = JSON.stringify(payload);
      const idempotencyKey = retryKeys.get(fingerprint) || crypto.randomUUID();
      retryKeys.set(fingerprint, idempotencyKey);
      attempt.value = { ...payload, idempotencyKey };
    }
    issued.value = await createCouponDistribution(attempt.value);
    phone.value = "";
    emit("distributed");
  } catch (error) {
    issueError.value = businessError(error, "未能确认发放结果。请重试同一请求，或在发放记录中核对；同一券与接收人不可重复发放。请同时检查发放权限、券状态及领取限制。");
  } finally { submitting.value = false; }
  if (issued.value && isPending(issued.value)) await generateLink(issued.value);
}

function editAttempt() { attempt.value = undefined; issueError.value = ""; }

async function loadRecords() {
  if (!canRead.value || !props.modelValue) return;
  const version = ++recordsVersion;
  recordsLoading.value = true;
  recordsError.value = "";
  try {
    const result = await listCouponDistributions({ couponId: props.coupon?.id, userId: props.user?.id, page: page.value, pageSize: 20 });
    if (version !== recordsVersion) return;
    records.value = result.items;
    total.value = result.total;
    const linkedRecord = result.items.find((item) => item.id === linkRecord.value?.id);
    if (linkedRecord && !isPending(linkedRecord)) { linkRecord.value = undefined; link.value = undefined; }
  } catch (error) {
    if (version === recordsVersion) { records.value = []; total.value = 0; recordsError.value = businessError(error, "发放记录读取失败，请刷新重试或检查读取权限。"); }
  } finally { if (version === recordsVersion) recordsLoading.value = false; }
}

async function generateLink(record: CouponDistribution) {
  if (!canWrite.value || busy.value || !isPending(record)) return;
  linkLoading.value = true;
  linkRecord.value = record;
  link.value = undefined;
  linkError.value = "";
  try {
    const result = await createCouponDistributionLink(record.id);
    // A mini-program path is not a shareable WeChat URL. Never substitute it for url.
    const url = new URL(result.url);
    const wechatHost = ["wxaurl.cn", "wxmpurl.cn", "w.url.cn", "weixin.qq.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (url.protocol !== "https:" || url.username || url.password || !wechatHost) throw new Error("Invalid WeChat URL");
    if (!Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) throw new Error("Expired link");
    link.value = result;
  } catch (error) {
    linkError.value = businessError(error, "微信领取链接尚未生成。小程序页面路径不能作为微信领取链接发送。") + " 发放记录已保留；重试链接不会重新发券，邀请状态变化时请刷新记录。";
  } finally { linkLoading.value = false; }
}

async function revoke(record: CouponDistribution) {
  if (!canWrite.value || busy.value || !isPending(record)) return;
  revoking.value = true;
  try {
    try {
      await ElMessageBox.confirm(`确认撤销「${record.coupon.name}」发给「${recipientLabel(record)}」的待领取邀请？`, "撤销邀请", {
        type: "warning", confirmButtonText: "确认撤销", cancelButtonText: "取消", closeOnClickModal: false
      });
    } catch { return; }
    if (!canWrite.value) return;
    const updated = await revokeCouponDistribution(record.id);
    if (issued.value?.id === record.id) issued.value = updated;
    if (linkRecord.value?.id === record.id) { linkRecord.value = undefined; link.value = undefined; }
    ElMessage.success("待领取邀请已撤销");
    await loadRecords();
  } catch (error) { ElMessage.error(businessError(error, "撤销失败，请刷新记录核对状态。仅待领取邀请可以撤销。")); }
  finally { revoking.value = false; }
}

async function copyLink() {
  if (!canWrite.value || !link.value) return;
  if (Date.parse(link.value.expiresAt) <= Date.now()) { link.value = undefined; linkError.value = "链接已过期，请重新生成。"; return; }
  try { await navigator.clipboard.writeText(link.value.url); ElMessage.success("微信领取链接已复制，请手动发送"); }
  catch { ElMessage.warning("无法访问剪贴板，请选择上方链接手动复制。"); }
}

function close(value: boolean) { if (!busy.value) emit("update:modelValue", value); }
function businessError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const safeWechatError = /^邀请链接生成失败（错误码 \d{1,6}），(?:请先发布包含邀请页面的小程序版本|请管理员核对小程序 URL Link 权限或稍后重试)$/.test(error.message);
  return businessErrors.has(error.message) || safeWechatError ? error.message : fallback;
}
function maskPhone(value?: string | null) {
  if (!value) return "未绑定手机号";
  const digits = value.replace(/\D/g, "");
  if (value.includes("*")) return value;
  return digits.length >= 7 ? `${digits.slice(-11, -8)}****${digits.slice(-4)}` : "***";
}
function userLabel(user: DistributionUser) { return `${user.realName || user.wechatNickname || user.nickname || "未命名用户"} · ${maskPhone(user.phone)}`; }
function recipientLabel(record: CouponDistribution) {
  return record.targetUserId ? `${record.targetUser ? userLabel(record.targetUser) : "用户"} · ID: ${record.targetUserId}` : maskPhone(record.targetPhoneMasked);
}
function isPending(record: CouponDistribution) { return record.status === "PENDING" && Date.parse(record.expiresAt) > Date.now(); }
function statusText(status: CouponDistribution["status"]) { return { PENDING: "待领取", CLAIMED: "已领取 / 入账", EXPIRED: "已过期", REVOKED: "已撤销" }[status]; }
function statusTone(status: CouponDistribution["status"]) { return status === "CLAIMED" ? "success" : status === "PENDING" ? "warning" : "info"; }
function formatDate(value?: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
</script>

<style scoped>
.distribution-form { margin-top: 20px; }
.distribution-form :deep(.el-select), .distribution-form :deep(.el-input-number) { width: 100%; }
.identity-block { display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.field-note { display: block; margin: 6px 0; color: var(--admin-color-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.distribution-fields { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 20px; }
.distribution-fields--direct { grid-template-columns: minmax(0, 1fr); }
.distribution-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.distribution-summary { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; margin: 20px 0; font-size: 13px; line-height: 1.6; }
.distribution-summary dt { color: var(--admin-color-muted); }
.distribution-summary dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-details { padding: 0 20px; }
.recipient-text { overflow-wrap: anywhere; }
.records-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; overflow-wrap: anywhere; }
.link-panel { border-top: 1px solid var(--admin-color-border); margin-top: 20px; padding-top: 16px; overflow-wrap: anywhere; }
.link-panel h3 { margin: 0; font-size: 15px; color: var(--admin-color-primary-strong); }
.link-panel p { font-size: 13px; }
.link-panel :deep(.el-alert) { margin-bottom: 12px; }
.distribution-dialog :deep(.el-pagination) { margin-top: 16px; max-width: 100%; flex-wrap: wrap; }
@media (max-width: 600px) {
  .distribution-fields { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .distribution-summary { grid-template-columns: 76px minmax(0, 1fr); }
}
</style>
