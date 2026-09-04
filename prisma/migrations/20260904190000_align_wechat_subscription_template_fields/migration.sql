UPDATE "notification_templates"
SET
  "contentJson" = "contentJson" || '{
    "variables": ["{{会议名称}}", "{{会议时间}}", "{{会议地点}}", "{{参会人姓名}}", "{{订单号}}", "{{报名状态}}"],
    "wechatData": {
      "name6": "{{参会人姓名}}",
      "thing2": "{{会议名称}}",
      "date3": "{{会议时间}}",
      "thing4": "{{会议地点}}",
      "phrase1": "{{报名状态}}"
    }
  }'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'REGISTRATION_SUCCESS';

UPDATE "notification_templates"
SET
  "contentJson" = "contentJson" || '{
    "variables": ["{{参会人姓名}}", "{{订单号}}", "{{支付金额}}", "{{支付方式}}"],
    "wechatData": {
      "name1": "{{参会人姓名}}",
      "amount3": "{{支付金额}}",
      "character_string2": "{{订单号}}",
      "name5": "观潮会集",
      "thing14": "{{支付方式}}"
    }
  }'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PAYMENT_SUCCESS';

UPDATE "notification_templates"
SET
  "contentJson" = "contentJson" || '{
    "variables": ["{{会议名称}}", "{{活动地点}}", "{{活动时间}}"],
    "wechatData": {
      "thing4": "{{会议名称}}",
      "thing5": "{{活动地点}}",
      "thing1": "{{活动时间}}",
      "thing3": "安排已更新，请进入小程序查看"
    }
  }'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GUEST_SCHEDULE_UPDATED';

UPDATE "notification_templates"
SET
  "contentJson" = "contentJson" || '{
    "variables": ["{{订单号}}", "{{退款金额}}", "{{退款方式}}", "{{退款时间}}"],
    "wechatData": {
      "character_string2": "{{订单号}}",
      "amount1": "{{退款金额}}",
      "name3": "观潮会集",
      "thing5": "{{退款方式}}",
      "time7": "{{退款时间}}"
    }
  }'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'REFUND_STATUS_UPDATED';
