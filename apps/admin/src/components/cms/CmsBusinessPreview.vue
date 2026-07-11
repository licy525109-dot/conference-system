<template>
  <section class="business-preview" :class="`is-${context.kind}`">
    <template v-if="context.kind === 'cart'">
      <header v-if="isVisible('title')" class="preview-titlebar">
        <span class="preview-titlebar__icon"><ShoppingCart /></span>
        <div><strong>{{ moduleContent('title', '购物车') }}</strong><small>管理报名项与商城商品</small></div>
        <button type="button">刷新</button>
      </header>

      <div v-if="isVisible('couponNotice')" class="preview-notice">
        <Ticket />
        <div><strong>{{ moduleTitle('couponNotice', '优惠券提示') }}</strong><small>{{ moduleContent('couponNotice', '选择已领取的商品券或通用券') }}</small></div>
        <button type="button">选择</button>
      </div>

      <section v-if="isVisible('cartItems') && isVisible('registrationItems')" class="preview-section">
        <header><strong>{{ moduleTitle('registrationItems', '会议报名') }}</strong><small>1 项</small></header>
        <article class="preview-line-item">
          <span class="preview-check is-selected"><CircleCheck /></span>
          <span class="preview-item-mark"><Calendar /></span>
          <div><strong>创始人闭门会</strong><small>标准票 · 1 人</small><b>¥299.00</b></div>
          <span class="preview-quantity">−&nbsp; 1 &nbsp;+</span>
        </article>
      </section>

      <section v-if="isVisible('cartItems') && isVisible('mallItems')" class="preview-section">
        <header><strong>{{ moduleTitle('mallItems', '商城商品') }}</strong><small>2 件</small></header>
        <article class="preview-line-item">
          <span class="preview-check is-selected"><CircleCheck /></span>
          <img src="/static/fixed-templates/products/product_notebook.png" alt="观潮笔记本" />
          <div><strong>观潮笔记本</strong><small>经典黑 · 现货</small><b>¥68.00</b></div>
          <span class="preview-quantity">−&nbsp; 2 &nbsp;+</span>
        </article>
      </section>

      <section v-if="isVisible('shippingInfo')" class="preview-section preview-shipping">
        <header><strong>{{ moduleTitle('shippingInfo', '收货信息') }}</strong><button type="button">使用常用信息</button></header>
        <div class="preview-field-row"><span>收货人</span><b>微信用户</b></div>
        <div class="preview-field-row"><span>手机</span><b>138****8888</b></div>
        <div class="preview-field-row"><span>地址</span><b>请选择收货地址</b></div>
      </section>

      <div v-if="isVisible('productCoupons')" class="preview-notice is-plain">
        <Ticket />
        <div><strong>{{ moduleTitle('productCoupons', '商品优惠券') }}</strong><small>结算时由后端重新计算优惠</small></div>
        <button type="button">选择</button>
      </div>

      <section v-if="isVisible('recommendations')" class="preview-section preview-products">
        <header><strong>{{ moduleTitle('recommendations', '为你推荐') }}</strong><small>更多</small></header>
        <div class="preview-product-grid">
          <article><img src="/static/fixed-templates/products/product_tote_bag.png" alt="观潮帆布袋" /><strong>观潮帆布袋</strong><b>¥88</b></article>
          <article><img src="/static/fixed-templates/products/product_mug.png" alt="会议马克杯" /><strong>会议马克杯</strong><b>¥59</b></article>
        </div>
      </section>

      <footer v-if="isVisible('checkoutBar')" class="preview-checkout">
        <span class="preview-check is-selected"><CircleCheck /></span><small>全选</small>
        <div><small>合计</small><strong>¥435.00</strong></div>
        <button type="button">{{ moduleContent('checkoutBar', context.cta || '去结算') }}</button>
      </footer>
    </template>

    <template v-else-if="context.kind === 'registration-form'">
      <header class="preview-visual-head is-registration">
        <span>会议报名</span>
        <strong>{{ context.title }}</strong>
        <small>选择票种并填写参会信息</small>
      </header>
      <section v-if="isVisible('registrationInfo')" class="preview-section preview-summary">
        <div><Calendar /><span>2026 年 8 月 16 日</span></div>
        <div><Location /><span>上海 · 会议中心</span></div>
      </section>
      <section v-if="isVisible('skuSelector')" class="preview-section">
        <header><strong>{{ moduleTitle('skuSelector', '选择报名规格') }}</strong><small>剩余 28</small></header>
        <button class="preview-ticket is-selected" type="button"><span><strong>标准参会票</strong><small>含会议资料与茶歇</small></span><b>¥299</b></button>
        <button class="preview-ticket" type="button"><span><strong>会员专享票</strong><small>登录后校验会员权益</small></span><b>¥239</b></button>
      </section>
      <section v-if="isVisible('couponFee')" class="preview-notice is-plain">
        <Ticket /><div><strong>{{ moduleTitle('couponFee', '优惠与费用') }}</strong><small>可用优惠券 2 张</small></div><button type="button">选择</button>
      </section>
      <section v-if="isVisible('attendeeForm')" class="preview-section preview-form">
        <header><strong>{{ moduleTitle('attendeeForm', '参会人信息') }}</strong><small>必填</small></header>
        <label><span>姓名</span><em>请输入参会人姓名</em></label>
        <label><span>手机号</span><em>用于接收参会通知</em></label>
        <label><span>公司 / 职位</span><em>请填写真实信息</em></label>
      </section>
      <footer v-if="isVisible('submitOrder') || isVisible('addCartButton')" class="preview-actionbar">
        <div><small>应付金额</small><strong>¥299.00</strong></div>
        <button v-if="isVisible('addCartButton')" type="button" class="is-secondary">加入购物车</button>
        <button v-if="isVisible('submitOrder')" type="button">{{ moduleContent('submitOrder', context.cta || '提交订单') }}</button>
      </footer>
    </template>

    <template v-else-if="context.kind === 'mall-home'">
      <header class="preview-visual-head is-mall">
        <span>观潮会集</span><strong>会议周边商城</strong><small>精选会议周边与品牌物料</small>
      </header>
      <nav class="preview-chip-row"><button class="active" type="button">全部</button><button type="button">文创</button><button type="button">办公</button><button type="button">礼盒</button></nav>
      <section class="preview-section preview-products">
        <header><strong>精选商品</strong><small>查看全部</small></header>
        <div class="preview-product-grid">
          <article><img src="/static/fixed-templates/products/product_notebook.png" alt="观潮笔记本" /><strong>观潮笔记本</strong><b>¥68</b></article>
          <article><img src="/static/fixed-templates/products/product_tote_bag.png" alt="观潮帆布袋" /><strong>观潮帆布袋</strong><b>¥88</b></article>
          <article><img src="/static/fixed-templates/products/product_mug.png" alt="会议马克杯" /><strong>会议马克杯</strong><b>¥59</b></article>
          <article><img src="/static/fixed-templates/products/product_gift_box.png" alt="会议礼盒" /><strong>会议礼盒</strong><b>¥198</b></article>
        </div>
      </section>
    </template>

    <template v-else-if="context.kind === 'member-center' || context.kind === 'my-registrations'">
      <header class="preview-member-head">
        <span class="preview-avatar">{{ context.user?.nickname?.slice(0, 1) || '会' }}</span>
        <div><strong>{{ context.user?.nickname || '微信用户' }}</strong><small>{{ context.user?.memberLevel || '普通会员' }} · {{ context.user?.phone || '未绑定手机' }}</small></div>
        <button type="button">编辑</button>
      </header>
      <div class="preview-stat-row">
        <span><b>{{ context.user?.registrationCount || 0 }}</b><small>我的报名</small></span>
        <span><b>{{ context.user?.pendingConferenceCount || 0 }}</b><small>待参会</small></span>
        <span><b>{{ context.user?.orderCount || 0 }}</b><small>订单</small></span>
        <span><b>{{ context.user?.couponCount || 0 }}</b><small>优惠券</small></span>
      </div>
      <section class="preview-section preview-registration-card">
        <header><strong>创始人闭门会</strong><span>待参会</span></header>
        <div><Calendar /><small>2026 年 8 月 16 日 · 上海</small></div>
        <button type="button">查看报名凭证</button>
      </section>
      <section v-if="context.kind === 'member-center'" class="preview-menu-grid">
        <button type="button"><Calendar />我的会议</button><button type="button"><Ticket />优惠券</button><button type="button"><Document />发票信息</button><button type="button"><User />个人资料</button>
      </section>
    </template>

    <template v-else>
      <header class="preview-visual-head">
        <span>{{ context.label }}</span><strong>{{ context.title }}</strong><small>{{ conciseSubtitle }}</small>
      </header>
      <section class="preview-section preview-summary">
        <div v-for="(row, index) in context.rows" :key="row.label"><component :is="index === 0 ? Calendar : Location" /><span><small>{{ row.label }}</small><b>{{ row.value }}</b></span></div>
      </section>
      <section v-for="module in visibleSecondaryModules" :key="module.key" class="preview-section preview-content-row">
        <strong>{{ module.title }}</strong><small>{{ module.content || moduleFallback(module.key) }}</small>
      </section>
      <button v-if="context.cta" class="preview-primary-action" type="button">{{ context.cta }}</button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Calendar, CircleCheck, Document, Location, ShoppingCart, Ticket, User } from "@element-plus/icons-vue";

