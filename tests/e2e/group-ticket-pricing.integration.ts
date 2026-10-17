import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { AdminManagementService } from "../../services/api/src/admin/admin-management.service";
import { ConferencesService } from "../../services/api/src/conferences/conferences.service";
import { RegistrationService } from "../../services/api/src/registration/registration.service";
import { PaymentsService } from "../../services/api/src/payments/payments.service";
import { PrismaService } from "../../services/api/src/prisma.service";

test("isolated PostgreSQL: group prices, package cents, snapshot rollback, payment idempotency and stock race", {
  skip: !process.env.GROUP_TICKET_TEST_DATABASE_URL, timeout: 300000
}, async () => {
  const url = new URL(process.env.GROUP_TICKET_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/group_ticket_pricing_qa");
  assert.equal(process.env.PAYMENT_MODE, "mock");
  assert.notEqual(process.env.NODE_ENV, "production");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const prisma = db as PrismaService;
  const adminService = new AdminManagementService(prisma);
  const registrationService = new RegistrationService(prisma);
  const prefix = `group-qa-${randomUUID()}`;
  let conferenceId = "", adminId = "", userId = "";
  const profileIds: string[] = [];
  try {
    const account = await db.adminUser.create({ data: { username: prefix, passwordHash: "disabled-test-account" } });
    adminId = account.id;
    const admin = { id: adminId, username: prefix, displayName: "QA", permissions: ["conference:write"] };
    const user = await db.user.create({ data: { openid: `mock_${prefix}`, nickname: "QA", realName: "测试本人", phone: "13800000000", phoneVerifiedAt: new Date() } });
    userId = user.id;
    const currentUser = { id: userId, openid: user.openid, nickname: user.nickname };
    const conference = await db.conference.create({ data: { title: prefix, slug: prefix, status: "PUBLISHED", groupRegistrationEnabled: true, maxTicketsPerOrder: 20, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") } });
    conferenceId = conference.id;
    await db.formDefinition.create({ data: { conferenceId, fields: { create: [
      { fieldKey: "name", label: "姓名", type: "TEXT", required: true },
      { fieldKey: "phone", label: "手机", type: "PHONE", required: true }
    ] } } });
    const perPerson = { version: 1, minQuantity: 3, minPayableAmountCent: 0, tiers: [{ minQuantity: 5, unitPriceCent: 280000 }] };
    const packageRules = { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 0, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10000 }, { quantity: 5, totalAmountCent: 15002 }] };
    const createSku = async (name: string, priceCent: number, groupPricingJson: unknown, stock = 30) => {
      await adminService.createSku(conferenceId, { name, priceCent, stock, groupPricingJson, status: "ACTIVE" }, admin);
      return db.registrationSku.findFirstOrThrow({ where: { conferenceId, name } });
    };
    const tierSku = await createSku("人均阶梯", 300000, perPerson);
    const packageSku = await createSku("整团套餐", 3333, packageRules);
    const raceSku = await createSku("并发套餐", 3333, packageRules, 3);
    const plainSku = await createSku("普通票兼容", 300000, null);
    await adminService.updateSku(plainSku.id, { priceCent: 310000 }, admin);
    await adminService.updateSku(plainSku.id, { groupPricingJson: perPerson }, admin);
    await adminService.updateSku(plainSku.id, { groupPricingJson: null }, admin);
    assert.equal((await db.registrationSku.findUniqueOrThrow({ where: { id: plainSku.id } })).groupPricingJson, null);

    const editSku = await createSku("并发编辑", 300000, perPerson);
    let finishReads!: () => void, reads = 0;
    const bothRead = new Promise<void>(resolve => { finishReads = resolve; });
    const delegate = new Proxy(db.registrationSku, { get(target, property, receiver) {
      if (property === "findUnique") return async (args: any) => {
        const value = await db.registrationSku.findUnique(args);
        if (++reads === 2) finishReads();
        await bothRead;
        return value;
      };
      return Reflect.get(target, property, receiver);
    } });
    const concurrentAdmin = new AdminManagementService(new Proxy(db, { get(target, property, receiver) {
      return property === "registrationSku" ? delegate : Reflect.get(target, property, receiver);
    } }) as PrismaService);
    const edits = await Promise.allSettled([
      concurrentAdmin.updateSku(editSku.id, { priceCent: 285000 }, admin),
      concurrentAdmin.updateSku(editSku.id, { groupPricingJson: { ...perPerson, tiers: [{ minQuantity: 5, unitPriceCent: 290000 }] } }, admin)
    ]);
    assert.equal(edits.filter(edit => edit.status === "fulfilled").length, 1);
    const rejectedEdit = edits.find(edit => edit.status === "rejected") as PromiseRejectedResult;
    assert.match(rejectedEdit.reason.message, /刷新后重新保存/);
    const edited = await db.registrationSku.findUniqueOrThrow({ where: { id: editSku.id } });
    assert.ok((edited.groupPricingJson as any).tiers[0].unitPriceCent <= edited.priceCent);
    assert.equal(await db.auditLog.count({ where: { entityId: editSku.id, action: "UPDATE" } }), 1);
    const detail = (await new ConferencesService(prisma).detail(conferenceId)).data;
    assert.equal(detail.maxTicketsPerOrder, 20);
    assert.deepEqual(detail.skus.find(sku => sku.id === packageSku.id)?.groupPricingJson, packageRules);
    const request = (skuId: string, quantity: number) => ({ conferenceId, items: [{ skuId, quantity }] });
    const orderInput = (skuId: string, quantity: number) => ({ ...request(skuId, quantity), attendees: Array.from({ length: quantity }, (_, i) => ({ skuId, formData: { name: `测试嘉宾${i + 1}`, phone: `1380000000${i}` } })) });
    await assert.rejects(() => registrationService.quote(request(tierSku.id, 2)), /至少/);
    assert.equal((await registrationService.quote(request(tierSku.id, 5))).data.payableAmountCent, 1400000);
    await assert.rejects(() => registrationService.createOrder({ ...orderInput(tierSku.id, 5), payableAmountCent: 1 }, currentUser), /must not include/);
    await adminService.updateSku(tierSku.id, { groupPricingJson: { ...perPerson, tiers: [{ minQuantity: 5, unitPriceCent: 270000 }] } }, admin);
    const repriced = await registrationService.createOrder(orderInput(tierSku.id, 5), currentUser);
    assert.equal(repriced.data.payableAmountCent, 1350000);

    const before = await db.order.count({ where: { conferenceId } });
    await assert.rejects(() => registrationService.createOrder(orderInput(packageSku.id, 4), currentUser), /套餐人数/);
    assert.equal(await db.order.count({ where: { conferenceId } }), before);
    const result = await registrationService.createOrder(orderInput(packageSku.id, 5), currentUser);
    const order = await db.order.findUniqueOrThrow({ where: { orderNo: result.data.orderNo }, include: { items: true } });
    assert.equal(order.payableAmountCent, 15002);
    assert.equal(order.items[0].totalAmountCent, 15002);
    assert.equal(order.items[0].unitPriceCent, 3000);
    assert.equal((order.registrationSnapshotJson as any).items[0].groupPricingSnapshot.perPersonRemainderCent, 2);
    assert.equal(await db.registration.count({ where: { conferenceId } }), 0);
    assert.equal(await db.payment.count({ where: { order: { conferenceId } } }), 0);
    const payments = new PaymentsService(prisma);
    await payments.confirmMockPayment({ orderNo: order.orderNo }, currentUser);
    await payments.confirmMockPayment({ orderNo: order.orderNo }, currentUser);
    assert.equal(await db.registration.count({ where: { orderId: order.id } }), 1);
    const attendees = await db.registrationAttendee.findMany({ where: { registration: { orderId: order.id } } });
    assert.equal(attendees.length, 5);
    profileIds.push(...attendees.flatMap(row => row.guestProfileId ? [row.guestProfileId] : []));
    assert.equal((await db.payment.findFirstOrThrow({ where: { orderId: order.id } })).amountCent, 15002);
    assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);
    const stock = await db.registrationSku.findUniqueOrThrow({ where: { id: packageSku.id } });
    assert.equal(stock.soldCount, 5);
    assert.equal(stock.lockedStock, 0);

    // Change only two cents, preserving the average unit price, before reservation.
    const rollbackBefore = await db.order.count({ where: { conferenceId } });
    const transaction = db.$transaction.bind(db);
    const changedTransaction = async (callback: any, options: any) => {
      await db.registrationSku.update({ where: { id: packageSku.id }, data: { groupPricingJson: { ...packageRules, packages: [{ quantity: 3, totalAmountCent: 10000 }, { quantity: 5, totalAmountCent: 15004 }] } } });
      return transaction(callback, options);
    };
    const wrapped = new Proxy(db, { get(target, property, receiver) {
      return property === "$transaction" ? changedTransaction : Reflect.get(target, property, receiver);
    } }) as PrismaService;
    await assert.rejects(() => new RegistrationService(wrapped).createOrder(orderInput(packageSku.id, 5), currentUser), /规则已更新/);
    assert.equal(await db.order.count({ where: { conferenceId } }), rollbackBefore);
    assert.equal((await db.registrationSku.findUniqueOrThrow({ where: { id: packageSku.id } })).lockedStock, 0);

    const raced = await Promise.allSettled([1, 2].map(() => registrationService.createOrder(orderInput(raceSku.id, 3), currentUser)));
    assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await db.order.count({ where: { skuId: raceSku.id } }), 1);
    assert.equal((await db.registrationSku.findUniqueOrThrow({ where: { id: raceSku.id } })).lockedStock, 3);
  } finally {
    if (conferenceId) {
      await db.registration.deleteMany({ where: { conferenceId } });
      await db.guestProfile.deleteMany({ where: { id: { in: profileIds } } });
      await db.order.deleteMany({ where: { conferenceId } });
      await db.conference.delete({ where: { id: conferenceId } });
    }
    if (adminId) { await db.auditLog.deleteMany({ where: { adminUserId: adminId } }); await db.adminUser.delete({ where: { id: adminId } }); }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
});
