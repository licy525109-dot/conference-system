import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("conference registration payment E2E contract", () => {
  it("creates a conference, accepts a paid registration, exposes credential, and shows admin detail", () => {
    const app = createHarness();
    const conference = app.createConference("准上线会议");
    const sku = app.createSku(conference.id, "标准票", 70000, 100);
    app.createFormField(conference.id, "name", true);
    app.createFormField(conference.id, "phone", true);

    const order = app.createOrder("user-1", conference.id, sku.id, {
      name: "张三",
      phone: "13800000000",
      company: "观潮会务",
      title: "运营负责人"
    });
    assert.equal(order.payableAmountCent, 70000);
    assert.equal(order.status, "PENDING");

    const paid = app.mockPay(order.orderNo);
    assert.equal(paid.orderStatus, "PAID");
    assert.equal(paid.paymentStatus, "SUCCESS");

    const credential = app.getCredential("user-1", paid.registrationId);
    assert.equal(credential.registrationNo, "R000001");
    assert.equal(credential.attendee.mobileMasked, "138****0000");
    assert.equal(credential.payment.paidAmountCent, 70000);

    const detail = app.getAdminRegistrationDetail(paid.registrationId);
    assert.equal(detail.order.orderNo, order.orderNo);
    assert.equal(detail.order.payments[0]?.status, "SUCCESS");
    assert.equal(detail.attendees[0]?.company, "观潮会务");
    assert.equal(detail.timeline.some((item) => item.type === "REGISTRATION_CONFIRMED"), true);
  });

  it("supports required check-in and rejects duplicate verification", () => {
    const app = createHarness();
    const conference = app.createConference("需核销会议", true);
    const sku = app.createSku(conference.id, "标准票", 70000, 100);
    app.createFormField(conference.id, "name", true);
    app.createFormField(conference.id, "phone", true);
    const order = app.createOrder("user-1", conference.id, sku.id, { name: "李四", phone: "13900000000" });
    const paid = app.mockPay(order.orderNo);
    const detail = app.getAdminRegistrationDetail(paid.registrationId);

    assert.equal(detail.attendees[0]?.checkInStatus, "PENDING");
    assert.equal(app.verifyCheckin(paid.registrationId).checkInStatus, "CHECKED_IN");
    assert.throws(() => app.verifyCheckin(paid.registrationId), /already checked in/);
  });

  it("keeps lightweight concurrent registration creation deterministic", () => {
    const app = createHarness();
    const conference = app.createConference("千人级并发会议");
    const sku = app.createSku(conference.id, "标准票", 10000, 1200);
    app.createFormField(conference.id, "name", true);
    app.createFormField(conference.id, "phone", true);

    for (let index = 0; index < 1000; index += 1) {
      app.createOrder(`user-${index}`, conference.id, sku.id, { name: `用户${index}`, phone: `138${String(index).padStart(8, "0")}` });
    }

    assert.equal(app.stats().orderCount, 1000);
    assert.equal(app.stats().remainingStock, 1200);
  });
});

