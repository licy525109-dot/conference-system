<template>
  <div class="group-ticket-pricing">
    <el-form-item label="计价方式">
      <el-radio-group v-model="draft.mode" :disabled="disabled" aria-label="计价方式" @change="changeMode">
        <el-radio-button value="normal">普通票</el-radio-button>
        <el-radio-button value="group">团体票</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item v-if="isGroup" label="团体计价">
      <el-radio-group v-model="draft.groupMode" :disabled="disabled" aria-label="团体计价" @change="changeGroupMode">
        <el-radio-button value="PER_PERSON">按人计价</el-radio-button>
        <el-radio-button value="PACKAGE">固定人数套餐</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item v-if="!isPackage" :label="isGroup ? '基础单价（元/人）' : '价格（元）'" :error="errors.price">
      <el-input v-model="draft.priceYuan" inputmode="decimal" :disabled="disabled" :aria-label="isGroup ? '基础单价（元/人）' : '价格（元）'" />
    </el-form-item>
    <template v-if="isGroup">
      <el-alert v-if="errors.conference" :title="errors.conference" type="warning" :closable="false" show-icon class="pricing-alert">
        <el-button link type="primary" :disabled="disabled" @click="emit('configure-conference')">取消编辑并前往基础信息</el-button>
      </el-alert>
      <div :class="{ 'pricing-grid': !isPackage }">
        <el-form-item v-if="!isPackage" label="最低人数" :error="errors.minQuantity">
          <el-input-number v-model="draft.minQuantity" :min="2" :max="1000" :step="1" controls-position="right" :disabled="disabled" aria-label="最低人数" />
        </el-form-item>
        <el-form-item label="订单最低实付（元）" :error="errors.minPayable">
          <el-input v-model="draft.minPayableYuan" inputmode="decimal" placeholder="0" :disabled="disabled" aria-label="订单最低实付（元）" />
        </el-form-item>
      </div>
      <p class="pricing-note">最低实付留空或 0 表示不限制。既有优惠仍参与计价；优惠后整单实付不足此金额时拒绝下单，不补差价。</p>
      <template v-if="isPackage">
        <div class="pricing-heading">
          <strong>固定人数套餐</strong>
          <span>{{ draft.packages.length }}/20</span>
          <el-button :icon="Plus" :disabled="disabled || draft.packages.length >= 20" @click="addPackage">添加套餐</el-button>
        </div>
        <p class="pricing-note">每档对应固定人数和整团总价，仅可选择已配置的人数，不可按起购人数任意加人。</p>
        <div v-for="(item, index) in draft.packages" :key="item.key" class="pricing-tier pricing-package">
          <el-form-item :label="`第 ${index + 1} 档固定人数`" :error="errors.packages[index]?.quantity">
            <el-input-number v-model="item.quantity" :min="2" :max="1000" :step="1" controls-position="right" :disabled="disabled" :aria-label="`第 ${index + 1} 档固定人数`" />
          </el-form-item>
          <el-form-item label="整团总价（元）" :error="errors.packages[index]?.price">
            <el-input v-model="item.totalYuan" inputmode="decimal" :disabled="disabled" :aria-label="`第 ${index + 1} 档整团总价（元）`" />
          </el-form-item>
          <el-tooltip :content="`删除第 ${index + 1} 档套餐`" placement="top">
            <el-button class="remove-tier" :icon="Delete" :disabled="disabled" :aria-label="`删除第 ${index + 1} 档套餐`" @click="removePackage(index)" />
          </el-tooltip>
        </div>
      </template>
      <template v-else>
        <div class="pricing-heading">
          <strong>人数阶梯</strong>
          <span>{{ draft.tiers.length }}/20</span>
          <el-button :icon="Plus" :disabled="disabled || draft.tiers.length >= 20" @click="addTier">添加阶梯</el-button>
        </div>
        <p class="pricing-note">同一票种达到最高匹配档的人数后，全部人员按该档人均价计价；未匹配阶梯时按基础单价。</p>
        <div v-for="(tier, index) in draft.tiers" :key="tier.key" class="pricing-tier">
          <el-form-item :label="`第 ${index + 1} 档人数`" :error="errors.tiers[index]?.quantity">
            <el-input-number v-model="tier.minQuantity" :min="2" :max="1000" :step="1" controls-position="right" :disabled="disabled" :aria-label="`第 ${index + 1} 档人数`" />
          </el-form-item>
          <el-form-item label="人均价（元/人）" :error="errors.tiers[index]?.price">
            <el-input v-model="tier.priceYuan" inputmode="decimal" :disabled="disabled" :aria-label="`第 ${index + 1} 档人均价（元/人）`" />
          </el-form-item>
          <el-tooltip :content="`删除第 ${index + 1} 档`" placement="top">
            <el-button class="remove-tier" :icon="Delete" :disabled="disabled" :aria-label="`删除第 ${index + 1} 档`" @click="removeTier(index)" />
          </el-tooltip>
        </div>
      </template>
      <el-alert v-if="errors.rules" :title="errors.rules" type="error" :closable="false" show-icon />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { Delete, Plus } from "@element-plus/icons-vue";
