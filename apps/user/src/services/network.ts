import type { NetworkState } from "@/utils/page-load-feedback";

export function readNetworkState(receive: (state: NetworkState) => void): void {
  // #ifdef H5
  // Some browsers retain connection.effectiveType while offline; use onLine.
  receive(navigator.onLine === false ? "offline" : "online");
  return;
  // #endif
  // #ifndef H5
  uni.getNetworkType({
    success: (result) => receive(result.networkType === "none" ? "offline" : "online"),
    fail: () => receive("unknown")
  });
  // #endif
}

export function watchNetworkState(receive: (state: NetworkState) => void): () => void {
  // #ifdef H5
  const onBrowserChange = () => readNetworkState(receive);
  window.addEventListener("offline", onBrowserChange);
  window.addEventListener("online", onBrowserChange);
  return () => {
    window.removeEventListener("offline", onBrowserChange);
    window.removeEventListener("online", onBrowserChange);
  };
  // #endif
  // #ifndef H5
  const onChange = (result: { isConnected: boolean; networkType: string }) => {
    receive(result.isConnected && result.networkType !== "none" ? "online" : "offline");
  };
  uni.onNetworkStatusChange(onChange);
  return () => uni.offNetworkStatusChange(onChange);
  // #endif
}
