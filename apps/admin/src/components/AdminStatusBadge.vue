<template>
  <span class="admin-status-badge" :class="`is-${resolvedTone}`">
    <i />
    {{ resolvedLabel }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

const props = withDefaults(
  defineProps<{
    status?: string | boolean | null;
    label?: string;
    tone?: StatusTone;
  }>(),
  {
    status: "",
    label: "",
    tone: undefined
  }
);

const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "草稿", tone: "neutral" },
  PUBLISHED: { label: "已发布", tone: "success" },
  CLOSED: { label: "已关闭", tone: "warning" },
  ARCHIVED: { label: "已归档", tone: "neutral" },
  ACTIVE: { label: "启用", tone: "success" },
  INACTIVE: { label: "停用", tone: "neutral" },
  PAID: { label: "已支付", tone: "success" },
  SUCCESS: { label: "支付成功", tone: "success" },
  PENDING: { label: "待处理", tone: "warning" },
  PENDING_PAYMENT: { label: "待支付", tone: "warning" },
  FAILED: { label: "失败", tone: "danger" },
  CANCELLED: { label: "已取消", tone: "neutral" },
  CANCELED: { label: "已取消", tone: "neutral" },
  REFUNDED: { label: "已退款", tone: "neutral" },
  CHECKED_IN: { label: "已核销", tone: "success" },
  NOT_REQUIRED: { label: "无需核销", tone: "neutral" },
  CREATED: { label: "已创建", tone: "info" },
  DONE: { label: "已完成", tone: "success" },
  WARNING: { label: "有差异", tone: "danger" },
  OFFLINE: { label: "下架", tone: "neutral" },
  SHIPPED: { label: "已发货", tone: "info" },
  COMPLETED: { label: "已完成", tone: "success" }
};

const key = computed(() => {
  if (typeof props.status === "boolean") return props.status ? "ACTIVE" : "INACTIVE";
  return String(props.status || "").toUpperCase();
});

const resolvedLabel = computed(() => props.label || STATUS_MAP[key.value]?.label || String(props.status || "-"));
const resolvedTone = computed<StatusTone>(() => props.tone || STATUS_MAP[key.value]?.tone || "neutral");
</script>

<style scoped>
.admin-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.admin-status-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.admin-status-badge.is-success {
  background: #e9f8f2;
  color: #0f7a52;
}

.admin-status-badge.is-warning {
  background: #fff7e8;
  color: #8a4b00;
}

.admin-status-badge.is-danger {
  background: #fff1f2;
  color: #b42318;
}

.admin-status-badge.is-info {
  background: #e8f0ff;
  color: #0b46c9;
}
</style>
