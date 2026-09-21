export type NetworkState = "unknown" | "online" | "offline";
export type LoadFailureKind = "offline" | "connection" | "timeout" | "server" | "other";

export interface PageLoadFeedback {
  kind: LoadFailureKind;
  title: string;
  message: string;
  primaryText: string;
  tone: "network" | "error";
}

export function getPageLoadFeedback(error: unknown, network: NetworkState, fallback: string): PageLoadFeedback {
  if (network === "offline") {
    return {
      kind: "offline",
      title: "网络未连接",
      message: "请关闭飞行模式，或连接 Wi-Fi / 移动网络。网络恢复后将自动加载。",
      primaryText: "我已连接，重新加载",
      tone: "network"
    };
  }

  const source = error && typeof error === "object" ? error as { statusCode?: number; errMsg?: string } : {};
  if (typeof source.statusCode === "number" && source.statusCode >= 400) {
    return {
      kind: source.statusCode >= 500 ? "server" : "other",
      title: source.statusCode >= 500 ? "服务暂时繁忙" : "内容暂时无法加载",
      message: source.statusCode >= 500 ? "暂时无法获取最新内容，请稍后重试。" : fallback,
      primaryText: "重新加载",
      tone: "error"
    };
  }
  const errMsg = typeof source.errMsg === "string" ? source.errMsg : "";
  if (/timeout|timed?\s*out/i.test(errMsg)) {
    return {
      kind: "timeout", title: "连接暂时较慢",
      message: "暂时没有收到响应，请检查网络连接，或稍后重试。",
      primaryText: "重新连接", tone: "network"
    };
  }
  if (/request:fail|network|connection|connect|dns|ssl|tls|fetch/i.test(errMsg)) {
    return {
      kind: "connection", title: "暂时连接不上",
      message: "暂时无法连接服务，请检查网络连接，或稍后重试。",
      primaryText: "重新连接", tone: "network"
    };
  }
  return { kind: "other", title: "内容暂时无法加载", message: fallback, primaryText: "重新加载", tone: "error" };
}

export function isRecoverableConnectionFailure(kind: LoadFailureKind): boolean {
  return kind === "offline" || kind === "connection" || kind === "timeout";
}