interface PreviewModule {
  key: string;
  title: string;
  content: string;
  visible: boolean;
  sort: number;
  style: string;
}

interface PreviewUser {
  avatarUrl: string;
  nickname: string;
  phone: string;
  memberStatus: string;
  memberLevel: string;
  registrationCount: number;
  pendingConferenceCount: number;
  orderCount: number;
  couponCount: number;
}

interface BusinessPreviewContext {
  kind: string;
  label: string;
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: string }>;
  notice: string;
  modules?: PreviewModule[];
  cta?: string;
  user?: PreviewUser;
}

const props = defineProps<{ context: BusinessPreviewContext }>();
const conciseSubtitle = computed(() => props.context.subtitle.split("，")[0] || props.context.notice);
const visibleSecondaryModules = computed(() => (props.context.modules ?? []).filter((module) => module.visible && !["registrationButton", "submitOrder", "assistant", "inventory"].includes(module.key)).slice(0, 4));

function moduleFor(key: string): PreviewModule | undefined {
  return props.context.modules?.find((module) => module.key === key);
}

function isVisible(key: string): boolean {
  return moduleFor(key)?.visible ?? true;
}

function moduleTitle(key: string, fallback: string): string {
  return moduleFor(key)?.title || fallback;
}

function moduleContent(key: string, fallback: string): string {
  return moduleFor(key)?.content || fallback;
}

