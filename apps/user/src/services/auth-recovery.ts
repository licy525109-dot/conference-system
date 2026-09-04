export interface AuthRecoveryDecision {
  statusCode?: number;
  authEnabled: boolean;
  alreadyRetried: boolean;
  path: string;
}

export function shouldRecoverAuthentication(input: AuthRecoveryDecision): boolean {
  return input.authEnabled
    && !input.alreadyRetried
    && input.statusCode === 401
    && input.path !== "/auth/wechat/login";
}
