export function buildPaymentErrorMessage(err: unknown, expiredLoginMessage: string): string {
  if (isPaymentApiError(err)) {
    const diagnostic = buildDiagnosticText(err);
    if (isInvalidWechatIdentity(diagnostic)) {
      return "当前订单未绑定有效微信身份，请返回重新下单支付。";
    }
    if (err.statusCode === 401) {
      return expiredLoginMessage;
    }
    if (err.statusCode === 403 && diagnostic.includes("REAL WECHAT PAY IS DISABLED")) {
      return "服务器尚未启用真实微信支付，请联系管理员检查生产支付模式。";
    }
    if (err.statusCode === 403) return expiredLoginMessage;
    if (err.statusCode === 404) {
      return "未找到订单，请返回后重新进入支付页";
    }
    if (err.statusCode === 409) {
      return "订单当前状态不支持支付，请刷新状态后重试";
    }
    if (isAppIdMerchantMismatch(diagnostic)) {
      return "小程序 AppID 尚未与当前微信支付商户号绑定，请联系管理员完成关联。";
    }
    if (diagnostic.includes("SIGN_ERROR") || diagnostic.includes("签名错误")) {
      return "微信支付签名校验失败，请联系管理员核对商户证书序列号和私钥。";
    }
    if (diagnostic.includes("MCH_NOT_EXISTS") || diagnostic.includes("NO_AUTH")) {
      return "当前商户号不存在或未开通 JSAPI 支付权限，请联系管理员核对商户平台。";
    }
    if (diagnostic.includes("PARAM_ERROR")) {
      return "微信支付参数校验失败，请联系管理员核对 AppID、商户号和回调地址。";
    }
    if (isServerConfigurationError(diagnostic)) {
      return "服务器微信支付配置不完整，请联系管理员检查生产环境配置。";
    }
    if (diagnostic.includes("TIMED OUT") || diagnostic.includes("TIMEOUT")) {
      return "连接微信支付超时，请稍后重试。";
    }
    if (
      diagnostic.includes("SYSTEM_ERROR")
      || diagnostic.includes("BANK_ERROR")
      || diagnostic.includes("FREQUENCY_LIMITED")
    ) {
      return "微信支付通道暂时繁忙，请稍后重试。";
    }
    if (err.responseCode?.startsWith("WECHAT_PAY_")) {
      return "微信支付预下单失败，请联系管理员核对商户平台配置后重试。";
    }
    if (typeof err.statusCode === "number" && err.statusCode >= 500) {
      return "支付服务暂时不可用，请稍后重试。";
    }
    return err.errMsg ? "网络异常，请检查网络后重试" : "支付发起失败，请稍后重试";
  }

  if (err instanceof Error && err.message.includes("cancel")) {
    return "你已取消支付，订单仍为待支付，可稍后继续支付。";
  }
  return "支付未完成，请稍后重试";
}

function buildDiagnosticText(error: PaymentApiError): string {
  return [error.responseCode, error.responseMessage, readDetail(error.responseDetail)]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function isPaymentApiError(value: unknown): value is PaymentApiError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.name === "ApiRequestError"
    || typeof candidate.statusCode === "number"
    || typeof candidate.responseCode === "string";
}

function readDetail(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isInvalidWechatIdentity(value: string): boolean {
  return value.includes("当前订单未绑定有效微信身份")
    || value.includes("A REAL WECHAT OPENID IS REQUIRED")
    || value.includes("OPENID_MISMATCH");
}

function isAppIdMerchantMismatch(value: string): boolean {
  return value.includes("APPID_MCHID_NOT_MATCH")
    || value.includes("APPID 和 MCHID")
    || value.includes("APPID与商户号");
}

function isServerConfigurationError(value: string): boolean {
  return value.includes("NOT CONFIGURED FOR WECHAT PAY")
    || value.includes("PRIVATE_KEY_PATH CANNOT BE READ")
    || value.includes("NOTIFY_URL MUST BE");
}

interface PaymentApiError {
  name?: string;
  statusCode?: number;
  errMsg?: string;
  responseMessage?: string;
  responseCode?: string;
  responseDetail?: unknown;
}
