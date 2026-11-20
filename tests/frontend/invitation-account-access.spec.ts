import { expect, test, type Page } from '@playwright/test';
import { createInvitationContent } from '../../packages/shared/src/invitations';

const origin = process.env.INVITATION_TEST_ADMIN_ORIGIN || 'http://localhost:5174';
const editorPermissions = ['invitation:view', 'invitation:content', 'invitation:publish', 'invitation:write'];
const choices = [
  { id: 'internal', title: '观潮内部会议邀请', conferenceId: 'meeting' },
  { id: 'external', title: '外部共创会议邀请', conferenceId: null }
];

for (const width of [390, 1440]) {
  test(`account invitation grants select internal and external campaigns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await accountFixture(page);
    await page.goto(`${origin}/#/system/accounts`);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑账号' });
    await dialog.getByRole('button', { name: '添加邀请函编辑人员角色' }).click();
    await dialog.locator('.invitation-grants .el-select__wrapper').click();
    await page.getByRole('option', { name: /外部共创会议邀请/ }).click();
    await page.keyboard.press('Escape');
    await expect(dialog.getByText('已选 2 场', { exact: true })).toBeVisible();
    await expect(dialog.getByText('单独指定可操作的邀请函', { exact: false })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await dialog.screenshot({ path: `output/playwright/invitation-account-grants-${width}.png` });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(state.saved[0].invitationCampaignIds).toEqual(['internal', 'external']);
    expect(state.saved[0].roleIds).toContain('invitation-editor');
    expect(state.saved[0].conferenceScopeMode).toBeUndefined();
    // Removing all selections must send [] rather than omit the field.
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.locator('.invitation-grants .el-select__wrapper').click();
    await page.getByRole('option', { name: /观潮内部会议邀请/ }).click();
    await page.getByRole('option', { name: /外部共创会议邀请/ }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(state.saved[1].invitationCampaignIds).toEqual([]);
  });
}

test('failed invitation choices do not erase existing grants on unrelated account edits', async ({ page }) => {
  const state = await accountFixture(page, true);
  await page.goto(`${origin}/#/system/accounts`);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑账号' });
  await expect(dialog.getByText('模拟邀请函列表暂不可用')).toBeVisible();
  await dialog.getByLabel('显示名', { exact: true }).fill('Updated');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.saved[0]).not.toHaveProperty('invitationCampaignIds');
  expect(state.account.invitationCampaignIds).toEqual(['internal']);
});

test('invitation-only scoped account lands in editor without conference access or global authorization controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  await page.addInitScript(() => localStorage.setItem('conference_admin_token', 'fixture'));
  const content = createInvitationContent({ title: '外部共创会议邀请' });
  await page.route('**/api/admin/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let data: unknown = {};
    if (path.endsWith('/auth/me')) data = { admin: { id: 'editor', username: 'editor', displayName: '邀请函编辑人员', permissions: editorPermissions, conferenceScopeMode: 'ASSIGNED', conferenceIds: [] } };
    else if (path.endsWith('/campaigns')) data = { items: [{ ...choices[1], draftRevision: 1, publishedRevision: 1, hasChanges: false }] };
    else if (path.endsWith('/campaigns/external')) data = { ...choices[1], draft: content, published: content, draftRevision: 1, publishedRevision: 1, hasChanges: false };
    else if (path.endsWith('/registration-options')) data = { conferences: [] };
    else if (path.endsWith('/recipients')) data = { items: [], total: 0, page: 1, pageSize: 20 };
    else if (path.includes('/assets')) data = { items: [], total: 0 };
    else return route.fulfill({ status: 403, json: { message: 'No access' } });
    return route.fulfill({ json: { code: 'OK', data, message: 'ok' } });
  });
  await page.goto(`${origin}/#/dashboard`);
  await expect(page.getByRole('heading', { name: '专属邀请函', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '会议内容', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '会议授权', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建会议邀请函' })).toHaveCount(0);
  expect(requests.some(path => path.includes('/conference-workspace') || path.endsWith('/invitations/options'))).toBe(false);
  await page.screenshot({ path: 'output/playwright/invitation-scoped-editor-mobile.png', fullPage: true });
});

async function accountFixture(page: Page, failOptions = false) {
  const roles = [{ id: 'invitation-editor', code: 'INVITATION_EDITOR', name: '邀请函编辑人员', enabled: true,
    system: true, permissions: editorPermissions.map(code => ({ id: code, code, name: code, group: '专属邀请函' })) }];
  const state = { saved: [] as any[], account: { id: 'editor', username: 'editor', displayName: '邀请配置账号', enabled: true,
    roles: [] as any[], conferenceScopeMode: 'ASSIGNED', conferenceIds: [], conferenceGrants: [],
    invitationCampaignIds: ['internal'], invitationCampaigns: [choices[0]], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
  await page.addInitScript(() => localStorage.setItem('conference_admin_token', 'fixture'));
  await page.route('**/api/admin/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    if (path.endsWith('/auth/me')) data = { admin: { id: 'manager', username: 'manager', displayName: '管理员', permissions: ['*'], conferenceScopeMode: 'ALL' } };
    else if (path.endsWith('/theme')) data = { config: {} };
    else if (path.endsWith('/roles')) data = { items: roles };
    else if (path.endsWith('/accounts/invitation-options')) {
      if (failOptions) return route.fulfill({ status: 503, json: { message: '模拟邀请函列表暂不可用' } });
      data = { items: choices };
    } else if (path.endsWith('/accounts/editor')) {
      const body = route.request().postDataJSON();
      state.saved.push(body);
      Object.assign(state.account, { displayName: body.displayName, roles: roles.filter(role => body.roleIds.includes(role.id)) });
      if (body.invitationCampaignIds !== undefined) Object.assign(state.account, {
        invitationCampaignIds: body.invitationCampaignIds,
        invitationCampaigns: choices.filter(choice => body.invitationCampaignIds.includes(choice.id))
      });
      data = state.account;
    } else if (path.endsWith('/accounts')) data = { items: [state.account] };
    else if (path.endsWith('/conferences')) data = { items: [], total: 0, page: 1, pageSize: 100 };
    return route.fulfill({ json: { code: 'OK', message: 'ok', data } });
  });
  return state;
}