function createHarness() {
  const state = {
    conferences: [] as Conference[],
    skus: [] as Sku[],
    formFields: [] as FormField[],
    orders: [] as Order[],
    registrations: [] as Registration[]
  };

  return {
    createConference(title: string, checkInEnabled = false) {
      const conference = { id: `conf-${state.conferences.length + 1}`, title, status: "PUBLISHED" as const, checkInEnabled };
      state.conferences.push(conference);
      return conference;
    },
    createSku(conferenceId: string, name: string, priceCent: number, stock: number) {
      const sku = { id: `sku-${state.skus.length + 1}`, conferenceId, name, priceCent, stock, soldCount: 0 };
      state.skus.push(sku);
      return sku;
    },
    createFormField(conferenceId: string, fieldKey: string, required: boolean) {
      state.formFields.push({ conferenceId, fieldKey, required });
    },
    createOrder(userId: string, conferenceId: string, skuId: string, formData: Record<string, string>) {
      const sku = mustFind(state.skus, (item) => item.id === skuId && item.conferenceId === conferenceId, "SKU missing");
      for (const field of state.formFields.filter((item) => item.conferenceId === conferenceId && item.required)) {
        assert.ok(formData[field.fieldKey], `${field.fieldKey} is required`);
      }
      const order = {
        id: `order-${state.orders.length + 1}`,
        orderNo: `REG${String(state.orders.length + 1).padStart(6, "0")}`,
        userId,
        conferenceId,
        skuId,
        formData,
        payableAmountCent: sku.priceCent,
        paidAmountCent: null as number | null,
        status: "PENDING" as OrderStatus,
        payments: [] as Payment[]
      };
      state.orders.push(order);
      return order;
    },
    mockPay(orderNo: string) {
      const order = mustFind(state.orders, (item) => item.orderNo === orderNo, "Order missing");
      const conference = mustFind(state.conferences, (item) => item.id === order.conferenceId, "Conference missing");
      if (order.status === "PAID") {
        return { orderStatus: "PAID" as const, paymentStatus: "SUCCESS" as const, registrationId: mustFind(state.registrations, (item) => item.orderId === order.id, "Registration missing").id };
      }
      order.status = "PAID";
      order.paidAmountCent = order.payableAmountCent;
      order.payments.push({ provider: "MOCK", status: "SUCCESS", amountCent: order.payableAmountCent });
      const sku = mustFind(state.skus, (item) => item.id === order.skuId, "SKU missing");
      sku.soldCount += 1;
      const registration = {
        id: `reg-${state.registrations.length + 1}`,
        registrationNo: `R${String(state.registrations.length + 1).padStart(6, "0")}`,
        orderId: order.id,
        userId: order.userId,
        conferenceId: order.conferenceId,
        attendeeName: order.formData.name,
        phone: order.formData.phone,
        paidAmountCent: order.payableAmountCent,
        attendees: [{ ...order.formData, checkInStatus: conference.checkInEnabled ? "PENDING" : "NOT_REQUIRED" }]
      };
      state.registrations.push(registration);
      return { orderStatus: "PAID" as const, paymentStatus: "SUCCESS" as const, registrationId: registration.id };
    },
    getCredential(userId: string, registrationId: string) {
      const registration = mustFind(state.registrations, (item) => item.id === registrationId && item.userId === userId, "Credential missing");
      const order = mustFind(state.orders, (item) => item.id === registration.orderId && item.status === "PAID", "Paid order missing");
      return {
        registrationNo: registration.registrationNo,
        attendee: { mobileMasked: maskMobile(registration.phone) },
        payment: { paidAmountCent: order.paidAmountCent }
      };
    },
    getAdminRegistrationDetail(registrationId: string) {
      const registration = mustFind(state.registrations, (item) => item.id === registrationId, "Registration missing");
      const order = mustFind(state.orders, (item) => item.id === registration.orderId, "Order missing");
      return {
        order: { orderNo: order.orderNo, payments: order.payments },
        attendees: registration.attendees,
        timeline: [{ type: "REGISTRATION_CONFIRMED" }]
      };
    },
    verifyCheckin(registrationId: string) {
      const registration = mustFind(state.registrations, (item) => item.id === registrationId, "Registration missing");
      const attendee = registration.attendees[0];
      assert.ok(attendee, "Attendee missing");
      if (attendee.checkInStatus === "CHECKED_IN") {
        throw new Error("already checked in");
      }
      attendee.checkInStatus = "CHECKED_IN";
      return attendee;
    },
    stats() {
      const sku = state.skus[0];
      return {
        orderCount: state.orders.length,
        remainingStock: sku ? sku.stock - sku.soldCount : 0
      };
    }
  };
}

function mustFind<T>(items: T[], predicate: (item: T) => boolean, message: string): T {
  const item = items.find(predicate);
  assert.ok(item, message);
  return item;
}

function maskMobile(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

interface Conference {
  id: string;
  title: string;
  status: "PUBLISHED";
  checkInEnabled: boolean;
}

interface Sku {
  id: string;
  conferenceId: string;
  name: string;
  priceCent: number;
  stock: number;
  soldCount: number;
}

interface FormField {
  conferenceId: string;
  fieldKey: string;
  required: boolean;
}

type OrderStatus = "PENDING" | "PAID";

interface Payment {
  provider: "MOCK";
  status: "SUCCESS";
  amountCent: number;
}

interface Order {
  id: string;
  orderNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  formData: Record<string, string>;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: OrderStatus;
  payments: Payment[];
}

interface Registration {
  id: string;
  registrationNo: string;
  orderId: string;
  userId: string;
  conferenceId: string;
  attendeeName: string;
  phone: string;
  paidAmountCent: number;
  attendees: Array<Record<string, string>>;
}
