import { onBeforeUnmount, ref, useId, watch, type Ref } from "vue";
import {
  INVITATION_FONTS,
  type InvitationPageDesign,
} from "@conference/shared";
export function useInvitationFont(
  design: Ref<InvitationPageDesign>,
  assetOrigin: Ref<string>,
  customNeeded?: Ref<boolean>,
) {
  const family = ref(""),
    customFamily = ref(""),
    status = ref<"idle" | "loading" | "loaded" | "error">("idle");
  const name = `InvitationFont${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  let face: FontFace | undefined,
    generation = 0;
  watch(
    [
      () => design.value.font,
      () => design.value.fontUrl,
      () => assetOrigin.value,
      () => customNeeded?.value,
    ],
    async () => {
      const current = ++generation;
      if (face) document.fonts.delete(face);
      face = undefined;
      family.value = "";
      customFamily.value = "";
      status.value = "idle";
      if (design.value.font !== "custom") {
        if (design.value.font !== "default")
          family.value = INVITATION_FONTS[design.value.font].family;
        if (!customNeeded?.value) return;
      }
      if (!design.value.fontUrl || !("FontFace" in window)) return;
      status.value = "loading";
      const url = design.value.fontUrl.startsWith("/uploads/")
        ? assetOrigin.value + design.value.fontUrl
        : design.value.fontUrl;
      try {
        const next = await new FontFace(name, `url(${JSON.stringify(url)})`, {
          display: "swap",
        }).load();
        if (current !== generation) return;
        face = next;
        document.fonts.add(next);
        customFamily.value = `${name}, ${INVITATION_FONTS.sans.family}`;
        if (design.value.font === "custom") family.value = customFamily.value;
        status.value = "loaded";
      } catch {
        if (current === generation) status.value = "error";
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    if (face) document.fonts.delete(face);
  });
  return { family, customFamily, status };
}
