<template>
  <view class="assistant ui-card">
    <view class="messages">
      <view v-for="message in messages" :key="message.id" :class="['message', message.role]">
        <text>{{ message.text }}</text>
        <view v-if="message.sources?.length" class="source-list">
          <view v-for="source in message.sources" :key="source.id || `${source.documentId}-${source.chunkIndex}`" class="source-item">
            <text class="source-title">{{ source.documentTitle || "知识库资料" }}</text>
            <text class="source-excerpt">{{ source.excerpt }}</text>
          </view>
        </view>
      </view>
    </view>
    <view v-if="statusMessage" class="status-tip">
      <text>{{ statusMessage }}</text>
    </view>
    <view class="suggestions">
      <button v-for="item in suggestions" :key="item" class="chip" @click="ask(item)">{{ item }}</button>
    </view>
    <view class="composer">
      <input v-model="question" class="input" placeholder="询问会议资料" />
      <button class="ui-button-primary ui-button-compact" :loading="loading" @click="ask(question)">发送</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { askConferenceAi, getConferenceAiSuggestions, type AiAnswerSource } from "@/services/operations";

const props = defineProps<{ conferenceId: string }>();
const question = ref("");
const loading = ref(false);
const suggestions = ref<string[]>([]);
const statusMessage = ref("");
const messages = ref<Array<{ id: string; role: "user" | "assistant"; text: string; sources?: AiAnswerSource[] }>>([
  { id: "welcome", role: "assistant", text: "我只根据当前会议资料回答，不确定的问题会提示联系会务人员。" }
]);

onMounted(async () => {
  try {
    const response = await getConferenceAiSuggestions(props.conferenceId);
    suggestions.value = response.items;
    statusMessage.value = response.message || "";
  } catch {
    statusMessage.value = "推荐问题暂时不可用，可直接输入问题。";
  }
});

async function ask(text: string) {
  const value = text.trim();
  if (!value || loading.value) return;
  question.value = "";
  messages.value.push({ id: `u-${Date.now()}`, role: "user", text: value });
  loading.value = true;
  try {
    const response = await askConferenceAi(props.conferenceId, value);
    statusMessage.value = statusText(response.status);
    messages.value.push({ id: `a-${Date.now()}`, role: "assistant", text: response.answer, sources: response.sources || [] });
  } catch {
    messages.value.push({ id: `e-${Date.now()}`, role: "assistant", text: "会议助手暂时不可用，请稍后再试。" });
  } finally {
    loading.value = false;
  }
}

function statusText(status: string | undefined) {
  if (status === "DISABLED") return "会议助手未启用。";
  if (status === "PROVIDER_NOT_CONFIGURED") return "AI provider 未配置，请联系会务人员。";
  if (status === "NO_KNOWLEDGE_BASE") return "当前会议暂未配置知识库。";
  if (status === "FALLBACK") return "当前回答为兜底提示，未命中会议资料。";
  return "";
}
</script>

<style scoped>
.assistant {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 24rpx;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.message {
  max-width: 86%;
  padding: 18rpx 20rpx;
  border-radius: var(--ui-radius-md);
  font-size: 26rpx;
  line-height: 1.6;
}

.assistant .assistant,
.message.assistant {
  align-self: flex-start;
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-text);
}

.message.user {
  align-self: flex-end;
  background: var(--ui-color-primary);
  color: #fff;
}

.suggestions,
.composer {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.status-tip {
  padding: 14rpx 18rpx;
  border-radius: var(--ui-radius-md);
  background: #fff7ed;
  color: #9a3412;
  font-size: 24rpx;
  line-height: 1.5;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 14rpx;
}

.source-item {
  padding: 12rpx 14rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: #fff;
}

.source-title,
.source-excerpt {
  display: block;
  font-size: 22rpx;
  line-height: 1.5;
}

.source-title {
  color: var(--ui-color-primary);
}

.source-excerpt {
  margin-top: 4rpx;
  color: var(--ui-color-text-muted);
}

.chip {
  min-height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 24rpx;
}

.input {
  flex: 1;
  min-height: 72rpx;
  padding: 0 18rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  font-size: 26rpx;
}
</style>
