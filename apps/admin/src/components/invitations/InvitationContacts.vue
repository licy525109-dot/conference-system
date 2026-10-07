<template>
  <div class="invitation-contacts">
    <section
      v-for="contact in contacts"
      :key="contact.id"
      class="invitation-contact"
    >
      <div class="invitation-contact-details">
        <h3 v-if="contact.name">{{ contact.name }}</h3>
        <p v-if="contact.role" class="contact-role">{{ contact.role }}</p>
        <div class="contact-actions">
          <a
            v-if="contact.phone"
            :href="phoneHref(contact.phone) || undefined"
            :aria-label="`联系${contact.name || '会务组'} ${contact.phone}`"
            ><Phone class="contact-icon" /><span>{{ contact.phone }}</span></a
          ><button
            v-if="contact.wechat"
            type="button"
            :aria-label="`复制${contact.name || '会务组'}微信号`"
            @click="copy(contact)"
          >
            <ChatDotRound class="contact-icon" /><span>{{
              contact.wechat
            }}</span
            ><Check
              v-if="copied === contact.id"
              class="contact-icon"
            /><CopyDocument v-else class="contact-icon" />
          </button>
        </div>
        <p v-if="contact.note" class="contact-note">{{ contact.note }}</p>
        <small v-if="copyError === contact.id" role="status"
          >未能复制，请长按微信号</small
        >
      </div>
      <figure v-if="contact.imageUrl">
        <img
          :src="assetUrl(contact.imageUrl)"
          :alt="`${contact.name || '会务组'}联系二维码`"
          loading="lazy"
        />
        <figcaption>长按识别二维码</figcaption>
      </figure>
    </section>
    <span class="contact-copy-status" role="status">{{
      copied ? "微信号已复制" : ""
    }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  Phone,
  ChatDotRound,
  Check,
  CopyDocument,
} from "@element-plus/icons-vue";
import {
  invitationLinkUrl,
  type InvitationModule,
  type InvitationContact,
} from "@conference/shared";
const props = defineProps<{ module: InvitationModule; assetOrigin: string }>();
const contacts = computed(() =>
  (props.module.contacts || []).filter((contact) =>
    [
      contact.name,
      contact.role,
      contact.phone,
      contact.wechat,
      contact.note,
      contact.imageUrl,
    ].some((value) => value.trim()),
  ),
);
const copied = ref(""),
  copyError = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? props.assetOrigin + url : url;
const phoneHref = (phone: string) =>
  /^[+\d\s()-]+$/.test(phone)
    ? invitationLinkUrl(`tel:${phone.replace(/[^+\d]/g, "")}`)
    : "";
async function copy(contact: InvitationContact) {
  clearTimeout(timer);
  copied.value = "";
  copyError.value = "";
  try {
    await navigator.clipboard.writeText(contact.wechat);
    copied.value = contact.id;
    timer = setTimeout(() => (copied.value = ""), 2500);
  } catch {
    copyError.value = contact.id;
  }
}
onBeforeUnmount(() => clearTimeout(timer));
</script>
<style scoped>
.invitation-contact {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 0;
  border-bottom: 1px solid
    color-mix(in srgb, var(--invite-accent) 20%, transparent);
}
.invitation-contact:first-child {
  padding-top: 0;
}
.invitation-contact:last-of-type {
  border-bottom: 0;
  padding-bottom: 0;
}
.invitation-contact-details {
  min-width: 0;
  flex: 1;
}
.invitation-contact h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.invitation-contact p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.contact-role {
  color: var(--invite-accent);
}
.contact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin: 12px 0;
}
.contact-actions a,
.contact-actions button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  line-height: 1.8;
  text-decoration: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  max-width: 100%;
}
.contact-actions span {
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: text;
}
.contact-actions .contact-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--invite-accent);
}
.contact-note {
  color: var(--invite-module-text, #657168);
}
.invitation-contact figure {
  margin: 0;
  width: 104px;
  flex-shrink: 0;
}
.invitation-contact img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: white;
  padding: 5px;
  box-sizing: border-box;
  display: block;
}
.invitation-contact figcaption {
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  margin-top: 6px;
  color: var(--invite-module-text, #657168);
}
.contact-copy-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
@media (max-width: 600px) {
  .invitation-contact {
    gap: 16px;
  }
  .invitation-contact figure {
    width: 84px;
  }
}
</style>
