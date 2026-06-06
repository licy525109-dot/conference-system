export interface CurrentAdmin {
  id: string;
  username: string;
  displayName: string | null;
}

export interface RequestWithCurrentAdmin {
  currentAdmin?: CurrentAdmin;
}
