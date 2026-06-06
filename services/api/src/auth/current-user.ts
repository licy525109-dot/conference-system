export interface CurrentUser {
  id: string;
  openid: string | null;
  nickname: string | null;
}

export interface RequestWithCurrentUser {
  currentUser?: CurrentUser;
}
