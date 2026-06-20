export interface MyRegistrationItem {
  id: string;
  registrationNo: string;
  status: string;
  attendeeName: string;
  phone: string;
  paidAmountCent: number;
  confirmedAt: string;
  createdAt: string;
  conference: {
    id: string;
    title: string;
    slug: string;
    startsAt: string;
    endsAt: string;
  };
  sku: {
    id: string;
    name: string;
  };
  order: {
    orderNo: string;
  };
}

export interface RegistrationCredential {
  registrationId: string;
  registrationNo: string;
  credentialCode: string;
  qrPayload: string;
  status: string;
  checkIn: {
    status: "NOT_REQUIRED" | "PENDING" | "CHECKED_IN" | "CANCELLED" | string;
    checkedInAt: string | null;
  };
  user: {
    id: string | null;
    nickname: string;
    avatarUrl: string | null;
    phoneMasked: string;
  };
  conference: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    venue: string;
    address: string;
  };
  attendee: {
    name: string;
    mobile: string;
    mobileMasked: string;
    company: string;
    title: string;
  };
  ticket: {
    id: string;
    name: string;
    priceCent: number;
  };
  payment: {
    paidAmountCent: number;
    payableAmountCent?: number;
    paidAt: string | null;
    status: string;
    provider?: string | null;
  };
  order: {
    orderNo: string;
    status?: string;
  };
  formSummary: Array<{
    label: string;
    value: string;
  }>;
  links: {
    agendaUrl?: string;
    guideUrl?: string;
    groupJoinUrl?: string;
    contactUrl?: string;
  };
}