import { parseGroupTicketPricing, type GroupTicketPricing } from "@conference/shared";

const props = defineProps<{
  priceCent: number;
  modelValue: GroupTicketPricing | null;
  groupRegistrationEnabled: boolean;
  maxTicketsPerOrder: number | null;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "configure-conference": [] }>();
type TierDraft = { key: number; minQuantity: number | undefined; priceYuan: string };
type PackageDraft = { key: number; quantity: number | undefined; totalYuan: string };
let nextKey = 0;
const draft = reactive({
  mode: "normal",
  groupMode: "PER_PERSON" as "PER_PERSON" | "PACKAGE",
  priceYuan: "0.00",
  minQuantity: 2 as number | undefined,
  minPayableYuan: "",
  tiers: [] as TierDraft[],
  packages: [] as PackageDraft[]
});
const isGroup = computed(() => draft.mode === "group");
const isPackage = computed(() => isGroup.value && draft.groupMode === "PACKAGE");

watch(() => [props.priceCent, props.modelValue] as const, ([price, group]) => {
  draft.mode = group ? "group" : "normal";
  draft.groupMode = group?.mode === "PACKAGE" ? "PACKAGE" : "PER_PERSON";
  draft.priceYuan = draft.groupMode === "PACKAGE" ? "" : centsToYuan(price);
  draft.minQuantity = group?.minQuantity ?? 2;
  draft.minPayableYuan = group ? centsToYuan(group.minPayableAmountCent) : "";
  draft.tiers = (group?.tiers ?? []).map(tier => ({ key: nextKey++, minQuantity: tier.minQuantity, priceYuan: centsToYuan(tier.unitPriceCent) }));
  draft.packages = (group?.packages ?? []).map(item => ({ key: nextKey++, quantity: item.quantity, totalYuan: centsToYuan(item.totalAmountCent) }));
}, { immediate: true });

