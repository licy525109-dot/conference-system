const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

// TODO: Split this by deployment target once H5, mp-weixin, and production environments diverge.
export const API_BASE_URL = env?.VITE_API_BASE_URL ?? "http://localhost:3001/api";

export const MOCK_LOGIN_CODE = "dev-user-001";
export const MOCK_LOGIN_NICKNAME = "测试用户";
