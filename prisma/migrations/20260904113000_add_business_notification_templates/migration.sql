INSERT INTO "notification_templates" (
  "id", "code", "name", "channel", "status", "title", "contentJson", "remark", "createdAt", "updatedAt"
)
VALUES
  (
    'system_registration_success',
    'REGISTRATION_SUCCESS',
    '报名确认提醒',
    'WECHAT_SUBSCRIBE',
    'DRAFT',
    '报名已确认',
    '{"purpose":"REGISTRATION_SUCCESS","body":"{{参会人姓名}}，您报名的{{会议名称}}已确认。","content":"{{参会人姓名}}，您报名的{{会议名称}}已确认。","page":"pages/notifications/index","variables":["{{会议名称}}","{{参会人姓名}}","{{订单号}}","{{报名状态}}"]}'::jsonb,
    '请填写微信公众平台的订阅消息模板 ID，并按模板字段配置 wechatData 后启用。',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'system_payment_success',
    'PAYMENT_SUCCESS',
    '支付成功提醒',
    'WECHAT_SUBSCRIBE',
    'DRAFT',
    '支付成功，报名已确认',
    '{"purpose":"PAYMENT_SUCCESS","body":"{{会议名称}}报名支付成功，报名已确认。","content":"{{会议名称}}报名支付成功，报名已确认。","page":"pages/notifications/index","variables":["{{会议名称}}","{{参会人姓名}}","{{订单号}}","{{报名状态}}","{{支付金额}}"]}'::jsonb,
    '请填写微信公众平台的订阅消息模板 ID，并按模板字段配置 wechatData 后启用。',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'system_refund_status_updated',
    'REFUND_STATUS_UPDATED',
    '退款结果提醒',
    'WECHAT_SUBSCRIBE',
    'DRAFT',
    '退款结果已更新',
    '{"purpose":"REFUND_STATUS_UPDATED","body":"订单{{订单号}}的退款结果为{{退款状态}}。","content":"订单{{订单号}}的退款结果为{{退款状态}}。","page":"pages/refund/index","variables":["{{退款单号}}","{{订单号}}","{{退款金额}}","{{退款状态}}","{{处理说明}}"]}'::jsonb,
    '请填写微信公众平台的订阅消息模板 ID，并按模板字段配置 wechatData 后启用。',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO NOTHING;
