import { API_BASE_URL } from "@/config/app";
import { readUniErrMsg } from "@/utils/uniErrors";
import { shouldRecoverAuthentication } from "./auth-recovery";
import { getToken } from "./session";

interface ApiEnvelope<T> {
  code?: string;
  message?: string;
  detail?: unknown;
  data?: T;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  data?: unknown;
  auth?: boolean;
}

const REQUEST_TIMEOUT_MS = 15000;
type AuthRecoveryHandler = () => Promise<void>;
let authRecoveryHandler: AuthRecoveryHandler | null = null;
let authRecoveryInFlight: Promise<void> | null = null;

export class ApiRequestError extends Error {
  readonly apiBaseUrl: string;
  readonly url: string;
  readonly method: string;
  readonly statusCode?: number;
  readonly errMsg?: string;
  readonly responseData?: unknown;
  readonly responseMessage?: string;
  readonly responseCode?: string;
  readonly responseDetail?: unknown;

  constructor(input: {
    message: string;
    apiBaseUrl: string;
    url: string;
    method: string;
    statusCode?: number;
    errMsg?: string;
    responseData?: unknown;
    responseMessage?: string;
    responseCode?: string;
    responseDetail?: unknown;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.apiBaseUrl = input.apiBaseUrl;
    this.url = input.url;
    this.method = input.method;
    this.statusCode = input.statusCode;
    this.errMsg = input.errMsg;
    this.responseData = input.responseData;
    this.responseMessage = input.responseMessage;
    this.responseCode = input.responseCode;
    this.responseDetail = input.responseDetail;
  }
}

export function setAuthRecoveryHandler(handler: AuthRecoveryHandler): void {
  authRecoveryHandler = handler;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestWithAuthRecovery<T>(path, options, false);
}

async function requestWithAuthRecovery<T>(path: string, options: RequestOptions, alreadyRetried: boolean): Promise<T> {
  try {
    return await dispatchRequest<T>(path, options);
  } catch (error) {
    const shouldRecover = error instanceof ApiRequestError
      && Boolean(authRecoveryHandler)
      && shouldRecoverAuthentication({
        statusCode: error.statusCode,
        authEnabled: options.auth !== false,
        alreadyRetried,
        path
      });
    if (!shouldRecover) throw error;

    try {
      await recoverAuthentication();
    } catch {
      throw error;
    }
    return requestWithAuthRecovery<T>(path, options, true);
  }
}

function dispatchRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method: method as UniApp.RequestOptions["method"],
      data: options.data as UniApp.RequestOptions["data"],
      header: headers,
      timeout: REQUEST_TIMEOUT_MS,
      success: (response) => {
        const statusCode = response.statusCode;
        const body = response.data as ApiEnvelope<T> | undefined;

        if (statusCode >= 200 && statusCode < 300 && body?.code === "OK") {
          resolve(body.data as T);
          return;
        }

        const message = body?.message || `请求失败 (${statusCode})`;
        reject(
          new ApiRequestError({
            message: `method=${method} url=${url} statusCode=${statusCode} API_BASE_URL=${API_BASE_URL} message=${message}`,
            apiBaseUrl: API_BASE_URL,
            url,
            method,
            statusCode,
            responseData: body,
            responseMessage: message,
            responseCode: body?.code,
            responseDetail: body?.detail
          })
        );
      },
      fail: (error) => {
        const errMsg = readUniErrMsg(error, "网络请求失败");
        reject(
          new ApiRequestError({
            message: `method=${method} url=${url} timeout=${REQUEST_TIMEOUT_MS} API_BASE_URL=${API_BASE_URL} errMsg=${errMsg}`,
            apiBaseUrl: API_BASE_URL,
            url,
            method,
            errMsg
          })
        );
      }
    });
  });
}

function recoverAuthentication(): Promise<void> {
  if (!authRecoveryHandler) {
    return Promise.reject(new Error("Authentication recovery is not configured"));
  }
  if (!authRecoveryInFlight) {
    authRecoveryInFlight = authRecoveryHandler().finally(() => {
      authRecoveryInFlight = null;
    });
  }
  return authRecoveryInFlight;
}