function centsToYuan(value: number): string {
  return `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function yuanToCents(value: string, optional = false): number | null {
  const text = value.trim();
  if (!text && optional) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  // Convert decimal digits separately so currency never depends on float rounding.
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}

const errors = computed(() => {
  const result = { price: "", minQuantity: "", minPayable: "", conference: "", rules: "", tiers: [] as Array<{ quantity: string; price: string }>, packages: [] as Array<{ quantity: string; price: string }> };
  const base = referencePriceCent();
  if (!isPackage.value && (base === null || (isGroup.value && base === 0))) result.price = isGroup.value ? "请填写大于 0 的金额，最多两位小数，上限 21474836.47 元" : "请填写非负金额，最多两位小数，上限 21474836.47 元";
  if (!isGroup.value) return result;
  const min = draft.minQuantity;
  if (!isPackage.value && (!Number.isInteger(min) || min === undefined || min < 2 || min > 1000)) result.minQuantity = "最低人数须为 2 至 1000 的整数";
  const requiredCapacity = isPackage.value ? Math.max(0, ...draft.packages.map(item => item.quantity ?? 0)) : min;
  if (!props.groupRegistrationEnabled) result.conference = "会议尚未开启团体报名，请先在基础信息中开启并保存。";
  else if (props.maxTicketsPerOrder !== null && requiredCapacity !== undefined && props.maxTicketsPerOrder < requiredCapacity) result.conference = isPackage.value
    ? `已保存的单单最大票数为 ${props.maxTicketsPerOrder}，无法选购全部套餐。请先在基础信息中将上限调至至少 ${requiredCapacity} 并保存。`
    : `已保存的单单最大票数为 ${props.maxTicketsPerOrder}，低于最低人数。请先调整基础信息并保存。`;
  const floor = yuanToCents(draft.minPayableYuan, true);
  if (floor === null) result.minPayable = "请填写非负金额，最多两位小数，上限 21474836.47 元";
  if (isPackage.value) {
    if (!draft.packages.length || draft.packages.length > 20) result.rules = "固定人数套餐须配置 1 至 20 档";
    let previous = 1;
    result.packages = draft.packages.map(item => {
      const quantity = item.quantity;
      const total = yuanToCents(item.totalYuan);
      const error = { quantity: "", price: "" };
      if (!Number.isInteger(quantity) || quantity === undefined || quantity < 2 || quantity > 1000) error.quantity = "套餐人数须为 2 至 1000 的整数";
      else if (quantity <= previous) error.quantity = "套餐人数须递增且不能重复";
      else if (props.maxTicketsPerOrder !== null && quantity > props.maxTicketsPerOrder) error.quantity = "套餐人数超过会议单单最大票数";
      if (total === null || total === 0) error.price = "请填写大于 0 的总额，最多两位小数，上限 21474836.47 元";
      else if (quantity !== undefined && total < quantity) error.price = "整团总价须保证每人至少 0.01 元";
      else if (floor !== null && total < floor) error.price = "套餐总额不能低于订单最低实付";
      previous = quantity ?? previous;
      return error;
    });
  } else {
    let previousQuantity = (min ?? 2) - 1;
    let previousPrice = base;
    result.tiers = draft.tiers.map(tier => {
      const quantity = tier.minQuantity;
      const price = yuanToCents(tier.priceYuan);
      const error = { quantity: "", price: "" };
      if (!Number.isInteger(quantity) || quantity === undefined || quantity < (min ?? 2) || quantity > 1000) error.quantity = "须为不低于最低人数、且不超过 1000 的整数";
      else if (quantity <= previousQuantity) error.quantity = "阶梯人数须递增且不能重复";
      if (price === null || price === 0) error.price = "须大于 0，最多两位小数，上限 21474836.47 元";
      else if (previousPrice !== null && price > previousPrice) error.price = "不能高于基础单价或上一档人均价";
      previousQuantity = quantity ?? previousQuantity;
      previousPrice = price;
      return error;
    });
    if (draft.tiers.length > 20) result.rules = "人数阶梯最多配置 20 项";
  }
  if (!result.price && !result.minQuantity && !result.minPayable && !result.rules && !result.tiers.some(tier => tier.quantity || tier.price) && !result.packages.some(item => item.quantity || item.price)) {
    try { parseGroupTicketPricing(groupValue(), base!); }
    catch (cause) { result.rules = cause instanceof Error ? cause.message : "团体票规则不正确"; }
  }
  return result;
});

function groupValue() {
  if (isPackage.value) return {
    version: 1,
    mode: "PACKAGE",
    minQuantity: draft.packages[0]?.quantity,
    minPayableAmountCent: yuanToCents(draft.minPayableYuan, true),
    tiers: [],
    packages: draft.packages.map(item => ({ quantity: item.quantity, totalAmountCent: yuanToCents(item.totalYuan) }))
  };
  return {
    version: 1,
    minQuantity: draft.minQuantity,
    minPayableAmountCent: yuanToCents(draft.minPayableYuan, true),
    tiers: draft.tiers.map(tier => ({ minQuantity: tier.minQuantity, unitPriceCent: yuanToCents(tier.priceYuan) }))
  };
}

function changeMode() {
  if (!isGroup.value) {
    if (draft.groupMode === "PACKAGE") draft.priceYuan = "";
    draft.groupMode = "PER_PERSON";
    draft.minQuantity = 2;
    draft.minPayableYuan = "";
    draft.tiers = [];
    draft.packages = [];
  }
}

function changeGroupMode() {
  draft.priceYuan = "";
  draft.minQuantity = 2;
  draft.tiers = [];
  draft.packages = [];
  if (isPackage.value) addPackage();
}

function referencePriceCent(): number | null {
  if (!isPackage.value) return yuanToCents(draft.priceYuan);
  const first = draft.packages[0];
  const total = first ? yuanToCents(first.totalYuan) : null;
  if (!first || total === null || !Number.isInteger(first.quantity) || first.quantity === undefined || first.quantity < 2) return null;
  return Math.floor(total / first.quantity);
}

function addPackage() {
  if (props.disabled || draft.packages.length >= 20) return;
  const previous = draft.packages.at(-1);
  draft.packages.push({ key: nextKey++, quantity: previous ? (previous.quantity ?? 2) + 1 : 2, totalYuan: "" });
}

function removePackage(index: number) {
  if (!props.disabled) draft.packages.splice(index, 1);
}

function addTier() {
  if (props.disabled || draft.tiers.length >= 20) return;
  const previous = draft.tiers.at(-1);
  draft.tiers.push({ key: nextKey++, minQuantity: previous ? (previous.minQuantity ?? 2) + 1 : draft.minQuantity, priceYuan: previous?.priceYuan ?? draft.priceYuan });
}

function removeTier(index: number) {
  if (!props.disabled) draft.tiers.splice(index, 1);
}

function validate(): { priceCent: number; groupPricingJson: GroupTicketPricing | null } | null {
  const error = errors.value;
  if (error.price || error.minQuantity || error.minPayable || error.conference || error.rules || error.tiers.some(tier => tier.quantity || tier.price) || error.packages.some(item => item.quantity || item.price)) return null;
  const priceCent = referencePriceCent()!;
  return { priceCent, groupPricingJson: isGroup.value ? parseGroupTicketPricing(groupValue(), priceCent) : null };
}

defineExpose({ validate });
</script>

<style scoped>
.group-ticket-pricing { min-width: 0; }
.pricing-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pricing-alert { margin-bottom: 18px; }
.pricing-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; }
.pricing-heading strong { font-size: 14px; color: var(--admin-color-text); }
.pricing-heading span { color: var(--admin-color-muted); font-size: 12px; }
.pricing-heading .el-button { margin-left: auto; }
.pricing-note { margin: 0 0 14px; color: var(--admin-color-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.pricing-heading + .pricing-note { margin-top: 8px; }
.pricing-tier { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 36px; gap: 12px; align-items: start; }
.remove-tier { width: 36px; height: 36px; margin: 30px 0 0; padding: 0; }
.group-ticket-pricing :deep(.el-input-number) { width: 100%; }
.group-ticket-pricing :deep(.el-form-item) { min-width: 0; }
.group-ticket-pricing :deep(.el-form-item__error) { position: static; line-height: 1.5; }
@media (max-width: 480px) {
  .pricing-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .pricing-tier { grid-template-columns: minmax(0, 1fr) 36px; gap: 0 8px; border-top: 1px solid var(--admin-color-border); padding-top: 12px; }
  .pricing-tier .el-form-item { grid-column: 1; }
  .remove-tier { grid-column: 2; grid-row: 1; }
}
</style>
