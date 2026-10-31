export interface CurrentAdmin {
  id: string;
  username: string;
  displayName: string | null;
  permissions?: string[];
  conferenceScopeMode?: "ALL" | "ASSIGNED";
  conferenceIds?: string[];
}

export interface RequestWithCurrentAdmin {
  currentAdmin?: CurrentAdmin;
}
