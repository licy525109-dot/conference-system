<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会员价规则"
      eyebrow="会员"
      subtitle="会员价已参与报名 quote/create order；保存规则只影响新的报价和新订单，订单金额仍由后端重新计算。"
    >
      <AdminFeatureBadge label="计价顺序" description="SKU 原价 -> 会员价 -> 优惠券 -> 满减 -> 最终应付。" tone="success" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增规则</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-select v-model="levelId" clearable placeholder="会员等级" style="width: 200px" @change="load">
        <el-option v-for="item in levels" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="conferenceId" clearable filterable placeholder="适用会议" style="width: 280px" @change="load">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <template #actions><el-button :loading="loading" type="primary" @click="load">查询</el-button></template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="rules" empty-text="暂无会员价规则">
        <el-table-column label="等级" min-width="160"><template #default="{ row }">{{ row.level.name }}</template></el-table-column>
        <el-table-column label="适用范围" min-width="220">
          <template #default="{ row }">
            <div>{{ conferenceName(row.conferenceId) }}</div>
            <div class="muted-text">{{ skuName(row.skuId) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="优惠方式" width="120"><template #default="{ row }">{{ discountTypeText(row.discountType) }}</template></el-table-column>
        <el-table-column label="优惠值" width="120"><template #default="{ row }">{{ ruleValueText(row) }}</template></el-table-column>
        <el-table-column label="时间窗" min-width="190">
          <template #default="{ row }">
            <div>{{ row.startAt ? row.startAt.slice(0, 10) : "立即生效" }}</div>
            <div class="muted-text">至 {{ row.endAt ? row.endAt.slice(0, 10) : "长期有效" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled && !row.disabledAt" :label="row.enabled && !row.disabledAt ? '启用' : '停用'" /></template></el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="removeRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <AdminSectionCard title="规则优先级" subtitle="后端 quote/create order 使用同一套计价逻辑。">
      <p class="muted-text">同一票种命中多条规则时，优先选择优惠金额更大的规则；优惠金额相同，则精确票种优先，再精确会议优先。过期、停用、等级停用或关闭会员价的规则不会命中。</p>
    </AdminSectionCard>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会员价规则' : '新增会员价规则'" width="720px">
      <el-form :model="form" label-width="130px">
        <el-form-item>
          <template #label>会员等级<FieldHelp content="使用等级选择器绑定；停用等级不会命中新订单会员价。" /></template>
          <el-select v-model="form.levelId" filterable placeholder="请选择会员等级">
            <el-option v-for="item in levels" :key="item.id" :label="`${item.name}${item.pricingEnabled ? '' : '（不参与会员价）'}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>适用会议<FieldHelp content="为空表示全局规则；选择会议后可继续选择该会议票种。" /></template>
          <el-select v-model="form.conferenceId" clearable filterable placeholder="全局适用" @change="loadFormSkus">
            <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>适用票种<FieldHelp content="为空表示该会议下所有票种；选择票种则规则更精确。" /></template>
          <el-select v-model="form.skuId" clearable filterable placeholder="全部票种" :disabled="!form.conferenceId">
            <el-option v-for="item in formSkus" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>优惠方式<FieldHelp content="固定价、折扣基点、立减金额三选一；服务端会拒绝同时配置多种方式。" /></template>
          <el-radio-group v-model="form.discountType">
            <el-radio-button label="FIXED_PRICE">固定价</el-radio-button>
            <el-radio-button label="DISCOUNT">折扣基点</el-radio-button>
            <el-radio-button label="REDUCE">立减</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.discountType === 'FIXED_PRICE'">
          <template #label>固定价(元)<FieldHelp content="设置后按固定单价计入会员价，必须低于原票种价才会产生优惠。" /></template>
          <el-input-number v-model="form.fixedPriceYuan" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item v-if="form.discountType === 'DISCOUNT'">
          <template #label>折扣基点<FieldHelp content="9000 表示 9 折；只能与固定价、立减三选一。" /></template>
          <el-input-number v-model="form.discountPercent" :min="0" :max="10000" />
        </el-form-item>
        <el-form-item v-if="form.discountType === 'REDUCE'">
          <template #label>立减(元)<FieldHelp content="按单张票价立减，最终不会低于 0 元。" /></template>
          <el-input-number v-model="form.discountYuan" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="生效时间"><el-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="立即生效" /></el-form-item>
        <el-form-item label="失效时间"><el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="长期有效" /></el-form-item>
        <el-form-item>
          <template #label>启用状态<FieldHelp content="停用规则不会命中 quote/create order。" /></template>
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSave" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import { createMemberPricingRule, deleteMemberPricingRule, listConferences, listMemberLevels, listMemberPricingRules, listSkus, updateMemberPricingRule } from "../../services/admin";
import type { Conference, MemberLevel, MembershipPriceRule, Sku } from "../../services/types";

const levels = ref<MemberLevel[]>([]);
const conferences = ref<Conference[]>([]);
const skusByConference = ref<Record<string, Sku[]>>({});
const rules = ref<MembershipPriceRule[]>([]);
const levelId = ref("");
const conferenceId = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const formSkus = ref<Sku[]>([]);
const form = reactive({
  id: "",
  levelId: "",
  conferenceId: "",
  skuId: "",
  discountType: "FIXED_PRICE" as "FIXED_PRICE" | "DISCOUNT" | "REDUCE",
  fixedPriceYuan: undefined as number | undefined,
  discountPercent: undefined as number | undefined,
  discountYuan: undefined as number | undefined,
  startAt: "",
  endAt: "",
  enabled: true
});
const canSave = computed(() => {
  if (!form.levelId) return false;
  if (form.discountType === "FIXED_PRICE") return typeof form.fixedPriceYuan === "number" && form.fixedPriceYuan > 0;
  if (form.discountType === "DISCOUNT") return typeof form.discountPercent === "number" && form.discountPercent > 0;
  return typeof form.discountYuan === "number" && form.discountYuan > 0;
});

onMounted(async () => {
  [levels.value, conferences.value] = await Promise.all([
    listMemberLevels().then((result) => result.items),
    listConferences({ page: 1, pageSize: 200 }).then((result) => result.items)
  ]);
  await load();
});

async function load() {
  loading.value = true;
  try {
    rules.value = (await listMemberPricingRules({ levelId: levelId.value, conferenceId: conferenceId.value })).items;
    await Promise.all(conferences.value.map((conference) => ensureSkus(conference.id)));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", levelId: levelId.value || levels.value[0]?.id || "", conferenceId: conferenceId.value || "", skuId: "", discountType: "FIXED_PRICE", fixedPriceYuan: undefined, discountPercent: undefined, discountYuan: undefined, startAt: "", endAt: "", enabled: true });
  void loadFormSkus();
  dialogVisible.value = true;
}

async function openEdit(row: MembershipPriceRule) {
  Object.assign(form, {
    id: row.id,
    levelId: row.levelId,
    conferenceId: row.conferenceId || "",
    skuId: row.skuId || "",
    discountType: row.discountType || inferDiscountType(row),
    fixedPriceYuan: typeof row.fixedPriceCent === "number" ? row.fixedPriceCent / 100 : undefined,
    discountPercent: row.discountPercent || undefined,
    discountYuan: typeof row.discountCent === "number" ? row.discountCent / 100 : undefined,
    startAt: row.startAt || "",
    endAt: row.endAt || "",
    enabled: row.enabled
  });
  await loadFormSkus();
  dialogVisible.value = true;
}

async function loadFormSkus() {
  form.skuId = form.conferenceId ? form.skuId : "";
  formSkus.value = form.conferenceId ? await ensureSkus(form.conferenceId) : [];
}

async function ensureSkus(id: string) {
  if (!id) return [];
  if (!skusByConference.value[id]) {
    skusByConference.value[id] = (await listSkus(id)).items;
  }
  return skusByConference.value[id];
}

async function save() {
  const fixedPriceCent = form.discountType === "FIXED_PRICE" && typeof form.fixedPriceYuan === "number" && form.fixedPriceYuan > 0 ? Math.round(form.fixedPriceYuan * 100) : null;
  const discountPercent = form.discountType === "DISCOUNT" && typeof form.discountPercent === "number" && form.discountPercent > 0 ? form.discountPercent : null;
  const discountCent = form.discountType === "REDUCE" && typeof form.discountYuan === "number" && form.discountYuan > 0 ? Math.round(form.discountYuan * 100) : null;
  const payload = {
    levelId: form.levelId,
    conferenceId: form.conferenceId || null,
    skuId: form.skuId || null,
    discountType: form.discountType,
    fixedPriceCent,
    discountPercent,
    discountCent,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    enabled: form.enabled
  };
  if (form.id) await updateMemberPricingRule(form.id, payload);
  else await createMemberPricingRule(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("会员价规则已保存");
}

async function removeRule(row: MembershipPriceRule) {
  await ElMessageBox.confirm("删除后该会员价规则不会再命中新订单，历史订单计价快照不受影响。确认删除？", "删除会员价规则", {
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
    type: "warning"
  });
  await deleteMemberPricingRule(row.id);
  await load();
  ElMessage.success("会员价规则已删除");
}

function conferenceName(id: string | null) {
  return id ? conferences.value.find((item) => item.id === id)?.title || id : "全部会议";
}

function skuName(id: string | null) {
  if (!id) return "全部票种";
  for (const skus of Object.values(skusByConference.value)) {
    const item = skus.find((sku) => sku.id === id);
    if (item) return item.name;
  }
  return id;
}

function moneyMaybe(value: number | null) {
  return typeof value === "number" ? `¥${(value / 100).toFixed(2)}` : "-";
}

function discountText(value: number | null) {
  return value ? `${(value / 100).toFixed(2)}%` : "-";
}

function discountTypeText(value: string) {
  return { FIXED_PRICE: "固定价", DISCOUNT: "折扣", REDUCE: "立减" }[value] ?? value;
}

function ruleValueText(row: MembershipPriceRule) {
  if (row.discountType === "FIXED_PRICE") return moneyMaybe(row.fixedPriceCent);
  if (row.discountType === "DISCOUNT") return discountText(row.discountPercent);
  if (row.discountType === "REDUCE") return moneyMaybe(row.discountCent);
  return "-";
}

function inferDiscountType(row: MembershipPriceRule): "FIXED_PRICE" | "DISCOUNT" | "REDUCE" {
  if (typeof row.fixedPriceCent === "number") return "FIXED_PRICE";
  if (typeof row.discountPercent === "number") return "DISCOUNT";
  return "REDUCE";
}
</script>
