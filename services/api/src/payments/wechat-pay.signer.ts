import { randomBytes, sign as signCrypto } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { WechatPayConfig } from "./wechat-pay.config";

@Injectable()
export class WechatPaySigner {
  createNonce(): string {
    return randomBytes(16).toString("hex");
  }

  createTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  sign(message: string, privateKeyPem: string): string {
    return signCrypto("RSA-SHA256", Buffer.from(message, "utf8"), privateKeyPem).toString("base64");
  }

  createAuthorization(input: {
    method: "POST" | "GET";
    urlPathWithQuery: string;
    body: string;
    config: WechatPayConfig;
  }): string {
    const timestamp = this.createTimestamp();
    const nonce = this.createNonce();
    const message = `${input.method}\n${input.urlPathWithQuery}\n${timestamp}\n${nonce}\n${input.body}\n`;
    const signature = this.sign(message, input.config.privateKeyPem);

    return [
      "WECHATPAY2-SHA256-RSA2048",
      `mchid="${input.config.mchId}"`,
      `nonce_str="${nonce}"`,
      `signature="${signature}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${input.config.mchSerialNo}"`
    ].join(",");
  }

  createRequestPaymentParams(input: {
    appId: string;
    prepayId: string;
    privateKeyPem: string;
  }) {
    const timeStamp = this.createTimestamp();
    const nonceStr = this.createNonce();
    const packageValue = `prepay_id=${input.prepayId}`;
    const message = `${input.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;

    return {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA" as const,
      paySign: this.sign(message, input.privateKeyPem)
    };
  }
}
