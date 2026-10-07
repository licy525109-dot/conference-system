# 跨会议引用报名字段

## 使用

1. 后台进入会议管理，打开目标会议的配置详情。
2. 选择「报名字段」，点击「从其他会议引用」。
3. 搜索并选择来源会议，预览字段后勾选需要的项目。
4. 点击「确认引用」，字段立即保存到目标会议，可继续单独编辑。

## 边界

- 一次性复制配置，不建立跨会议同步关系。
- 保留字段类型、标识、标签、选项、校验规则、必填、提示和启用状态。
- 默认选择启用且不冲突的字段；可手动勾选停用字段，引用后仍为停用。
- 同字段标识（fieldKey）视为重复，即使目标字段已停用也不覆盖。
- 按来源顺序追加到目标会议已有字段之后，每次最多选择 200 项。
- 仅复制配置，不复制或修改嘉宾、已提交表单、订单、金额或支付记录。
- 后端要求已登录管理员同时具有 conference:view 和 conference:write 权限。
- 数据写入和审计在同一 Serializable 事务中完成。并发冲突返回 409，刷新后可重试。
- 无数据库结构迁移，无小程序端改动。上线需要部署后台和 API。

## 修改文件

- `apps/admin/src/pages/conferences/config.vue`：字段引用入口，接收目标字段更新。
- `apps/admin/src/components/conference/FormFieldImportDialog.vue`：会议搜索、预览、选择、重复提示、异常重试、窄屏适配。
- `apps/admin/src/services/admin.ts`：引用接口客户端。
- `services/api/src/admin/admin-management.controller.ts`：鉴权和权限入口。
- `services/api/src/admin/admin-management.service.ts`：校验、复制、去重、排序、事务和审计。
- `services/api/src/admin/admin-form-field-import.spec.ts`：19 项后端单元测试。
- `tests/frontend/form-field-import-state.test.mjs`：12 项前端状态测试。
- `tests/e2e/form-field-import.integration.ts`：独立 PostgreSQL 集成测试。

## 2026-10-07 本地验收

- PASS：后台和 API 类型检查；后台完整生产构建。
- PASS：API 全套测试 553 项，含本次新增 19 项。
- PASS：前端字段引用和报名页回归测试共 43 项，含新增 12 项。
- PASS：独立 PostgreSQL 中验证配置保真、目标独立编辑、重复引用、并发防重及审计失败整批回滚。
- PASS：Playwright 验证实际 Vue 页面选择部分字段、请求内容、保存后列表刷新、重复引用、空来源及加载失败重试。
- PASS：1440px 桌面和 390px 窄屏截图检查；窄屏确认按钮完整位于视口内。
- 浏览器使用本地合成接口；数据库测试单独调用真实服务逻辑，不等同于生产端到端验收。
- 构建存在既有依赖注释及大包提示，没有构建失败。
- NOT_RUN：生产部署和生产管理员验收，本次未操作生产数据。

复验命令：

```sh
pnpm --filter @conference/admin typecheck
pnpm --filter @conference/api typecheck
pnpm --filter @conference/admin build
pnpm --filter @conference/api test
node --test tests/frontend/form-field-import-state.test.mjs tests/frontend/gold-registration-state.test.mjs
```

数据库集成测试需要显式设置 `FORM_FIELD_IMPORT_TEST_DATABASE_URL`；仅接受本机名为 `form_field_import_qa` 的独立测试库，缺失时跳过。
