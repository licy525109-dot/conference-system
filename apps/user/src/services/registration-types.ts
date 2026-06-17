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
  conference: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    venue?: string | null;
    address?: string;
  };
  attendee: {
    name: string;
    mobileMasked: string;
    company?: string;
    title?: string;
  };
  ticket: {
    id: string;
    name: string;
    priceCent: number;
  };
  payment: {
    paidAmountCent: number;
    paidAt: string | null;
    status: string;
  };
  order: {
    orderNo: string;
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
