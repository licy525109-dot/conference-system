<template>
  <section :class="['admin-ds-node', `admin-ds-node--${node.type}`]">
    <template v-if="node.type === 'ds-banner'">
      <img v-if="imageUrl" class="admin-ds-banner__image" :src="imageUrl" alt="" />
      <div class="admin-ds-banner__copy">
        <span v-if="subtitle" class="admin-ds-kicker">{{ subtitle }}</span>
        <strong>{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
        <button v-if="buttonText">{{ buttonText }}</button>
      </div>
    </template>

    <template v-else-if="node.type === 'ds-grid'">
      <strong v-if="title">{{ title }}</strong>
      <div class="admin-ds-grid" :style="gridStyle">
        <article v-for="(item, index) in displayItems" :key="itemKey(item, index)">
          <img v-if="itemImage(item)" :src="itemImage(item)" alt="" />
          <span v-else>{{ itemTitle(item).slice(0, 1) || "项" }}</span>
          <b>{{ itemTitle(item) }}</b>
          <small v-if="itemSubtitle(item)">{{ itemSubtitle(item) }}</small>
        </article>
      </div>
    </template>

    <template v-else-if="node.type === 'ds-list'">
      <strong v-if="title">{{ title }}</strong>
      <p v-if="displayItems.length === 0" class="admin-ds-empty">{{ emptyText }}</p>
      <article v-for="(item, index) in displayItems" :key="itemKey(item, index)" class="admin-ds-list-item">
        <img v-if="itemImage(item)" :src="itemImage(item)" alt="" />
        <div>
          <b>{{ itemTitle(item) }}</b>
          <small v-if="itemSubtitle(item)">{{ itemSubtitle(item) }}</small>
        </div>
      </article>
    </template>

    <template v-else-if="node.type === 'ds-carousel'">
      <div v-if="images.length > 0" class="admin-ds-carousel">
        <img :src="images[0]" alt="" />
        <span>{{ images.length }} 张图片</span>
      </div>
      <p v-else class="admin-ds-empty">{{ emptyText }}</p>
    </template>

    <template v-else-if="node.type === 'ds-button'">
      <button>{{ buttonText || title || "查看" }}</button>
    </template>

    <template v-else>
      <strong v-if="title">{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
      <img v-if="imageUrl" class="admin-ds-image" :src="imageUrl" alt="" />
      <button v-if="buttonText">{{ buttonText }}</button>
    </template>

    <div v-if="node.children.length > 0" class="admin-ds-children">
      <AdminDslNodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResolvedDslNode } from "@conference/dsl-runtime";

const props = defineProps<{
  node: ResolvedDslNode;
}>();

const title = computed(() => readString(props.node.props.title));
const subtitle = computed(() => readString(props.node.props.subtitle));
const description = computed(() => readString(props.node.props.description || props.node.props.text));
const imageUrl = computed(() => readString(props.node.props.imageUrl));
const buttonText = computed(() => readString(props.node.props.buttonText || props.node.props.text));
const emptyText = computed(() => readString(props.node.props.emptyText) || "暂无内容");
const images = computed(() => (Array.isArray(props.node.props.images) ? props.node.props.images.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []));
const displayItems = computed(() => {
  const directItems = Array.isArray(props.node.props.items) ? props.node.props.items : [];
  const dataItems = Array.isArray(props.node.props.data) ? props.node.props.data : [];
  return directItems.length > 0 ? directItems : dataItems;
});
const gridStyle = computed(() => {
  const columns = Number(props.node.props.columns || 4);
  return { gridTemplateColumns: `repeat(${Math.min(Math.max(columns, 2), 4)}, minmax(0, 1fr))` };
});

function itemKey(item: unknown, index: number): string {
  return isRecord(item) && typeof item.id === "string" ? item.id : `item-${index}`;
}

function itemTitle(item: unknown): string {
  return isRecord(item) ? readString(item.title || item.name || item.label) || "内容" : String(item || "内容");
}

function itemSubtitle(item: unknown): string {
  return isRecord(item) ? readString(item.subtitle || item.summary || item.description) : "";
}

function itemImage(item: unknown): string {
  return isRecord(item) ? readString(item.imageUrl || item.coverImageUrl || item.iconUrl) : "";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
</script>

<style scoped>
.admin-ds-node {
  overflow: hidden;
  padding: 18px;
  border: 1px solid #dbe4e1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 28px rgb(23 32 38 / 8%);
}

.admin-ds-node strong {
  display: block;
  color: #172026;
  font-size: 18px;
  line-height: 1.35;
}

.admin-ds-node p,
.admin-ds-node small {
  color: #5f6d76;
  line-height: 1.5;
}

.admin-ds-node button {
  min-width: 88px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #315d7d, #3a8f79);
  color: #fff;
}

.admin-ds-node--ds-banner {
  position: relative;
  min-height: 210px;
  padding: 0;
  background: linear-gradient(135deg, #315d7d, #3a8f79);
}

.admin-ds-banner__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-ds-banner__copy {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 210px;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  padding: 24px;
  background: linear-gradient(180deg, transparent, rgb(0 0 0 / 40%));
}

.admin-ds-banner__copy strong,
.admin-ds-banner__copy p,
.admin-ds-kicker {
  color: #fff;
}

.admin-ds-grid {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.admin-ds-grid article,
.admin-ds-list-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #f8faf9;
}

.admin-ds-grid article {
  flex-direction: column;
  align-items: center;
}

.admin-ds-grid img,
.admin-ds-grid span {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #e6eef4;
  color: #315d7d;
  object-fit: cover;
  text-align: center;
  line-height: 42px;
}

.admin-ds-list-item img {
  width: 92px;
  height: 70px;
  border-radius: 8px;
  object-fit: cover;
}

.admin-ds-carousel,
.admin-ds-image {
  overflow: hidden;
  border-radius: 12px;
}

.admin-ds-carousel img,
.admin-ds-image {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
}

.admin-ds-empty {
  padding: 18px;
  border-radius: 10px;
  background: #f8faf9;
  text-align: center;
}

.admin-ds-children {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
</style>
