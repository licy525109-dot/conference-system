<template>
  <InvitationDocument
    v-if="document"
    :document="document"
    :preview="preview"
    @register="$emit('register')"
    @share="$emit('share')"
  >
    <template #registration><slot name="registration" /></template>
  </InvitationDocument>
</template>
<script setup lang="ts">
import { computed } from "vue";
import {
  createGovernedRuntimeContext,
  governRender,
} from "@conference/render-governor";
import type { PublicInvitation } from "@conference/shared";
import InvitationDocument from "./InvitationDocument.vue";
const props = defineProps<{ document: PublicInvitation; preview?: boolean }>();
defineEmits<{ register: []; share: [] }>();
const document = computed(() => {
  const context = createGovernedRuntimeContext({
    page: "conference-invitation",
    platform: props.preview ? "admin" : "h5",
    data: { invitation: props.document },
  });
  const result = governRender(
    {
      schemaVersion: "p9",
      page: "conference-invitation",
      dsl: {
        nodes: [
          {
            id: "invitation",
            type: "ds-invitation",
            bindings: { document: "invitation" },
          },
        ],
      },
    },
    { context, allowLegacyDslFallback: false },
  );
  return result.tree.nodes.find((node) => node.type === "ds-invitation")?.props
    .document as PublicInvitation | undefined;
});
</script>
