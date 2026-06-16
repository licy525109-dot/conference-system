export const ADMIN_PERMISSIONS = [
  { code: "dashboard:view", name: "查看数据看板", group: "Dashboard" },
  { code: "conference:view", name: "查看会议", group: "会议管理" },
  { code: "conference:write", name: "编辑会议", group: "会议管理" },
  { code: "order:view", name: "查看订单", group: "订单管理" },
  { code: "order:delete", name: "删除未支付订单", group: "订单管理" },
  { code: "registration:view", name: "查看报名", group: "报名管理" },
  { code: "registration:write", name: "编辑报名备注和核销", group: "报名管理" },
  { code: "coupon:view", name: "查看优惠券", group: "优惠券管理" },
  { code: "coupon:write", name: "编辑优惠券", group: "优惠券管理" },
  { code: "promotion:view", name: "查看满减规则", group: "满减管理" },
  { code: "promotion:write", name: "编辑满减规则", group: "满减管理" },
  { code: "material:view", name: "查看素材", group: "素材管理" },
  { code: "material:write", name: "编辑素材", group: "素材管理" },
  { code: "page:view", name: "查看小程序页面配置", group: "页面装修" },
  { code: "page:write", name: "编辑小程序页面配置", group: "页面装修" },
  { code: "theme:view", name: "查看主题配置", group: "页面装修" },
  { code: "theme:write", name: "编辑主题配置", group: "页面装修" },
  { code: "tabbar:view", name: "查看底部导航配置", group: "页面装修" },
  { code: "tabbar:write", name: "编辑底部导航配置", group: "页面装修" },
  { code: "member:view", name: "查看会员", group: "用户与会员" },
  { code: "member:write", name: "编辑会员", group: "用户与会员" },
  { code: "finance:view", name: "查看财务对账", group: "财务中心" },
  { code: "finance:write", name: "创建对账批次", group: "财务中心" },
  { code: "mall:view", name: "查看商城", group: "商城管理" },
  { code: "mall:write", name: "编辑商城", group: "商城管理" },
  { code: "system:account", name: "管理账号", group: "系统设置" },
  { code: "system:role", name: "管理角色权限", group: "系统设置" },
  { code: "system:audit", name: "查看操作日志", group: "系统设置" }
] as const;

export const ADMIN_PERMISSION_CODES = ADMIN_PERMISSIONS.map((permission) => permission.code);
export const SUPER_ADMIN_ROLE_CODE = "super_admin";
