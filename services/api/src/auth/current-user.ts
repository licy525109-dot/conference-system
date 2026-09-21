export interface CurrentUser {
  id: string;
  openid: string | null;
  nickname: string | null;
  phone?: string | null;
  realName?: string | null;
  phoneVerifiedAt?: string | null;
  activatedAt?: string | null;
  registrationReady?: boolean;
  wechatNickname?: string | null;
  wechatAvatarUrl?: string | null;
  registeredAt?: string;
  lastActiveAt?: string | null;
}

export interface RequestWithCurrentUser {
  currentUser?: CurrentUser;
}
