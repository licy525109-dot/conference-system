import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import { getPageLoadFeedback, isRecoverableConnectionFailure, type NetworkState } from "@/utils/page-load-feedback";
import { readNetworkState, watchNetworkState } from "@/services/network";

// Only visible read-only pages use this recovery hook; it never replays mutations.
export function usePageNetwork(reload: () => void | Promise<void>, loading: Ref<boolean>) {
  const network = ref<NetworkState>("unknown");
  const failure = ref<unknown>(null);
  const fallbackMessage = ref("请稍后重新加载。");
  const feedback = computed(() => getPageLoadFeedback(failure.value, network.value, fallbackMessage.value));
  const offline = computed(() => network.value === "offline");
  let active = false;
  let unsubscribe: (() => void) | null = null;
  let revision = 0;
  let needsRecovery = false;
  let recoveryPending = false;

  function recoverWhenReady() {
    if (!active || loading.value || network.value !== "online" || !recoveryPending) return;
    recoveryPending = false;
    needsRecovery = false;
    void Promise.resolve().then(() => {
      if (active && network.value === "online" && !loading.value) return reload();
    }).catch(() => { /* Page loaders own their error presentation. */ });
  }

  function updateNetwork(state: NetworkState) {
    network.value = state;
    if (state === "offline") needsRecovery = true;
    if (state === "online" && needsRecovery) {
      recoveryPending = true;
      recoverWhenReady();
    }
  }

  function onNetworkChange(state: NetworkState) {
    revision += 1;
    updateNetwork(state);
  }

  function refreshNetwork() {
    const currentRevision = ++revision;
    try {
      readNetworkState(state => {
        if (!active || currentRevision !== revision || state === "unknown") return;
        updateNetwork(state);
      });
    } catch { /* A missing network API must not block content loading. */ }
  }

  function reportFailure(error: unknown, fallback: string) {
    failure.value = error;
    fallbackMessage.value = fallback;
    if (isRecoverableConnectionFailure(feedback.value.kind)) needsRecovery = true;
  }

  function clearFailure() {
    failure.value = null;
    needsRecovery = offline.value;
    recoveryPending = false;
  }

  function stop() {
    active = false;
    revision += 1;
    unsubscribe?.();
    unsubscribe = null;
  }

  onShow(() => {
    active = true;
    if (!unsubscribe) unsubscribe = watchNetworkState(onNetworkChange);
    refreshNetwork();
  });
  onHide(stop);
  onUnload(stop);
  onUnmounted(stop);
  watch(loading, recoverWhenReady, { flush: "post" });

  return { offline, feedback, reportFailure, clearFailure, refreshNetwork };
}