function moduleFallback(key: string): string {
  const labels: Record<string, string> = {
    conferenceInfo: "会议时间、地点与报名状态",
    speakers: "嘉宾信息由主办方维护",
    schedule: "查看会议当天完整议程",
    location: "查看会场地址与交通信息",
    guide: "参会须知与现场服务说明",
    credentialQr: "真机将展示个人签到二维码",
    attendeeInfo: "显示当前参会人信息",
    paymentInfo: "显示订单与支付状态"
  };
  return labels[key] || "内容将根据真实业务数据展示";
}
</script>

<style scoped>
.business-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  color: #172033;
  font-size: 12px;
}

button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #dfe5e8;
  border-radius: 8px;
  background: #fff;
  color: #315d7d;
  font: inherit;
  font-weight: 700;
}

svg { width: 15px; height: 15px; }
strong, b { font-weight: 750; }
small { color: #6d7787; font-size: 10px; line-height: 1.45; }

.preview-titlebar,
.preview-notice,
.preview-member-head,
.preview-section,
.preview-stat-row,
.preview-menu-grid {
  border: 1px solid #e1e7ea;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgb(23 32 51 / 5%);
}

.preview-titlebar,
.preview-notice,
.preview-member-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
}

.preview-titlebar > div,
.preview-notice > div,
.preview-member-head > div { min-width: 0; flex: 1; display: grid; gap: 2px; }
.preview-titlebar__icon,
.preview-avatar,
.preview-item-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 9px;
  background: #e8f0f4;
  color: #315d7d;
}

