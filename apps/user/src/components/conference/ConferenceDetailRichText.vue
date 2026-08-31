<template>
  <view v-if="renderable" class="conference-detail-rich-text" aria-label="会议详情内容">
    <rich-text class="conference-detail-rich-text__content" :nodes="displayNodes" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  isConferenceDetailRichTextRenderable,
  type ConferenceDetailRichTextContent,
  type ConferenceDetailRichTextElementNode,
  type ConferenceDetailRichTextNode
} from "@conference/shared";

const props = defineProps<{
  content: ConferenceDetailRichTextContent;
}>();

const renderable = computed(() => isConferenceDetailRichTextRenderable(props.content));
const displayNodes = computed(() => props.content.nodes.map(applyDefaultStyles));

const defaultStyles: Partial<Record<ConferenceDetailRichTextElementNode["name"], string>> = {
  p: "margin:0 0 18px;color:#344054;font-size:16px;line-height:1.82;overflow-wrap:anywhere",
  h1: "margin:30px 0 14px;color:#132033;font-size:28px;font-weight:800;line-height:1.4",
  h2: "margin:28px 0 12px;color:#132033;font-size:24px;font-weight:800;line-height:1.42",
  h3: "margin:24px 0 10px;color:#132033;font-size:20px;font-weight:800;line-height:1.45",
  h4: "margin:22px 0 9px;color:#132033;font-size:18px;font-weight:800;line-height:1.5",
  blockquote: "margin:20px 0;padding:15px 16px;border-left:3px solid #a9863d;background-color:#faf7ef;color:#4b5565;font-size:16px;line-height:1.75",
  ul: "margin:0 0 18px;padding-left:24px;color:#344054;font-size:16px;line-height:1.75",
  ol: "margin:0 0 18px;padding-left:24px;color:#344054;font-size:16px;line-height:1.75",
  li: "margin:0 0 8px",
  img: "width:100%;max-width:100%;height:auto;display:block;margin:18px 0",
  a: "color:#2f6484;text-decoration:underline",
  hr: "margin:26px 0;border:0;border-top:1px solid #dfe4e1",
  pre: "margin:18px 0;padding:14px;background-color:#f4f6f8;color:#293445;font-size:14px;line-height:1.65;overflow-wrap:anywhere",
  code: "padding:2px 4px;background-color:#f4f6f8;color:#293445;font-size:14px",
  strong: "font-weight:800",
  b: "font-weight:800"
};

function applyDefaultStyles(node: ConferenceDetailRichTextNode): ConferenceDetailRichTextNode {
  if ("text" in node) return { ...node };
  const defaultStyle = defaultStyles[node.name] ?? "";
  const configuredStyle = node.attrs.style ?? "";
  return {
    ...node,
    attrs: {
      ...node.attrs,
      ...(defaultStyle || configuredStyle ? { style: mergeStyles(defaultStyle, configuredStyle) } : {})
    },
    children: node.children.map(applyDefaultStyles)
  };
}

function mergeStyles(base: string, override: string): string {
  const declarations = new Map<string, string>();
  for (const source of [base, override]) {
    for (const declaration of source.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator <= 0) continue;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (property && value) declarations.set(property, value);
    }
  }
  return [...declarations].map(([property, value]) => `${property}:${value}`).join(";");
}
</script>

<style scoped>
.conference-detail-rich-text {
  padding: 38rpx 32rpx 54rpx;
  border-top: 12rpx solid #f2f3f1;
  background: #ffffff;
  box-sizing: border-box;
}

.conference-detail-rich-text__content {
  display: block;
  width: 100%;
  color: #344054;
  overflow-wrap: anywhere;
}
</style>
