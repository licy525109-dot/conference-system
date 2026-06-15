export interface CurrentUser {
  id: string;
  openid: string | null;
  nickname: string | null;
  wechatNickname?: string | null;
  wechatAvatarUrl?: string | null;
  registeredAt?: string;
  lastActiveAt?: string | null;
}

export interface RequestWithCurrentUser {
  currentUser?: CurrentUser;
}
