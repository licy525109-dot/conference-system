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
