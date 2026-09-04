import { BadRequestException } from "@nestjs/common";

export function validateWecomGroupRobotWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException("企微群机器人 Webhook URL 格式无效");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "qyapi.weixin.qq.com"
    || url.pathname !== "/cgi-bin/webhook/send"
    || !url.searchParams.get("key")
    || url.username
    || url.password
  ) {
    throw new BadRequestException("企微群机器人 Webhook 必须使用 qyapi.weixin.qq.com 官方地址");
  }
  return url.toString();
}