.preview-avatar { border-radius: 50%; background: #172033; color: #fff; font-weight: 800; }
.preview-notice { background: #fbf6e9; border-color: #eee1bd; }
.preview-notice > svg { color: #9b762d; }
.preview-notice.is-plain { background: #fff; border-color: #e1e7ea; }

.preview-section { overflow: hidden; }
.preview-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #edf0f2;
}

.preview-section > header span { padding: 3px 7px; border-radius: 5px; background: #e9f2ed; color: #2e755e; font-size: 9px; }
.preview-line-item { display: grid; grid-template-columns: 20px 44px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 11px 12px; }
.preview-line-item > img { width: 44px; height: 44px; border-radius: 9px; object-fit: cover; background: #f2f4f5; }
.preview-line-item > div { display: grid; gap: 2px; }
.preview-line-item b, .preview-product-grid b { color: #9b762d; }
.preview-check { display: grid; width: 18px; height: 18px; place-items: center; border: 1px solid #cfd7dc; border-radius: 50%; color: transparent; }
.preview-check.is-selected { border-color: #9b762d; background: #9b762d; color: #fff; }
.preview-check svg { width: 12px; height: 12px; }
.preview-quantity { padding: 5px 7px; border-radius: 6px; background: #f3f5f6; color: #4b5563; white-space: nowrap; }

.preview-shipping { padding-bottom: 5px; }
.preview-field-row { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; padding: 8px 12px; border-bottom: 1px solid #f0f2f3; }
.preview-field-row:last-child { border-bottom: 0; }
.preview-field-row span { color: #737e8d; }
.preview-field-row b { font-weight: 600; }

.preview-products { padding-bottom: 10px; }
.preview-product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 10px; }
.preview-product-grid article { min-width: 0; overflow: hidden; border: 1px solid #e5e9eb; border-radius: 9px; background: #fff; }
.preview-product-grid img { width: 100%; aspect-ratio: 1.25; object-fit: cover; background: #f3f4f5; }
.preview-product-grid strong, .preview-product-grid b { display: block; padding: 5px 7px 0; font-size: 10px; }
.preview-product-grid b { padding-bottom: 7px; }

.preview-checkout,
.preview-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border: 1px solid #dce2e5;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 -6px 18px rgb(23 32 51 / 9%);
}
.preview-checkout > div, .preview-actionbar > div { min-width: 0; flex: 1; display: grid; }
.preview-checkout > button, .preview-actionbar > button, .preview-primary-action { border-color: #9b762d; background: #9b762d; color: #fff; }
.preview-actionbar > button.is-secondary { border-color: #d5dde1; background: #fff; color: #315d7d; }

.preview-visual-head {
  min-height: 112px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 3px;
  overflow: hidden;
  padding: 16px;
  border-radius: 12px;
  background: #172033;
  color: #fff;
}
.preview-visual-head.is-registration { background: #1d3448 url('/static/fixed-templates/heroes/hero_registration_bg.png') center / cover; }
.preview-visual-head.is-mall { background: #1d3448 url('/static/fixed-templates/heroes/hero_mall_bg.png') center / cover; }
.preview-visual-head > span { color: #d6bd82; font-size: 10px; font-weight: 700; }
.preview-visual-head > strong { font-size: 18px; line-height: 1.2; }
.preview-visual-head > small { color: rgb(255 255 255 / 82%); }

.preview-summary { padding: 4px 0; }
.preview-summary > div { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
.preview-summary > div > svg { color: #315d7d; }
.preview-summary > div > span { display: grid; gap: 1px; }

.preview-ticket { width: calc(100% - 20px); min-height: 54px; display: flex; align-items: center; justify-content: space-between; margin: 8px 10px; text-align: left; }
.preview-ticket > span { display: grid; gap: 2px; }
.preview-ticket.is-selected { border-color: #315d7d; background: #edf4f7; }
.preview-ticket b { color: #9b762d; }

.preview-form { padding-bottom: 5px; }
.preview-form label { display: grid; grid-template-columns: 78px minmax(0, 1fr); padding: 10px 12px; border-bottom: 1px solid #eef1f2; }
.preview-form label:last-child { border-bottom: 0; }
.preview-form em { color: #9aa3ad; font-style: normal; }

.preview-chip-row { display: flex; gap: 6px; overflow: hidden; }
.preview-chip-row button { min-width: 52px; min-height: 28px; padding: 0 9px; border-radius: 7px; white-space: nowrap; }
.preview-chip-row button.active { border-color: #172033; background: #172033; color: #fff; }

.preview-member-head { background: #172033; color: #fff; }
.preview-member-head small { color: rgb(255 255 255 / 72%); }
.preview-stat-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 11px 6px; }
.preview-stat-row span { display: grid; place-items: center; gap: 2px; }
.preview-stat-row b { font-size: 15px; }
.preview-registration-card { padding-bottom: 10px; }
.preview-registration-card > div { display: flex; align-items: center; gap: 6px; padding: 10px 12px; }
.preview-registration-card > button { margin-left: 12px; }
.preview-menu-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; overflow: hidden; }
.preview-menu-grid button { min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 0; }

.preview-content-row { display: grid; gap: 4px; padding: 11px 12px; }
.preview-primary-action { width: 100%; min-height: 38px; }
</style>
