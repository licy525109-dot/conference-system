import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await installFixtures(page);
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "guest-schedule-visual-token"));
});

test("existing SmartSheet link opens visual field mapping without asking for internal IDs", async ({ page }) => {
  await page.goto("http://localhost:5174/#/guest-schedules?conferenceId=conference-jiangmen");

  await expect(page.getByRole("heading", { name: "嘉宾会务安排" })).toBeVisible();
  await page.getByRole("button", { name: "智能表连接" }).click();
  await expect(page.getByText("接入现有智能表", { exact: true })).toBeVisible();
  await expect(page.getByLabel("智能表文档 ID")).toHaveCount(0);

  await page.locator(".link-recognizer input").fill(
    "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=share-code&tab=data-sheet&viewId=guest-view"
  );
  await page.getByRole("button", { name: "识别现有表" }).click();

  await expect(page.getByText("已识别“数据汇总”，共 11 个字段")).toBeVisible();
  await expect(page.getByText("系统只读取能唯一对应到已报名嘉宾的行")).toBeVisible();
  await expect(page.getByText("只读保护", { exact: true })).toBeVisible();
  await expect(page.locator(".schedule-mapping-rule").first()).toContainText("工作坊");
  await expect(page.getByText("同一位嘉宾可以同时命中多条规则")).toBeVisible();
  await expect(page.locator(".connection-drawer")).toHaveScreenshot("guest-schedule-wide-sheet-mapping.png", {
    maxDiffPixelRatio: 0.02
  });
});

test("existing SmartSheet discovery shows document permission errors instead of failing silently", async ({ page }) => {
  await page.route("**/api/admin/guest-schedules/smart-sheet/discover**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "BAD_REQUEST",
        message: "读取智能表子表失败：当前企业微信应用没有该文档的对象权限（851003 no authority）"
      })
    });
  });
  await page.goto("http://localhost:5174/#/guest-schedules?conferenceId=conference-jiangmen");

  await page.getByRole("button", { name: "智能表连接" }).click();
  await page.locator(".link-recognizer input").fill(
    "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=share-code&tab=data-sheet"
  );
  await page.getByRole("button", { name: "识别现有表" }).click();

  await expect(page.getByText("现有表识别失败")).toBeVisible();
  await expect(page.locator(".discovery-error").getByText(/企微返回 851003：当前应用没有这张智能表的文档对象权限/)).toBeVisible();
  await expect(page.getByRole("button", { name: "识别现有表" })).toBeEnabled();
});

async function installFixtures(page: Page): Promise<void> {
  await page.route("http://localhost:3001/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path === "/api/admin/auth/me") {
      return ok(route, {
        admin: {
          id: "guest-admin",
          username: "guest-admin",
          displayName: "会务管理员",
          permissions: ["guest-schedule:view", "guest-schedule:write", "guest-schedule:publish"]
        }
      });
    }
    if (path === "/api/admin/conferences") {
      return ok(route, {
        items: [{
          id: "conference-jiangmen",
          title: "观潮会集·第五届舞蹈闭门会【广东江门站】",
          status: "PUBLISHED",
          startAt: "2026-10-20T01:00:00.000Z",
          endAt: "2026-10-22T10:00:00.000Z"
        }],
        total: 1,
        page: 1,
        pageSize: 100
      });
    }
    if (path === "/api/admin/guest-schedules") {
      return ok(route, {
        items: [], total: 0, page: 1, pageSize: 20,
        summary: { total: 0, draft: 0, changed: 0, published: 0 }
      });
    }
    if (path === "/api/admin/guest-schedules/attendees") return ok(route, { items: [] });
    if (path === "/api/admin/guest-schedules/smart-sheet/config") {
      return ok(route, {
        connection: null,
        integrations: [{ id: "wecom-main", name: "观潮企微自建应用", enabled: true, verified: true, configured: true }],
        defaults: {
          guestFieldMapping: {},
          assignmentFieldMapping: {},
          wideSheetConfig: wideConfig(false),
          syncIntervalSeconds: 60
        },
        requiredAssignmentFields: []
      });
    }
    if (path === "/api/admin/guest-schedules/smart-sheet/discover") {
      return ok(route, {
        docId: "s3_existing",
        docUrl: "https://doc.weixin.qq.com/smartsheet/s3_existing?tab=data-sheet&viewId=guest-view",
        viewId: "guest-view",
        selectedSheetId: "data-sheet",
        sheets: [{ id: "data-sheet", title: "数据汇总", type: "smartsheet", fieldCount: 11, recordCount: 266 }],
        fields: fieldTitles.map((title, index) => ({ id: `field-${index + 1}`, title, type: "text" })),
        suggestedWideSheetConfig: wideConfig(true)
      });
    }
    return ok(route, {});
  });
}

const fieldTitles = [
  "姓名", "公司&品牌缩写", "手机号", "职位", "工作坊安排", "工作坊名称",
  "工作坊开始时间", "工作坊结束时间", "工作坊地点", "工作坊角色", "工作坊备注"
];

function wideConfig(enableWorkshop: boolean) {
  return {
    mode: "EXISTING_WIDE_SHEET",
    identity: { attendeeIdField: "", phoneField: "手机号", nameField: "姓名", companyField: "公司&品牌缩写" },
    writeRegistrationFields: false,
    registration: {
      registrationNoField: "", conferenceTitleField: "", titleField: "职位",
      skuNameField: "", registrationStatusField: "", syncedAtField: ""
    },
    schedules: [
      schedule("workshop", "WORKSHOP", "工作坊", enableWorkshop, {
        triggerField: "工作坊安排",
        activityNameField: "工作坊名称",
        startsAtField: "工作坊开始时间",
        endsAtField: "工作坊结束时间",
        locationField: "工作坊地点",
        roleField: "工作坊角色",
        notesField: "工作坊备注"
      }),
      schedule("dinner", "DINNER", "晚宴", false),
      schedule("speech", "SPEECH", "分享演讲", false),
      schedule("rehearsal", "REHEARSAL", "彩排", false),
      schedule("reception", "RECEPTION", "接待", false),
      schedule("other", "OTHER", "其他事项", false)
    ]
  };
}

function schedule(id: string, type: string, label: string, enabled: boolean, values: Record<string, string> = {}) {
  return {
    id, type, label, enabled,
    triggerField: "", activityNameField: "", activityNameFallback: label,
    startsAtField: "", endsAtField: "", locationField: "", roleField: "",
    tableNoField: "", isTableLeaderField: "", shareTopicField: "", notesField: "",
    ...values
  };
}

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "OK", message: "ok", data }) });
}
