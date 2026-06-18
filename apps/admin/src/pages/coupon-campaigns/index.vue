<template>
  <section class="admin-page">
    <AdminPageHeader
      title="券活动"
      eyebrow="营销活动"
      subtitle="管理优惠券活动批次、领取码、小程序领取路径和领取记录概览。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增券活动</el-button>
      </template>
    </AdminPageHeader>

    <el-alert
      class="notice"
      type="info"
      show-icon
      :closable="false"
      title="一个活动批次可绑定多张优惠券；用户扫码进入小程序后登录领取，重复领取和库存耗尽由后端拦截。"
    />

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="活动名称 / 领取码" style="width: 260px" @keyup.enter="load" />
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="items" empty-text="暂无券活动">
        <el-table-column prop="name" label="活动" min-width="180" />
        <el-table-column prop="claimCode" label="领取码" width="150" />
        <el-table-column label="绑定券" min-width="220">
          <template #default="{ row }">
            <el-tag v-for="coupon in row.coupons" :key="coupon.id" class="coupon-tag">{{ coupon.name }} / {{ coupon.code }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="库存" width="130">
          <template #default="{ row }">{{ row.claimedCount }} / {{ row.totalLimit ?? "不限" }}</template>
        </el-table-column>
        <el-table-column label="时间" min-width="190">
          <template #default="{ row }">{{ dateRangeText(row.startAt, row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="campaignStatus(row).type">{{ campaignStatus(row).text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="showQr(row)">领取路径</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑券活动' : '新增券活动'" width="720px">
      <el-form :model="form" label-width="124px">
        <el-form-item label="活动名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="绑定优惠券">
          <el-select v-model="form.couponIds" multiple filterable style="width: 100%" placeholder="选择优惠券">
            <el-option v-for="coupon in coupons" :key="coupon.id" :label="`${coupon.name} / ${coupon.code}`" :value="coupon.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="总领取批次数"><el-input-number v-model="form.totalLimit" :min="0" /></el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qrDialogVisible" title="领取入口" width="620px">
      <div v-if="qrInfo" class="qr-info">
        <p><strong>领取码：</strong>{{ qrInfo.claimCode }}</p>
        <p><strong>小程序路径：</strong>{{ qrInfo.path }}</p>
        <p><strong>二维码 Scene：</strong>{{ qrInfo.qrScene }}</p>
        <p><strong>二维码内容：</strong>{{ qrInfo.qrPayload }}</p>
        <el-alert type="warning" :closable="false" title="正式二维码需要接入微信官方小程序码接口；当前页面提供可复制路径和 scene，供运营生成和联调。" />
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import {
  createCouponCampaign,
  generateCouponCampaignQr,
  listCouponCampaigns,
  listCoupons,
  updateCouponCampaign
} from "../../services/admin";
import type { Coupon, CouponCampaign, CouponCampaignQr } from "../../services/types";

const loading = ref(false);
const keyword = ref("");
const items = ref<CouponCampaign[]>([]);
const coupons = ref<Coupon[]>([]);
const dialogVisible = ref(false);
const qrDialogVisible = ref(false);
const qrInfo = ref<CouponCampaignQr | null>(null);
const form = reactive({
  id: "",
  name: "",
  couponIds: [] as string[],
  totalLimit: 0,
  startAt: "",
  endAt: "",
  enabled: true
});

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    const [campaignData, couponData] = await Promise.all([
      listCouponCampaigns({ page: 1, pageSize: 100, keyword: keyword.value }),
      listCoupons({ page: 1, pageSize: 100 })
    ]);
    items.value = campaignData.items;
    coupons.value = couponData.items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", name: "", couponIds: [], totalLimit: 0, startAt: "", endAt: "", enabled: true });
  dialogVisible.value = true;
}

function openEdit(row: CouponCampaign) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    couponIds: row.coupons.map((coupon) => coupon.id),
    totalLimit: row.totalLimit ?? 0,
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    enabled: row.enabled
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    name: form.name,
    couponIds: form.couponIds,
    totalLimit: form.totalLimit > 0 ? form.totalLimit : null,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    enabled: form.enabled
  };
  if (form.id) await updateCouponCampaign(form.id, payload);
  else await createCouponCampaign(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("券活动已保存");
}

async function showQr(row: CouponCampaign) {
  qrInfo.value = await generateCouponCampaignQr(row.id);
  qrDialogVisible.value = true;
}

function campaignStatus(row: CouponCampaign) {
  const now = Date.now();
  if (!row.enabled) return { text: "已停用", type: "info" as const };
  if (row.startAt && new Date(row.startAt).getTime() > now) return { text: "未开始", type: "warning" as const };
  if (row.endAt && new Date(row.endAt).getTime() < now) return { text: "已结束", type: "info" as const };
  if (row.totalLimit !== null && row.claimedCount >= row.totalLimit) return { text: "已领完", type: "danger" as const };
  return { text: "进行中", type: "success" as const };
}

function dateRangeText(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) return "长期有效";
  return `${startAt ? formatTime(startAt) : "立即"} - ${endAt ? formatTime(endAt) : "不限"}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}
</script>

<style scoped>
.coupon-tag {
  margin: 2px 4px 2px 0;
}

.qr-info {
  display: grid;
  gap: 10px;
  color: var(--admin-color-text);
}
</style>
