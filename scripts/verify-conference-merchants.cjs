// Isolated PostgreSQL/HTTP acceptance. Never point this script at a real database.
const assert = require('node:assert/strict');
const { randomBytes, generateKeyPairSync, pbkdf2Sync, createCipheriv, sign } = require('node:crypto');
const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../services/api/package.json'));
const { NestFactory } = apiRequire('@nestjs/core');
const { AppModule } = require('../services/api/dist/app.module.js');
const { PrismaService } = require('../services/api/dist/prisma.service.js');
const { AdminAccessService } = require('../services/api/dist/admin/admin-access.service.js');
const { PaymentMerchantService } = require('../services/api/dist/payments/payment-merchant.service.js');
const { RegistrationService } = require('../services/api/dist/registration/registration.service.js');

async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  assert.equal(dbUrl.hostname, '127.0.0.1');
  assert.equal(dbUrl.port, '55439');
  assert.equal(dbUrl.pathname, '/conference_merchants_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.WECOM_CONFIG_ENCRYPTION_KEY = randomBytes(48).toString('hex');
  process.env.WECHAT_PAY_APP_ID = 'wx-isolated-merchant-test';
  process.env.WECHAT_PAY_MCH_ID = '1900000001';
  process.env.WECHAT_PAY_NOTIFY_URL = 'https://example.test/api/payments/wechat/notify';
  process.env.PAYMENT_MODE = 'mock';
  process.env.WECHAT_PAY_MODE = 'mock';
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    assert.equal(new URL(String(url)).hostname, '127.0.0.1', 'Isolated verification forbids provider/network calls');
    return nativeFetch(url, init);
  };
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: ['http://127.0.0.1:5197'] });
  await app.listen(process.argv.includes('--serve') ? 3097 : 0, '127.0.0.1');
  const db = app.get(PrismaService);
  const access = app.get(AdminAccessService);
  const merchants = app.get(PaymentMerchantService);
  const prefix = `QA${Date.now()}`;
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `pbkdf2$sha512$120000$${salt}$${pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex')}`;
  let checks = 0;
  const base = await app.getUrl();
  async function request(path, token, method = 'GET', body, expected = 200) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    checks += 1;
    return result.data;
  }
  try {
    await access.ensureBuiltInAccess();
    const superRole = await db.role.findUniqueOrThrow({ where: { code: 'super_admin' } });
    const operatorRole = await db.role.findUniqueOrThrow({ where: { code: 'CONFERENCE_OPERATOR' } });
    const root = await db.adminUser.create({ data: { username: `${prefix}-root`, passwordHash, conferenceScopeMode: 'ALL', roles: { create: { roleId: superRole.id } } } });
    const actor = { ...root, permissions: [], conferenceScopeMode: 'ALL', conferenceIds: [] };
    const confA = await db.conference.create({ data: { title: '测试会议 A（仅本机）', slug: `${prefix}-a`, status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 172800000) } });
    const confB = await db.conference.create({ data: { title: '测试会议 B（仅本机）', slug: `${prefix}-b`, status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 172800000) } });
    const skuA = await db.registrationSku.create({ data: { conferenceId: confA.id, name: '标准票', priceCent: 58000, stock: 100 } });
    const skuB = await db.registrationSku.create({ data: { conferenceId: confB.id, name: '标准票', priceCent: 68000, stock: 100 } });
    await db.formDefinition.create({ data: { conferenceId: confA.id, fields: { create: [
      { fieldKey: 'name', label: '姓名', type: 'TEXT', required: true },
      { fieldKey: 'phone', label: '手机', type: 'PHONE', required: true }
    ] } } });
    const adminSession = await request('/admin/auth/login', null, 'POST', { username: root.username, password }, 201);
    const token = adminSession.token;
    const partner = await request('/admin/accounts', token, 'POST', { username: `${prefix}-partner`, displayName: '测试合作方运营', password, roleIds: [operatorRole.id], conferenceScopeMode: 'ASSIGNED', conferenceIds: [confA.id] }, 201);
    const partnerSession = await request('/admin/auth/login', null, 'POST', { username: partner.username, password }, 201);
    const partnerToken = partnerSession.token;
    const scoped = await request('/admin/conference-workspace/conferences', partnerToken);
    assert.deepEqual(scoped.items.map(c => c.id), [confA.id]);
    await request(`/admin/conference-workspace/conferences/${confB.id}`, partnerToken, 'GET', undefined, 403);
    await request(`/admin/conference-workspace/skus/${skuB.id}`, partnerToken, 'PATCH', { priceCent: 1 }, 403);
    await request('/admin/orders', partnerToken, 'GET', undefined, 403);
    await request('/admin/payment-merchants', partnerToken, 'GET', undefined, 403);
    await request('/admin/accounts', partnerToken, 'GET', undefined, 403);
    await request(`/admin/conference-workspace/conferences/${confA.id}`, partnerToken, 'PATCH', { title: '测试会议 A · 运营已编辑' });
    await request(`/admin/conference-workspace/conferences/${confA.id}`, partnerToken, 'PATCH', { paymentMerchantId: 'forged' }, 400);
    await request(`/admin/conference-workspace/exports/registrations.xls?conferenceId=${confA.id}`, partnerToken, 'GET', undefined, 403);
    const empty = await request('/admin/accounts', token, 'POST', { username: `${prefix}-empty`, password, roleIds: [operatorRole.id] }, 201);
    assert.equal(empty.conferenceScopeMode, 'ASSIGNED');
    assert.deepEqual(empty.conferenceIds, []);
    const defaultSettings = await request(`/admin/payment-merchants/conferences/${confA.id}`, token);
    assert.equal(defaultSettings.paymentMerchantId, null);
    assert.equal(defaultSettings.companyName, '北京壹昂智创科技有限公司');
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const creds = { appId: process.env.WECHAT_PAY_APP_ID, mchSerialNo: 'TEST-SERIAL', platformKeyId: 'TEST-PUBLIC-KEY', apiV3Key: randomBytes(16).toString('hex'), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), platformPublicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
    const created = [];
    for (const letter of ['A', 'B']) {
      const merchant = await request('/admin/payment-merchants', token, 'POST', { companyName: `测试收款单位 ${letter}（仅本机）`, mchId: String(Date.now()).slice(-10) + (letter === 'A' ? '1' : '2') }, 201);
      await request(`/admin/payment-merchants/conferences/${confA.id}`, token, 'PATCH', { paymentMerchantId: merchant.id }, 409);
      const revision = await request(`/admin/payment-merchants/${merchant.id}/revisions`, token, 'POST', creds, 201);
      await request(`/admin/payment-merchants/${merchant.id}/revisions/${revision.id}/activate`, token, 'POST', { associationConfirmed: true }, 409);
      // Only the isolated fixture marks verification; never call real WeChat in this script.
      await db.paymentMerchantRevision.update({ where: { id: revision.id }, data: { checkedAt: new Date() } });
      await request(`/admin/payment-merchants/${merchant.id}/revisions/${revision.id}/activate`, token, 'POST', { associationConfirmed: false }, 400);
      await request(`/admin/payment-merchants/${merchant.id}/revisions/${revision.id}/activate`, token, 'POST', { associationConfirmed: true }, 201);
      created.push({ merchant, revision });
    }
    const listText = JSON.stringify(await request('/admin/payment-merchants', token));
    for (const forbidden of [creds.apiV3Key, creds.privateKeyPem, 'credentialEnc']) assert.ok(!listText.includes(forbidden));
    await request(`/admin/payment-merchants/conferences/${confA.id}`, token, 'PATCH', { paymentMerchantId: created[0].merchant.id });
    const user = await db.user.create({ data: { openid: `${prefix}-guest`, nickname: '测试嘉宾' } });
    const order = (await app.get(RegistrationService).createOrder({ conferenceId: confA.id, skuId: skuA.id, quantity: 1, formData: { name: '测试嘉宾', phone: '13800000000' } }, { id: user.id, openid: user.openid, nickname: user.nickname })).data;
    const pinned = await db.order.findUniqueOrThrow({ where: { orderNo: order.orderNo } });
    assert.equal(pinned.paymentMerchantRevisionId, created[0].revision.id);
    await request(`/admin/payment-merchants/conferences/${confA.id}`, token, 'PATCH', { paymentMerchantId: created[1].merchant.id });
    const config = await merchants.configForOrder(pinned);
    assert.equal(config.mchId, created[0].merchant.mchId);
    const rowsA = await request(`/admin/orders?paymentMerchantId=${created[0].merchant.id}`, token);
    const rowsB = await request(`/admin/orders?paymentMerchantId=${created[1].merchant.id}`, token);
    assert.equal(rowsA.total, 1); assert.equal(rowsB.total, 0);
    assert.equal(rowsA.items[0].paymentCompanyName, created[0].merchant.companyName);
    const scopedOrder = await request(`/admin/conference-workspace/orders/${order.orderNo}`, partnerToken);
    assert.deepEqual(Object.keys(scopedOrder.user).sort(), ['id', 'nickname']);
    const foreign = await db.order.create({ data: { orderNo: `${prefix}-foreign`, conferenceId: confB.id, skuId: skuB.id, originAmountCent: 68000, payableAmountCent: 68000, submittedFormJson: {} } });
    await request(`/admin/conference-workspace/orders/${foreign.orderNo}`, partnerToken, 'GET', undefined, 403);
    await request(`/admin/accounts/${partner.id}`, token, 'PATCH', { conferenceScopeMode: 'ASSIGNED', conferenceIds: [] });
    await request(`/admin/conference-workspace/orders/${order.orderNo}`, partnerToken, 'GET', undefined, 403);
    assert.equal((await request('/admin/conference-workspace/conferences', partnerToken)).total, 0);
    await request(`/admin/accounts/${partner.id}`, token, 'PATCH', { conferenceScopeMode: 'ASSIGNED', conferenceIds: [confA.id] });
    await request(`/admin/payment-merchants/${created[1].merchant.id}`, token, 'PATCH', { enabled: false });
    await assert.rejects(() => merchants.snapshotForConference(db, confA.id), /不会改用默认/);
    assert.equal((await merchants.configForOrder(pinned)).mchId, created[0].merchant.mchId);
    await request(`/admin/payment-merchants/conferences/${confA.id}`, token, 'PATCH', { paymentMerchantId: null });
    assert.equal((await merchants.snapshotForConference(db, confA.id)).paymentMerchantRevisionId, null);
    assert.equal((await merchants.configForOrder(pinned)).mchId, created[0].merchant.mchId);
    const rotatedPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rotatedCreds = { ...creds, apiV3Key: randomBytes(16).toString('hex'), mchSerialNo: 'ROTATED-MERCHANT', platformKeyId: 'ROTATED-PLATFORM', privateKeyPem: rotatedPair.privateKey.export({ type: 'pkcs8', format: 'pem' }), platformPublicKeyPem: rotatedPair.publicKey.export({ type: 'spki', format: 'pem' }) };
    const rotated = await request(`/admin/payment-merchants/${created[0].merchant.id}/revisions`, token, 'POST', rotatedCreds, 201);
    await db.paymentMerchantRevision.update({ where: { id: rotated.id }, data: { checkedAt: new Date() } });
    await request(`/admin/payment-merchants/${created[0].merchant.id}/revisions/${rotated.id}/activate`, token, 'POST', { associationConfirmed: true }, 201);
    assert.equal((await merchants.configForOrder(pinned)).mchSerialNo, 'ROTATED-MERCHANT');
    await db.payment.create({ data: { orderId: pinned.id, provider: 'WECHAT', outTradeNo: pinned.orderNo, amountCent: pinned.payableAmountCent, status: 'PENDING' } });
    process.env.WECHAT_PAY_MODE = 'real';
    const paymentResource = { mchid: created[0].merchant.mchId, appid: creds.appId, out_trade_no: pinned.orderNo, transaction_id: `${prefix}-transaction`, trade_state: 'SUCCESS', success_time: new Date().toISOString(), amount: { total: pinned.payableAmountCent, currency: 'CNY' } };
    async function callback(payload, revisionId, expected, invalidSignature = false) {
      const nonce = randomBytes(6).toString('hex');
      const cipher = createCipheriv('aes-256-gcm', Buffer.from(rotatedCreds.apiV3Key), Buffer.from(nonce));
      cipher.setAAD(Buffer.from('transaction'));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString('base64');
      const raw = JSON.stringify({ id: `${prefix}-notify`, event_type: 'TRANSACTION.SUCCESS', resource_type: 'encrypt-resource', resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: 'transaction', ciphertext: encrypted } });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign('RSA-SHA256', Buffer.from(`${timestamp}\nnonce\n${raw}\n`), rotatedPair.privateKey).toString('base64');
      const response = await fetch(`${base}/api/payments/wechat/merchants/${revisionId}/notify`, { method: 'POST', headers: { 'content-type': 'application/json', 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': 'nonce', 'wechatpay-serial': rotatedCreds.platformKeyId, 'wechatpay-signature': invalidSignature ? 'invalid' : signature }, body: raw });
      const body = await response.json();
      assert.equal(response.status, expected, `synthetic callback: ${JSON.stringify(body)}`);
      checks += 1;
    }
    await callback(paymentResource, created[0].revision.id, 401, true);
    await callback({ ...paymentResource, mchid: created[1].merchant.mchId }, created[0].revision.id, 409);
    await callback({ ...paymentResource, amount: { total: 1, currency: 'CNY' } }, created[0].revision.id, 409);
    assert.equal(await db.registration.count({ where: { orderId: pinned.id } }), 0);
    await callback(paymentResource, created[0].revision.id, 200);
    await callback(paymentResource, created[0].revision.id, 200);
    assert.equal(await db.registration.count({ where: { orderId: pinned.id } }), 1);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: pinned.id } })).paidAmountCent, 58000);
    const registration = await db.registration.findUniqueOrThrow({ where: { orderId: pinned.id } });
    const scopedRegistration = await request(`/admin/conference-workspace/registrations/${registration.id}`, partnerToken);
    assert.deepEqual(Object.keys(scopedRegistration.user).sort(), ['id', 'nickname']);
    const originalPermissions = await db.rolePermission.findMany({ where: { roleId: operatorRole.id } });
    const readPermission = await db.permission.findUniqueOrThrow({ where: { code: 'conference:view' } });
    await request(`/admin/roles/${operatorRole.id}`, token, 'PATCH', { permissionIds: [readPermission.id] });
    const refreshed = await request('/admin/auth/me', partnerToken);
    assert.deepEqual(refreshed.admin.permissions, ['conference:view']);
    await request(`/admin/conference-workspace/conferences/${confA.id}`, partnerToken, 'PATCH', { title: 'forbidden' }, 403);
    await request(`/admin/roles/${operatorRole.id}`, token, 'PATCH', { permissionIds: originalPermissions.map(p => p.permissionId) });
    process.env.WECHAT_PAY_MODE = 'mock';
    console.log(`PASS: ${checks} authenticated HTTP checks; real PostgreSQL order snapshot, isolation, revocation, secret redaction and merchant routing`);
    if (process.argv.includes('--serve')) {
      const fs = require('node:fs');
      fs.writeFileSync('.tmp/merchant-preview-session.json', JSON.stringify({ base, adminToken: token, partnerToken, conferenceId: confA.id }), { mode: 0o600 });
      console.log(`Isolated preview API: ${base}; local fixture session .tmp/merchant-preview-session.json`);
      await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
    }
  } finally { await app.close(); globalThis.fetch = nativeFetch; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
