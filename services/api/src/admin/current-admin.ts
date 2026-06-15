export interface CurrentAdmin {
  id: string;
  username: string;
  displayName: string | null;
  permissions?: string[];
}

export interface RequestWithCurrentAdmin {
  currentAdmin?: CurrentAdmin;
}
