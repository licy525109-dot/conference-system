<template>
  <div class="scoped-workspace">
    <header class="workspace-header">
      <div class="brand"><strong>观潮会集</strong><span>会议工作台</span></div>
      <div class="account">
        <span>{{ session.admin.value?.displayName || session.admin.value?.username }}</span>
        <el-tooltip content="退出登录" placement="bottom">
          <el-button :icon="SwitchButton" aria-label="退出登录" :disabled="busy" @click="session.logout" />
        </el-tooltip>
      </div>
    </header>
    <main v-if="!canViewConference" class="access-state">
      <el-result icon="warning" title="无权限访问" sub-title="当前账号没有会议查看权限，请联系管理员。" />
    </main>
    <main v-else class="workspace-body">
      <aside class="conference-sidebar" aria-label="已授权会议">
        <div class="section-heading">
          <h1>已授权会议</h1>
          <el-tag type="info" effect="plain">{{ authorizedCount === null ? '-' : authorizedCount }}</el-tag>
          <el-tooltip content="刷新会议列表">
            <el-button :icon="Refresh" aria-label="刷新会议列表" :loading="loading.conferences" :disabled="busy" @click="loadConferences" />
          </el-tooltip>
        </div>
        <form class="search-row" @submit.prevent="searchConferences">
          <el-input v-model="conferenceSearch" clearable placeholder="搜索会议名称" aria-label="搜索已授权会议" :disabled="busy" />
          <el-tooltip content="搜索会议">
            <el-button native-type="submit" :icon="Search" aria-label="搜索会议" :disabled="busy || loading.conferences" />
          </el-tooltip>
        </form>
        <el-alert v-if="errors.conferences" :title="errors.conferences" type="error" :closable="false" show-icon />
        <div v-loading="loading.conferences" class="conference-list">
          <button v-for="item in conferences" :key="item.id" type="button" class="conference-option"
            :class="{ selected: selectedId === item.id }" :aria-pressed="selectedId === item.id"
            :disabled="busy" @click="selectConference(item.id)">
            <strong>{{ item.title }}</strong>
            <span>{{ date(item.startsAt) }}</span>
            <span>{{ statusLabel(item.status) }}<template v-if="item.location"> · {{ item.location }}</template></span>
          </button>
          <el-empty v-if="!loading.conferences && !conferences.length && !errors.conferences"
            :description="conferenceKeyword ? '没有匹配的已授权会议' : '暂无已授权会议'" :image-size="64" />
        </div>
        <div class="conference-pagination">
          <span>{{ conferenceKeyword ? '匹配' : '共' }} {{ conferencePagination.total }} 场</span>
          <el-pagination v-model:current-page="conferencePagination.page" :page-size="10" :pager-count="5"
            :total="conferencePagination.total" layout="prev, pager, next" size="small"
            :disabled="loading.conferences || busy" @current-change="loadConferences" />
        </div>
      </aside>
      <section class="workspace-content" aria-label="会议管理">
        <el-empty v-if="!selectedId" :description="errors.conferences ? '会议列表加载失败，请重试' : '请选择已授权会议'" />
        <template v-else>
          <div class="content-heading">
            <div><h2>{{ conference?.title || '会议内容' }}</h2><span v-if="conference" class="muted">{{ conference.location || '地点未设置' }} · {{ date(conference.startAt) }}</span></div>
            <el-tag v-if="conference" effect="plain">{{ statusLabel(conference.status) }}</el-tag>
            <el-tooltip content="刷新当前页签">
              <el-button :icon="Refresh" aria-label="刷新当前页签" :disabled="busy || loading.conference" @click="refreshTab" />
            </el-tooltip>
          </div>
          <el-alert v-if="errors.conference" :title="errors.conference" type="error" :closable="false" show-icon />
          <div v-if="loading.conference" v-loading="true" class="loading-area" />
          <el-tabs v-else-if="conference" v-model="activeTab">
            <el-tab-pane label="基础内容" name="basic" :disabled="busy">
              <el-alert v-if="errors.basic" :title="errors.basic" type="error" :closable="false" show-icon />
              <el-form class="content-form" label-position="top" :disabled="!canWriteConference || saving.conference" @submit.prevent>
                <div class="form-grid">
                  <el-form-item label="会议名称" required><el-input v-model="contentForm.title" /></el-form-item>
                  <el-form-item label="会议标识"><el-input :model-value="contentForm.slug" disabled /></el-form-item>
                  <el-form-item label="会议简介" class="wide"><el-input v-model="contentForm.subtitle" type="textarea" :rows="3" /></el-form-item>
                  <el-form-item label="封面图片 URL" class="wide">
                    <el-input v-model="contentForm.coverImage" type="url" aria-label="封面图片 URL" />
                    <el-image v-if="safeCoverUrl" class="cover-preview" :src="safeCoverUrl" fit="contain">
                      <template #error><span class="muted">封面加载失败</span></template>
                    </el-image>
                  </el-form-item>
                  <el-form-item label="会议地点" class="wide"><el-input v-model="contentForm.location" /></el-form-item>
                  <el-form-item label="会议开始时间" required><el-date-picker v-model="contentForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" :clearable="false" /></el-form-item>
                  <el-form-item label="会议结束时间" required><el-date-picker v-model="contentForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" :clearable="false" /></el-form-item>
                  <el-form-item label="报名开始时间"><el-date-picker v-model="contentForm.registrationStartsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item>
                  <el-form-item label="报名截止时间"><el-date-picker v-model="contentForm.registrationEndsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item>
                  <el-form-item label="团体报名"><el-switch v-model="contentForm.groupRegistrationEnabled" aria-label="团体报名" /></el-form-item>
                  <el-form-item label="单笔票数上限">
                    <div class="inline-controls">
                      <el-checkbox v-model="unlimitedTickets">不限</el-checkbox>
                      <el-input-number v-if="!unlimitedTickets" v-model="contentForm.maxTicketsPerOrder" :min="0" :max="2147483647" :precision="0" controls-position="right" aria-label="单笔票数上限" />
                    </div>
                  </el-form-item>
                  <el-form-item label="显示报名人数"><el-switch v-model="contentForm.showRegistrationCount" aria-label="显示报名人数" /></el-form-item>
                  <el-form-item label="显示剩余名额"><el-switch v-model="contentForm.showRemainingSeats" aria-label="显示剩余名额" /></el-form-item>
                </div>
                <el-button v-if="canWriteConference" type="primary" :icon="Check" :loading="saving.conference" @click="saveContent">保存内容</el-button>
              </el-form>
            </el-tab-pane>
            <el-tab-pane label="票种" name="tickets" :disabled="busy">
              <div class="table-toolbar"><span>共 {{ skus.length }} 个票种</span><el-button v-if="canWriteConference" type="primary" :icon="Plus" :disabled="loading.skus || !!errors.skus" @click="openSku()">新增票种</el-button></div>
              <el-alert v-if="errors.skus" :title="errors.skus" type="error" :closable="false" show-icon />
              <el-table v-loading="loading.skus" :data="skus" row-key="id">
                <AdminTableIndex />
                <el-table-column type="expand"><template #default="{ row }">
                  <div class="ticket-details">
                    <p>{{ row.description || '暂无票种说明' }}</p>
                    <p>售票时间：{{ date(row.saleStartAt) }} 至 {{ date(row.saleEndAt) }}</p>
                    <template v-if="row.groupPricingJson">
                      <p>订单最低实付：¥{{ money(row.groupPricingJson.minPayableAmountCent) }}</p>
                      <p v-for="item in row.groupPricingJson.packages || []" :key="'package-' + item.quantity">{{ item.quantity }} 人套餐：¥{{ money(item.totalAmountCent) }}</p>
                      <p v-for="tier in row.groupPricingJson.tiers || []" :key="'tier-' + tier.minQuantity">{{ tier.minQuantity }} 人起：¥{{ money(tier.unitPriceCent) }} / 人</p>
                    </template>
                  </div>
                </template></el-table-column>
                <el-table-column prop="name" label="票种" min-width="170" />
                <el-table-column label="计价" min-width="135"><template #default="{ row }">{{ pricingLabel(row) }}</template></el-table-column>
                <el-table-column label="价格" min-width="155"><template #default="{ row }">{{ skuPrice(row) }}</template></el-table-column>
                <el-table-column prop="stock" label="总库存" width="90" />
                <el-table-column prop="soldCount" label="已售" width="75" />
                <el-table-column prop="lockedStock" label="锁定" width="75" />
                <el-table-column label="状态" width="85"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
                <el-table-column v-if="canWriteConference" label="操作" width="70" fixed="right"><template #default="{ row }"><el-tooltip content="编辑票种"><el-button :icon="Edit" aria-label="编辑票种" @click="openSku(row)" /></el-tooltip></template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane label="报名表单" name="fields" :disabled="busy">
              <div class="table-toolbar"><span>共 {{ fields.length }} 个字段</span><el-button v-if="canWriteConference" type="primary" :icon="Plus" :disabled="loading.fields || !!errors.fields" @click="openField()">新增字段</el-button></div>
              <el-alert v-if="errors.fields" :title="errors.fields" type="error" :closable="false" show-icon />
              <el-table v-loading="loading.fields" :data="fields" row-key="id">
                <AdminTableIndex />
                <el-table-column prop="label" label="字段名称" min-width="145" />
                <el-table-column prop="fieldKey" label="字段标识" min-width="130" />
                <el-table-column label="类型" min-width="100"><template #default="{ row }">{{ fieldTypes[row.type as FormField['type']] }}</template></el-table-column>
                <el-table-column label="选项" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ optionLabels(row.optionsJson) }}</template></el-table-column>
                <el-table-column label="必填" width="70"><template #default="{ row }">{{ row.required ? '是' : '否' }}</template></el-table-column>
                <el-table-column label="启用" width="70"><template #default="{ row }">{{ row.enabled ? '是' : '否' }}</template></el-table-column>
                <el-table-column prop="sortOrder" label="排序" width="70" />
                <el-table-column v-if="canWriteConference" label="操作" width="70" fixed="right"><template #default="{ row }"><el-tooltip content="编辑字段"><el-button :icon="Edit" aria-label="编辑字段" @click="openField(row)" /></el-tooltip></template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane v-if="canViewRegistrations" label="报名名单" name="registrations" :disabled="busy">
              <form class="filter-toolbar" @submit.prevent="searchRegistrations">
                <el-input v-model="registrationFilters.keyword" clearable placeholder="报名号 / 订单号 / 姓名 / 手机号" aria-label="报名关键词" />
                <el-select v-model="registrationFilters.status" clearable placeholder="全部报名状态" aria-label="报名状态"><el-option v-for="status in registrationStatuses" :key="status" :value="status" :label="statusLabel(status)" /></el-select>
                <el-tooltip content="查询报名"><el-button native-type="submit" :icon="Search" aria-label="查询报名" :disabled="loading.registrations" /></el-tooltip>
                <el-tooltip content="重置报名筛选"><el-button :icon="RefreshLeft" aria-label="重置报名筛选" :disabled="loading.registrations" @click="resetRegistrations" /></el-tooltip>
                <el-tooltip v-if="canExport" content="导出当前筛选报名名单"><el-button :icon="Download" aria-label="导出报名名单" :loading="saving.export" :disabled="!registrationApplied || loading.registrations || !!errors.registrations || !registrationPagination.total" @click="exportRegistrations" /></el-tooltip>
              </form>
              <p v-if="registrationApplied" class="filter-summary">当前筛选：{{ registrationFilterSummary }} · 共 {{ registrationPagination.total }} 条</p>
              <el-alert v-if="errors.registrations" :title="errors.registrations" type="error" :closable="false" show-icon />
              <el-table v-loading="loading.registrations" :data="registrations" row-key="id">
                <AdminTableIndex :page="registrationPagination.page" :page-size="registrationPagination.pageSize" />
                <el-table-column prop="registrationNo" label="报名号" min-width="185" />
                <el-table-column prop="attendeeName" label="报名姓名" min-width="105" />
                <el-table-column prop="phone" label="手机号" min-width="130" />
                <el-table-column prop="skuName" label="票种" min-width="130" />
                <el-table-column prop="attendeeCount" label="人数" width="65" />
                <el-table-column label="实付（元）" width="110" align="right"><template #default="{ row }">{{ money(row.paidAmountCent) }}</template></el-table-column>
                <el-table-column label="报名状态" width="100"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
                <el-table-column label="签到" width="100"><template #default="{ row }">{{ row.checkInProgress.checkedIn }} / {{ row.checkInProgress.total }}</template></el-table-column>
                <el-table-column prop="adminRemark" label="备注" min-width="160" show-overflow-tooltip />
                <el-table-column label="报名时间" min-width="170"><template #default="{ row }">{{ date(row.confirmedAt) }}</template></el-table-column>
                <el-table-column label="详情" width="70" fixed="right"><template #default="{ row }"><el-tooltip content="查看报名详情"><el-button :icon="View" aria-label="查看报名详情" @click="openRegistration(row.id)" /></el-tooltip></template></el-table-column>
              </el-table>
              <div class="pagination"><el-pagination v-model:current-page="registrationPagination.page" v-model:page-size="registrationPagination.pageSize" :page-sizes="pageSizes" :total="registrationPagination.total" :disabled="loading.registrations || busy" layout="total, sizes, prev, pager, next" :pager-count="5" @change="loadRegistrations" /></div>
            </el-tab-pane>
            <el-tab-pane v-if="canViewOrders" label="订单" name="orders" :disabled="busy">
              <form class="filter-toolbar" @submit.prevent="searchOrders">
                <el-input v-model="orderFilters.keyword" clearable placeholder="订单号 / 姓名 / 手机号 / 流水号" aria-label="订单关键词" />
                <el-select v-model="orderFilters.status" clearable placeholder="全部订单状态" aria-label="订单状态"><el-option v-for="status in orderStatuses" :key="status" :value="status" :label="statusLabel(status)" /></el-select>
                <el-select v-model="orderFilters.paymentStatus" clearable placeholder="全部支付状态" aria-label="支付状态"><el-option v-for="status in paymentStatuses" :key="status" :value="status" :label="paymentLabel(status)" /></el-select>
                <el-select v-model="orderFilters.skuId" clearable placeholder="全部票种" aria-label="订单票种" :disabled="loading.skus || !!errors.skus"><el-option v-for="sku in skus" :key="sku.id" :value="sku.id" :label="sku.name" /></el-select>
                <el-tooltip content="查询订单"><el-button native-type="submit" :icon="Search" aria-label="查询订单" :disabled="loading.orders" /></el-tooltip>
                <el-tooltip content="重置订单筛选"><el-button :icon="RefreshLeft" aria-label="重置订单筛选" :disabled="loading.orders" @click="resetOrders" /></el-tooltip>
              </form>
              <p v-if="orderApplied" class="filter-summary">当前筛选：{{ orderFilterSummary }}</p>
              <el-alert v-if="errors.orders || errors.skus" :title="errors.orders || errors.skus" type="error" :closable="false" show-icon />
              <dl v-if="orderSummary" class="order-summary">
                <div><dt>订单数</dt><dd>{{ orderSummary.orderCount }}</dd></div>
                <div><dt>已支付订单</dt><dd>{{ orderSummary.paidOrderCount }}</dd></div>
                <div><dt>应付（元）</dt><dd>{{ money(orderSummary.payableAmountCent) }}</dd></div>
                <div><dt>优惠（元）</dt><dd>{{ money(orderSummary.discountAmountCent) }}</dd></div>
                <div><dt>实付（元）</dt><dd>{{ money(orderSummary.paidAmountCent) }}</dd></div>
                <div><dt>已退（元）</dt><dd>{{ money(orderSummary.refundedAmountCent) }}</dd></div>
                <div><dt>净实收（元）</dt><dd>{{ money(orderSummary.netPaidAmountCent) }}</dd></div>
              </dl>
              <el-table v-loading="loading.orders" :data="orders" row-key="orderNo">
                <AdminTableIndex :page="orderPagination.page" :page-size="orderPagination.pageSize" />
                <el-table-column prop="orderNo" label="订单号" min-width="195" />
                <el-table-column prop="attendeeName" label="报名姓名" min-width="105" />
                <el-table-column prop="phone" label="手机号" min-width="130" />
                <el-table-column label="票种 / 数量" min-width="180"><template #default="{ row }"><div v-for="item in row.items" :key="item.id">{{ item.skuName }} × {{ item.quantity }}</div></template></el-table-column>
                <el-table-column label="收款主体" min-width="160"><template #default="{ row }">{{ paymentCompany(row) }}</template></el-table-column>
                <el-table-column label="原价（元）" width="110" align="right"><template #default="{ row }">{{ money(row.originAmountCent) }}</template></el-table-column>
                <el-table-column label="优惠（元）" width="110" align="right"><template #default="{ row }">{{ money(row.discountAmountCent) }}</template></el-table-column>
                <el-table-column label="应付（元）" width="110" align="right"><template #default="{ row }">{{ money(row.payableAmountCent) }}</template></el-table-column>
                <el-table-column label="实付（元）" width="110" align="right"><template #default="{ row }">{{ money(row.paidAmountCent) }}</template></el-table-column>
                <el-table-column label="已退（元）" width="110" align="right"><template #default="{ row }">{{ money(row.refundedAmountCent) }}</template></el-table-column>
                <el-table-column label="订单状态" width="100"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
                <el-table-column label="最新支付状态" width="125"><template #default="{ row }">{{ paymentLabel(row.paymentStatus) }}</template></el-table-column>
                <el-table-column label="下单时间" min-width="170"><template #default="{ row }">{{ date(row.createdAt) }}</template></el-table-column>
                <el-table-column label="详情" width="70" fixed="right"><template #default="{ row }"><el-tooltip content="查看订单详情"><el-button :icon="View" aria-label="查看订单详情" @click="openOrder(row.orderNo)" /></el-tooltip></template></el-table-column>
              </el-table>
              <div class="pagination"><el-pagination v-model:current-page="orderPagination.page" v-model:page-size="orderPagination.pageSize" :page-sizes="pageSizes" :total="orderPagination.total" :disabled="loading.orders || busy" layout="total, sizes, prev, pager, next" :pager-count="5" @change="loadOrders" /></div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </section>
    </main>

    <el-dialog v-model="skuVisible" :title="skuForm.id ? '编辑票种' : '新增票种'" width="min(700px, 94vw)" class="scoped-dialog"
      destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!saving.sku" :show-close="!saving.sku">
      <el-alert v-if="errors.skuSave" :title="errors.skuSave" type="error" :closable="false" show-icon />
      <el-form label-position="top" :disabled="saving.sku || !canWriteConference" @submit.prevent>
        <el-form-item label="票种名称" required><el-input v-model="skuForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="skuForm.description" type="textarea" :rows="2" /></el-form-item>
        <GroupTicketPricingEditor v-if="skuVisible && conference" ref="pricingEditor" :price-cent="skuForm.priceCent"
          :model-value="skuForm.groupPricingJson" :group-registration-enabled="conference.groupRegistrationEnabled"
          :max-tickets-per-order="conference.maxTicketsPerOrder" :disabled="saving.sku || !canWriteConference"
          @configure-conference="configureGroup" />
        <div class="form-grid">
          <el-form-item label="总库存" required><el-input-number v-model="skuForm.stock" :min="skuForm.allocatedStock" :max="2147483647" :precision="0" controls-position="right" /></el-form-item>
          <el-form-item label="排序"><el-input-number v-model="skuForm.sortOrder" :min="0" :max="2147483647" :precision="0" controls-position="right" /></el-form-item>
          <el-form-item label="开售时间"><el-date-picker v-model="skuForm.saleStartAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item>
          <el-form-item label="停售时间"><el-date-picker v-model="skuForm.saleEndAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item>
          <el-form-item label="在售"><el-switch v-model="skuForm.status" active-value="ACTIVE" inactive-value="INACTIVE" aria-label="票种在售" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button :disabled="saving.sku" @click="skuVisible = false">取消</el-button><el-button v-if="canWriteConference" type="primary" :icon="Check" :loading="saving.sku" @click="saveSku">保存票种</el-button></template>
    </el-dialog>

    <el-dialog v-model="fieldVisible" :title="fieldForm.id ? '编辑报名字段' : '新增报名字段'" width="min(700px, 94vw)" class="scoped-dialog"
      destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!saving.field" :show-close="!saving.field">
      <el-alert v-if="errors.fieldSave" :title="errors.fieldSave" type="error" :closable="false" show-icon />
      <el-form label-position="top" :disabled="saving.field || !canWriteConference" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="字段名称" required><el-input v-model="fieldForm.label" /></el-form-item>
          <el-form-item label="字段标识" required><el-input v-model="fieldForm.fieldKey" :disabled="!!fieldForm.id" /></el-form-item>
          <el-form-item label="类型" required><el-select v-model="fieldForm.type"><el-option v-for="(label, value) in fieldTypes" :key="value" :value="value" :label="label" /></el-select></el-form-item>
          <el-form-item label="排序"><el-input-number v-model="fieldForm.sortOrder" :min="0" :max="2147483647" :precision="0" controls-position="right" /></el-form-item>
          <el-form-item label="占位提示" class="wide"><el-input v-model="fieldForm.placeholder" /></el-form-item>
          <el-form-item label="必填"><el-switch v-model="fieldForm.required" aria-label="字段必填" /></el-form-item>
          <el-form-item label="启用"><el-switch v-model="fieldForm.enabled" aria-label="字段启用" /></el-form-item>
        </div>
        <template v-if="isOptionField">
          <div class="table-toolbar"><strong>选项</strong><el-button :icon="Plus" @click="addOption">添加选项</el-button></div>
          <div v-for="(option, index) in fieldOptions" :key="index" class="option-row">
            <el-form-item :label="'选项 ' + (index + 1) + ' 名称'"><el-input v-model="option.label" /></el-form-item>
            <el-form-item label="值"><el-input v-model="option.value" /></el-form-item>
          </div>
        </template>
        <el-form-item label="校验规则（JSON）"><el-input v-model="fieldForm.validationText" type="textarea" :rows="4" spellcheck="false" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving.field" @click="fieldVisible = false">取消</el-button><el-button v-if="canWriteConference" type="primary" :icon="Check" :loading="saving.field" @click="saveField">保存字段</el-button></template>
    </el-dialog>

    <el-dialog v-model="registrationVisible" title="报名详情" width="min(1040px, 96vw)" class="scoped-dialog"
      :close-on-click-modal="false" :close-on-press-escape="!saving.remark && !checkingIn" :show-close="!saving.remark && !checkingIn"
      @closed="closeRegistration">
      <div v-if="loading.registrationDetail" v-loading="true" class="loading-area" />
      <el-alert v-if="errors.registrationDetail" :title="errors.registrationDetail" type="error" :closable="false" show-icon>
        <el-button v-if="!registrationDetail && registrationDetailId" @click="openRegistration(registrationDetailId)">重试</el-button>
      </el-alert>
      <template v-if="registrationDetail">
        <dl class="detail-facts">
          <div><dt>报名号</dt><dd>{{ registrationDetail.registrationNo }}</dd></div>
          <div><dt>会议</dt><dd>{{ registrationDetail.conferenceTitle }}</dd></div>
          <div><dt>订单号</dt><dd>{{ registrationDetail.orderNo }}</dd></div>
          <div><dt>报名状态</dt><dd>{{ statusLabel(registrationDetail.status) }}</dd></div>
          <div><dt>实付（元）</dt><dd>{{ money(registrationDetail.paidAmountCent) }}</dd></div>
          <div><dt>报名时间</dt><dd>{{ date(registrationDetail.confirmedAt) }}</dd></div>
        </dl>
        <h3>参会人</h3>
        <el-empty v-if="!registrationDetail.attendees.length" description="暂无参会人信息" :image-size="48" />
        <section v-for="(attendee, index) in registrationDetail.attendees" :key="attendee.id" class="attendee-section">
          <div class="table-toolbar">
            <strong>{{ index + 1 }}. {{ attendee.name || '未填写姓名' }} · {{ attendee.skuName }}</strong>
            <span>{{ checkInLabel(attendee.checkInStatus) }}<template v-if="attendee.checkedInAt"> · {{ date(attendee.checkedInAt) }}</template></span>
            <el-tooltip v-if="canCheckIn" :content="canCheckInAttendee(attendee) ? '确认该参会人到场' : '仅已支付且待签到的参会人可签到'">
              <el-button :icon="CircleCheck" :loading="checkingIn === attendee.id" :disabled="!canCheckInAttendee(attendee) || !!checkingIn || saving.remark" @click="checkIn(attendee)">签到</el-button>
            </el-tooltip>
          </div>
          <dl class="detail-facts">
            <div><dt>手机号</dt><dd>{{ attendee.phone || '-' }}</dd></div>
            <div><dt>单位</dt><dd>{{ attendee.company || '-' }}</dd></div>
            <div><dt>职位</dt><dd>{{ attendee.title || '-' }}</dd></div>
          </dl>
          <dl v-if="submittedRows(attendee.formDataJson, { fields: registrationDetail.formFields }).length" class="submitted-fields">
            <div v-for="entry in submittedRows(attendee.formDataJson, { fields: registrationDetail.formFields })" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
          </dl>
          <p v-else class="muted">暂无该参会人单独提交的表单资料</p>
        </section>
        <h3>报名提交资料</h3>
        <dl class="submitted-fields">
          <div v-for="entry in submittedRows(registrationDetail.formDataJson, { fields: registrationDetail.formFields })" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
        </dl>
        <h3>后台备注</h3>
        <el-input v-model="remark" type="textarea" :rows="3" maxlength="2000" show-word-limit :disabled="!canWriteRegistration || saving.remark || !!checkingIn" aria-label="后台备注" />
        <div class="remark-footer">
          <span class="muted">{{ registrationDetail.remarkUpdatedAt ? '更新于 ' + date(registrationDetail.remarkUpdatedAt) : '' }}</span>
          <el-button v-if="canWriteRegistration" type="primary" :icon="Check" :loading="saving.remark" :disabled="!!checkingIn" @click="saveRemark">保存备注</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="orderVisible" title="订单详情" width="min(1040px, 96vw)" class="scoped-dialog" @closed="closeOrder">
      <div v-if="loading.orderDetail" v-loading="true" class="loading-area" />
      <el-alert v-if="errors.orderDetail" :title="errors.orderDetail" type="error" :closable="false" show-icon><el-button v-if="orderDetailNo" @click="openOrder(orderDetailNo)">重试</el-button></el-alert>
      <template v-if="orderDetail">
        <dl class="detail-facts">
          <div><dt>订单号</dt><dd>{{ orderDetail.orderNo }}</dd></div>
          <div><dt>会议</dt><dd>{{ orderDetail.conferenceTitle }}</dd></div>
          <div><dt>收款主体</dt><dd>{{ paymentCompany(orderDetail) }}</dd></div>
          <div><dt>订单状态</dt><dd>{{ statusLabel(orderDetail.status) }}</dd></div>
          <div><dt>最新支付状态</dt><dd>{{ paymentLabel(orderDetail.paymentStatus) }}</dd></div>
          <div><dt>报名姓名</dt><dd>{{ orderDetail.attendeeName || '-' }}</dd></div>
          <div><dt>手机号</dt><dd>{{ orderDetail.phone || '-' }}</dd></div>
          <div><dt>下单时间</dt><dd>{{ date(orderDetail.createdAt) }}</dd></div>
          <div><dt>支付时间</dt><dd>{{ date(orderDetail.paidAt) }}</dd></div>
          <div><dt>原价（元）</dt><dd>{{ money(orderDetail.originAmountCent) }}</dd></div>
          <div><dt>优惠（元）</dt><dd>{{ money(orderDetail.discountAmountCent) }}</dd></div>
          <div><dt>应付（元）</dt><dd>{{ money(orderDetail.payableAmountCent) }}</dd></div>
          <div><dt>实付（元）</dt><dd>{{ money(orderDetail.paidAmountCent) }}</dd></div>
          <div><dt>已退（元）</dt><dd>{{ money(orderDetail.refundedAmountCent) }}</dd></div>
          <div><dt>报名号</dt><dd>{{ orderDetail.registration?.registrationNo || '-' }}</dd></div>
        </dl>
        <h3>票种明细</h3>
        <el-table :data="orderDetail.items">
          <AdminTableIndex />
          <el-table-column prop="skuName" label="票种" min-width="150" />
          <el-table-column prop="quantity" label="人数" width="80" />
          <el-table-column label="单价（元）" min-width="130" align="right"><template #default="{ row }">{{ row.pricingMode === 'PACKAGE' ? '固定人数套餐' : money(row.unitPriceCent) }}</template></el-table-column>
          <el-table-column label="合计（元）" min-width="120" align="right"><template #default="{ row }">{{ money(row.totalAmountCent) }}</template></el-table-column>
        </el-table>
        <h3>支付流水</h3>
        <el-table :data="orderDetail.payments">
          <AdminTableIndex />
          <el-table-column label="渠道" width="100"><template #default="{ row }">{{ row.provider === 'WECHAT' ? '微信支付' : row.provider === 'MOCK' ? '模拟支付' : row.provider }}</template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }">{{ paymentLabel(row.status) }}</template></el-table-column>
          <el-table-column prop="outTradeNo" label="商户单号" min-width="190" />
          <el-table-column prop="transactionId" label="支付流水号" min-width="210" />
          <el-table-column label="金额（元）" width="120" align="right"><template #default="{ row }">{{ money(row.amountCent) }}</template></el-table-column>
          <el-table-column label="支付时间" min-width="170"><template #default="{ row }">{{ date(row.paidAt) }}</template></el-table-column>
        </el-table>
        <template v-if="canViewRegistrations && orderDetail.submittedFormJson">
          <h3>原始提交资料</h3>
          <dl class="submitted-fields"><div v-for="entry in submittedRows(orderDetail.submittedFormJson, orderDetail.registrationSnapshotJson)" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div></dl>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Check, CircleCheck, Download, Edit, Plus, Refresh, RefreshLeft, Search, SwitchButton, View } from "@element-plus/icons-vue";
import type { GroupTicketPricing } from "@conference/shared";
import GroupTicketPricingEditor from "../../components/conference/GroupTicketPricingEditor.vue";
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import { useAdminSession } from "../../stores/admin-session";
import { conferenceWorkspace as api, WorkspaceRequestError } from "../../services/conference-workspace";
import type { ConferenceContentInput, OrderFilters, RegistrationFilters, ScopedConferenceSummary, WorkspaceFieldInput, WorkspaceOrder, WorkspaceOrderDetail, WorkspaceRegistration, WorkspaceRegistrationDetail } from "../../services/conference-workspace";
import type { AdminOrderSummary, AdminRegistrationAttendee, Conference, FormField, Sku } from "../../services/types";

const session = useAdminSession();
const canViewConference = computed(() => session.hasPermission("conference:view"));
const canWriteConference = computed(() => canViewConference.value && session.hasPermission("conference:write"));
const canViewRegistrations = computed(() => session.hasPermission("registration:view"));
const canWriteRegistration = computed(() => canViewRegistrations.value && session.hasPermission("registration:write"));
const canExport = computed(() => canViewRegistrations.value && session.hasPermission("registration:export"));
const canCheckIn = computed(() => canViewRegistrations.value && session.hasPermission("checkin:write"));
const canViewOrders = computed(() => session.hasPermission("order:view"));
const pageSizes = [10, 20, 50, 100];
const registrationStatuses = ["CONFIRMED", "CANCELLED", "REFUNDED"];
const orderStatuses = ["PENDING", "PAID", "CANCELLED", "CLOSED", "REFUNDED"];
const paymentStatuses = ["PENDING", "SUCCESS", "FAILED", "CLOSED"];
const fieldTypes: Record<FormField["type"], string> = {
  TEXT: "单行文本", TEXTAREA: "多行文本", PHONE: "手机号", EMAIL: "邮箱",
  SELECT: "下拉选择", RADIO: "单选", CHECKBOX: "多选", DATE: "日期"
};
const loading = reactive({ conferences: false, conference: false, skus: false, fields: false, registrations: false, orders: false, registrationDetail: false, orderDetail: false });
const saving = reactive({ conference: false, sku: false, field: false, remark: false, export: false });
const errors = reactive({ conferences: "", conference: "", basic: "", skus: "", fields: "", registrations: "", orders: "", registrationDetail: "", orderDetail: "", skuSave: "", fieldSave: "" });
const checkingIn = ref("");
const busy = computed(() => Object.values(saving).some(Boolean) || !!checkingIn.value);
const versions = { conferences: 0, selection: 0, skus: 0, fields: 0, registrations: 0, orders: 0, registrationDetail: 0, orderDetail: 0 };
let alive = true;
const conferences = ref<ScopedConferenceSummary[]>([]);
const authorizedCount = ref<number | null>(null);
const conferenceSearch = ref("");
const conferenceKeyword = ref("");
const conferencePagination = reactive({ page: 1, total: 0 });
const selectedId = ref("");
const conference = ref<Conference | null>(null);
const activeTab = ref("basic");
const skus = ref<Sku[]>([]);
const fields = ref<FormField[]>([]);
const contentForm = reactive({
  title: "", slug: "", subtitle: "", coverImage: "", location: "", startAt: "", endAt: "",
  registrationStartsAt: "", registrationEndsAt: "", groupRegistrationEnabled: true,
  maxTicketsPerOrder: 1, showRegistrationCount: false, showRemainingSeats: false
});
const unlimitedTickets = ref(true);
const safeCoverUrl = computed(() => isHttpUrl(contentForm.coverImage) ? contentForm.coverImage.trim() : "");
const skuVisible = ref(false);
const pricingEditor = ref<InstanceType<typeof GroupTicketPricingEditor>>();
const skuForm = reactive({
  id: "", name: "", description: "", priceCent: 0, groupPricingJson: null as GroupTicketPricing | null,
  stock: 0, allocatedStock: 0, status: "ACTIVE" as Sku["status"], sortOrder: 0, saleStartAt: "", saleEndAt: ""
});
const fieldVisible = ref(false);
const fieldForm = reactive({ id: "", label: "", fieldKey: "", type: "TEXT" as FormField["type"], required: false, placeholder: "", sortOrder: 0, enabled: true, validationText: "{}" });
type OptionDraft = { label: string; value: string; original?: unknown };
const fieldOptions = ref<OptionDraft[]>([]);
const isOptionField = computed(() => ["SELECT", "RADIO", "CHECKBOX"].includes(fieldForm.type));
const registrations = ref<WorkspaceRegistration[]>([]);
const registrationFilters = reactive({ keyword: "", status: "" });
const registrationQuery = reactive({ keyword: "", status: "" });
const registrationApplied = ref<RegistrationFilters | null>(null);
const registrationPagination = reactive({ page: 1, pageSize: 20, total: 0 });
const registrationVisible = ref(false);
const registrationDetailId = ref("");
const registrationDetail = ref<WorkspaceRegistrationDetail | null>(null);
const remark = ref("");
const orders = ref<WorkspaceOrder[]>([]);
const orderFilters = reactive({ keyword: "", status: "", paymentStatus: "", skuId: "" });
const orderQuery = reactive({ keyword: "", status: "", paymentStatus: "", skuId: "" });
const orderApplied = ref<OrderFilters | null>(null);
const orderPagination = reactive({ page: 1, pageSize: 20, total: 0 });
const orderSummary = ref<AdminOrderSummary | null>(null);
const orderVisible = ref(false);
const orderDetailNo = ref("");
const orderDetail = ref<WorkspaceOrderDetail | null>(null);
const registrationFilterSummary = computed(() => filterText(registrationApplied.value));
const orderFilterSummary = computed(() => {
  const query = orderApplied.value;
  return [filterText(query), query?.paymentStatus ? "支付流水：" + paymentLabel(query.paymentStatus) : "全部支付状态",
    query?.skuId ? "票种：" + (skus.value.find(sku => sku.id === query.skuId)?.name || query.skuId) : "全部票种"].join(" · ");
});

function errorMessage(error: unknown): string {
  if (error instanceof WorkspaceRequestError && error.status === 401) session.logout();
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}
function current(id: string, version: number, key: keyof typeof versions): boolean {
  return alive && selectedId.value === id && versions[key] === version;
}
function filterText(query: RegistrationFilters | null): string {
  if (!query) return "";
  return [query.keyword ? "关键词：" + query.keyword : "全部关键词", query.status ? statusLabel(query.status) : "全部状态"].join(" · ");
}
function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const amount = Math.abs(value);
  return (value < 0 ? "-" : "") + Math.trunc(amount / 100).toLocaleString("zh-CN") + "." + String(amount % 100).padStart(2, "0");
}
function date(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString("zh-CN", { hour12: false });
}
function statusLabel(status: string): string {
  const labels: Record<string, string> = { DRAFT: "草稿", PUBLISHED: "已发布", CLOSED: "已关闭", ARCHIVED: "已归档", ACTIVE: "在售", INACTIVE: "停售", CONFIRMED: "已确认", CANCELLED: "已取消", REFUNDED: "已退款", PAID: "已支付", PENDING: "待支付" };
  return labels[status] || status;
}
function paymentLabel(status: string | null): string {
  return ({ PENDING: "待支付", SUCCESS: "支付成功", FAILED: "支付失败", CLOSED: "已关闭" } as Record<string, string>)[status || ""] || status || "未发起支付";
}
function paymentCompany(order: WorkspaceOrder): string {
  return "paymentCompanyName" in order && typeof order.paymentCompanyName === "string" && order.paymentCompanyName ? order.paymentCompanyName : "-";
}
function checkInLabel(status: string): string {
  return ({ PENDING: "待签到", CHECKED_IN: "已签到", NOT_REQUIRED: "无需签到", CANCELLED: "已取消" } as Record<string, string>)[status] || status;
}
function pricingLabel(row: Sku): string {
  return row.groupPricingJson?.mode === "PACKAGE" ? "固定人数套餐" : row.groupPricingJson ? "团体票 · " + row.groupPricingJson.minQuantity + " 人起" : "普通票";
}
function skuPrice(row: Sku): string {
  if (row.groupPricingJson?.mode === "PACKAGE") {
    const first = row.groupPricingJson.packages?.[0];
    return first ? first.quantity + " 人 / ¥" + money(first.totalAmountCent) : "-";
  }
  return "¥" + money(row.priceCent) + (row.groupPricingJson ? " / 人" : "");
}
function isHttpUrl(value: string): boolean {
  try { return ["https:", "http:"].includes(new URL(value.trim()).protocol); } catch { return false; }
}
function integer(value: number, label: string, minimum = 0, maximum = 2147483647): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(label + "须为 " + minimum + " 至 " + maximum + " 的整数");
}
function validDates(start: string, end: string, label: string, required = false, paired = true): void {
  if (required && (!start || !end)) throw new Error("请完整填写" + label);
  if (paired && Boolean(start) !== Boolean(end)) throw new Error(label + "请同时填写或同时留空");
  if ([start, end].some(value => value && Number.isNaN(new Date(value).getTime()))) throw new Error(label + "格式不正确");
  if (start && end && new Date(start) >= new Date(end)) throw new Error(label + "的开始时间必须早于结束时间");
}
function fillContent(value: Conference): void {
  Object.assign(contentForm, { title: value.title, slug: value.slug, subtitle: value.subtitle || "", coverImage: value.coverImage || "", location: value.location || "",
    startAt: value.startAt, endAt: value.endAt, registrationStartsAt: value.registrationStartsAt || "", registrationEndsAt: value.registrationEndsAt || "",
    groupRegistrationEnabled: value.groupRegistrationEnabled, maxTicketsPerOrder: value.maxTicketsPerOrder ?? 1,
    showRegistrationCount: value.showRegistrationCount ?? false, showRemainingSeats: value.showRemainingSeats ?? false });
  unlimitedTickets.value = value.maxTicketsPerOrder === null;
}

async function loadConferences(): Promise<void> {
  if (!canViewConference.value) return;
  const version = ++versions.conferences;
  const query = { page: conferencePagination.page, pageSize: 10, keyword: conferenceKeyword.value };
  loading.conferences = true;
  errors.conferences = "";
  try {
    const result = await api.conferences(query);
    if (!alive || version !== versions.conferences) return;
    conferencePagination.total = result.total;
    if (!query.keyword) authorizedCount.value = result.total;
    if (!result.items.length && result.total && query.page > 1) {
      conferencePagination.page = Math.ceil(result.total / 10);
      return await loadConferences();
    }
    conferences.value = result.items;
    if (!selectedId.value && result.items[0]) void selectConference(result.items[0].id);
  } catch (error) {
    if (!alive || version !== versions.conferences) return;
    conferences.value = [];
    errors.conferences = errorMessage(error);
  } finally {
    if (alive && version === versions.conferences) loading.conferences = false;
  }
}
function searchConferences(): void {
  if (busy.value) return;
  conferenceKeyword.value = conferenceSearch.value.trim();
  conferencePagination.page = 1;
  void loadConferences();
}
async function selectConference(id: string): Promise<void> {
  if (busy.value || !canViewConference.value) return;
  selectedId.value = id;
  const version = ++versions.selection;
  for (const key of ["skus", "fields", "registrations", "orders", "registrationDetail", "orderDetail"] as const) versions[key]++;
  Object.keys(errors).forEach(key => { errors[key as keyof typeof errors] = ""; });
  conference.value = null;
  skus.value = [];
  fields.value = [];
  registrations.value = [];
  orders.value = [];
  registrationApplied.value = null;
  orderApplied.value = null;
  orderSummary.value = null;
  Object.assign(registrationFilters, { keyword: "", status: "" });
  Object.assign(registrationQuery, registrationFilters);
  Object.assign(orderFilters, { keyword: "", status: "", paymentStatus: "", skuId: "" });
  Object.assign(orderQuery, orderFilters);
  registrationPagination.page = orderPagination.page = 1;
  registrationPagination.total = orderPagination.total = 0;
  skuVisible.value = fieldVisible.value = registrationVisible.value = orderVisible.value = false;
  registrationDetail.value = null;
  orderDetail.value = null;
  loading.conference = true;
  try {
    const result = await api.conference(id);
    if (!current(id, version, "selection")) return;
    conference.value = result;
    fillContent(result);
    await loadTab();
  } catch (error) {
    if (current(id, version, "selection")) errors.conference = errorMessage(error);
  } finally {
    if (current(id, version, "selection")) loading.conference = false;
  }
}
async function loadCatalog(kind: "skus" | "fields"): Promise<void> {
  if (!selectedId.value || !canViewConference.value) return;
  const id = selectedId.value;
  const version = ++versions[kind];
  loading[kind] = true;
  errors[kind] = "";
  try {
    if (kind === "skus") {
      const result = await api.skus(id);
      if (current(id, version, kind)) skus.value = result.items;
    } else {
      const result = await api.fields(id);
      if (current(id, version, kind)) fields.value = result.items;
    }
  } catch (error) {
    if (!current(id, version, kind)) return;
    if (kind === "skus") skus.value = []; else fields.value = [];
    errors[kind] = errorMessage(error);
  } finally {
    if (current(id, version, kind)) loading[kind] = false;
  }
}
async function loadTab(): Promise<void> {
  if (!conference.value || !canViewConference.value) return;
  if (activeTab.value === "tickets") await loadCatalog("skus");
  if (activeTab.value === "fields") await loadCatalog("fields");
  if (activeTab.value === "registrations" && canViewRegistrations.value) {
    void loadCatalog("fields");
    await loadRegistrations();
  }
  if (activeTab.value === "orders" && canViewOrders.value) {
    void loadCatalog("skus");
    await loadOrders();
  }
}
function refreshTab(): void {
  if (busy.value) return;
  if (!conference.value || activeTab.value === "basic") void selectConference(selectedId.value);
  else void loadTab();
}
async function saveContent(): Promise<void> {
  if (!canWriteConference.value || saving.conference || !conference.value) return;
  errors.basic = "";
  try {
    if (!contentForm.title.trim()) throw new Error("会议名称必填");
    if (contentForm.coverImage.trim() && !isHttpUrl(contentForm.coverImage)) throw new Error("封面须为有效的 HTTP 或 HTTPS 图片 URL");
    validDates(contentForm.startAt, contentForm.endAt, "会议时间", true);
    validDates(contentForm.registrationStartsAt, contentForm.registrationEndsAt, "报名时间");
    if (!unlimitedTickets.value) integer(contentForm.maxTicketsPerOrder, "单笔票数上限");
    const payload: ConferenceContentInput = {
      title: contentForm.title.trim(), subtitle: contentForm.subtitle,
      coverImage: contentForm.coverImage.trim(), location: contentForm.location,
      startAt: contentForm.startAt, endAt: contentForm.endAt,
      registrationStartsAt: contentForm.registrationStartsAt || null, registrationEndsAt: contentForm.registrationEndsAt || null,
      groupRegistrationEnabled: contentForm.groupRegistrationEnabled,
      maxTicketsPerOrder: unlimitedTickets.value ? null : contentForm.maxTicketsPerOrder,
      showRegistrationCount: contentForm.showRegistrationCount, showRemainingSeats: contentForm.showRemainingSeats
    };
    saving.conference = true;
    const id = selectedId.value;
    const result = await api.saveConference(id, payload);
    if (!alive || selectedId.value !== id) return;
    conference.value = result;
    fillContent(result);
    const item = conferences.value.find(item => item.id === id);
    if (item) Object.assign(item, { title: result.title, startsAt: result.startAt, endsAt: result.endAt, location: result.location });
    ElMessage.success("会议内容已保存");
  } catch (error) { errors.basic = errorMessage(error); }
  finally { saving.conference = false; }
}
function openSku(row?: Sku): void {
  if (!canWriteConference.value || busy.value) return;
  errors.skuSave = "";
  Object.assign(skuForm, row ? {
    id: row.id, name: row.name, description: row.description || "", priceCent: row.priceCent,
    groupPricingJson: row.groupPricingJson ? JSON.parse(JSON.stringify(row.groupPricingJson)) : null,
    stock: row.stock, allocatedStock: row.soldCount + row.lockedStock, status: row.status,
    sortOrder: row.sortOrder, saleStartAt: row.saleStartAt || "", saleEndAt: row.saleEndAt || ""
  } : { id: "", name: "", description: "", priceCent: 0, groupPricingJson: null, stock: 0, allocatedStock: 0, status: "ACTIVE", sortOrder: 0, saleStartAt: "", saleEndAt: "" });
  skuVisible.value = true;
}
function configureGroup(): void {
  if (saving.sku) return;
  skuVisible.value = false;
  activeTab.value = "basic";
}
async function saveSku(): Promise<void> {
  if (!canWriteConference.value || saving.sku || !selectedId.value) return;
  errors.skuSave = "";
  try {
    if (!skuForm.name.trim()) throw new Error("请填写票种名称");
    const pricing = pricingEditor.value?.validate();
    if (!pricing) throw new Error("请检查价格及团体票规则");
    integer(skuForm.stock, "总库存", skuForm.allocatedStock);
    integer(skuForm.sortOrder, "排序");
    validDates(skuForm.saleStartAt, skuForm.saleEndAt, "售票时间", false, false);
    const payload = { name: skuForm.name.trim(), description: skuForm.description, ...pricing, stock: skuForm.stock, status: skuForm.status, sortOrder: skuForm.sortOrder, saleStartAt: skuForm.saleStartAt || null, saleEndAt: skuForm.saleEndAt || null };
    saving.sku = true;
    if (skuForm.id) await api.saveSku(skuForm.id, payload); else await api.createSku(selectedId.value, payload);
    skuVisible.value = false;
    ElMessage.success("票种已保存");
    await loadCatalog("skus");
    if (errors.skus) ElMessage.warning("票种已保存，列表刷新失败，请刷新列表，勿重复创建");
  } catch (error) { errors.skuSave = errorMessage(error); }
  finally { saving.sku = false; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function optionLabels(options: unknown[] | null): string {
  return (options || []).map(option => typeof option === "string" ? option : isRecord(option) ? String(option.label ?? option.value ?? "") : String(option)).join(" / ") || "-";
}
function openField(row?: FormField): void {
  if (!canWriteConference.value || busy.value) return;
  errors.fieldSave = "";
  Object.assign(fieldForm, row ? {
    id: row.id, label: row.label, fieldKey: row.fieldKey, type: row.type, required: row.required,
    placeholder: row.placeholder || "", sortOrder: row.sortOrder, enabled: row.enabled,
    validationText: JSON.stringify(row.validationJson || {}, null, 2)
  } : { id: "", label: "", fieldKey: "", type: "TEXT", required: false, placeholder: "", sortOrder: 0, enabled: true, validationText: "{}" });
  fieldOptions.value = (row?.optionsJson || []).map(option => ({
    label: typeof option === "string" ? option : isRecord(option) ? String(option.label ?? option.value ?? "") : "",
    value: typeof option === "string" ? option : isRecord(option) ? String(option.value ?? option.label ?? "") : "",
    original: option
  }));
  fieldVisible.value = true;
}
function addOption(): void { fieldOptions.value.push({ label: "", value: "" }); }
async function saveField(): Promise<void> {
  if (!canWriteConference.value || saving.field || !selectedId.value) return;
  errors.fieldSave = "";
  try {
    if (!fieldForm.label.trim() || !fieldForm.fieldKey.trim()) throw new Error("字段名称和字段标识必填");
    integer(fieldForm.sortOrder, "排序");
    let validation: unknown;
    try { validation = JSON.parse(fieldForm.validationText || "{}"); } catch { throw new Error("校验规则须为有效的 JSON 对象"); }
    if (!isRecord(validation)) throw new Error("校验规则须为 JSON 对象");
    const values = new Set<string>();
    const options = isOptionField.value ? fieldOptions.value.map(option => {
      const label = option.label.trim();
      const value = option.value.trim();
      if (!label || !value) throw new Error("每个选项的名称和值均为必填");
      if (values.has(value)) throw new Error("选项值不能重复");
      values.add(value);
      if (typeof option.original === "string" && label === value) return value;
      return { ...(isRecord(option.original) ? option.original : {}), label, value };
    }) : [];
    if (isOptionField.value && !options.length) throw new Error("下拉、单选、多选字段至少需要一个选项");
    const payload: WorkspaceFieldInput = { fieldKey: fieldForm.fieldKey.trim(), label: fieldForm.label.trim(), type: fieldForm.type, required: fieldForm.required,
      placeholder: fieldForm.placeholder, sortOrder: fieldForm.sortOrder, enabled: fieldForm.enabled, optionsJson: options, validationJson: validation };
    saving.field = true;
    if (fieldForm.id) await api.saveField(fieldForm.id, payload); else await api.createField(selectedId.value, payload);
    fieldVisible.value = false;
    ElMessage.success("报名字段已保存");
    await loadCatalog("fields");
    if (errors.fields) ElMessage.warning("字段已保存，列表刷新失败，请刷新列表，勿重复创建");
  } catch (error) { errors.fieldSave = errorMessage(error); }
  finally { saving.field = false; }
}

async function loadRegistrations(): Promise<void> {
  if (!selectedId.value || !canViewRegistrations.value || !canViewConference.value) return;
  const id = selectedId.value;
  const version = ++versions.registrations;
  const query = { conferenceId: id, ...registrationQuery, page: registrationPagination.page, pageSize: registrationPagination.pageSize };
  loading.registrations = true;
  errors.registrations = "";
  registrations.value = [];
  registrationApplied.value = null;
  try {
    const result = await api.registrations(query);
    if (!current(id, version, "registrations")) return;
    registrationPagination.total = result.total;
    if (!result.items.length && result.total && query.page > 1) {
      registrationPagination.page = Math.ceil(result.total / query.pageSize);
      return await loadRegistrations();
    }
    registrations.value = result.items;
    registrationApplied.value = { conferenceId: id, keyword: query.keyword, status: query.status };
  } catch (error) {
    if (current(id, version, "registrations")) { errors.registrations = errorMessage(error); registrationPagination.total = 0; }
  } finally { if (current(id, version, "registrations")) loading.registrations = false; }
}
function searchRegistrations(): void {
  Object.assign(registrationQuery, { keyword: registrationFilters.keyword.trim(), status: registrationFilters.status });
  registrationPagination.page = 1;
  void loadRegistrations();
}
function resetRegistrations(): void {
  Object.assign(registrationFilters, { keyword: "", status: "" });
  searchRegistrations();
}
async function loadOrders(): Promise<void> {
  if (!selectedId.value || !canViewOrders.value || !canViewConference.value) return;
  const id = selectedId.value;
  const version = ++versions.orders;
  const query = { conferenceId: id, ...orderQuery, page: orderPagination.page, pageSize: orderPagination.pageSize };
  loading.orders = true;
  errors.orders = "";
  orders.value = [];
  orderSummary.value = null;
  orderApplied.value = null;
  try {
    const result = await api.orders(query);
    if (!current(id, version, "orders")) return;
    orderPagination.total = result.total;
    if (!result.items.length && result.total && query.page > 1) {
      orderPagination.page = Math.ceil(result.total / query.pageSize);
      return await loadOrders();
    }
    orders.value = result.items;
    orderSummary.value = result.summary;
    orderApplied.value = { conferenceId: id, keyword: query.keyword, status: query.status, paymentStatus: query.paymentStatus, skuId: query.skuId };
  } catch (error) {
    if (current(id, version, "orders")) { errors.orders = errorMessage(error); orderPagination.total = 0; }
  } finally { if (current(id, version, "orders")) loading.orders = false; }
}
function searchOrders(): void {
  Object.assign(orderQuery, { ...orderFilters, keyword: orderFilters.keyword.trim() });
  orderPagination.page = 1;
  void loadOrders();
}
function resetOrders(): void {
  Object.assign(orderFilters, { keyword: "", status: "", paymentStatus: "", skuId: "" });
  searchOrders();
}
async function openRegistration(id: string): Promise<void> {
  if (!canViewRegistrations.value || busy.value) return;
  const conferenceId = selectedId.value;
  const version = ++versions.registrationDetail;
  registrationDetailId.value = id;
  registrationVisible.value = true;
  registrationDetail.value = null;
  errors.registrationDetail = "";
  loading.registrationDetail = true;
  try {
    const result = await api.registration(id);
    if (!current(conferenceId, version, "registrationDetail") || !registrationVisible.value) return;
    registrationDetail.value = result;
    remark.value = result.adminRemark || "";
  } catch (error) { if (current(conferenceId, version, "registrationDetail")) errors.registrationDetail = errorMessage(error); }
  finally { if (current(conferenceId, version, "registrationDetail")) loading.registrationDetail = false; }
}
function closeRegistration(): void {
  versions.registrationDetail++;
  registrationDetail.value = null;
  registrationDetailId.value = "";
}
async function openOrder(orderNo: string): Promise<void> {
  if (!canViewOrders.value) return;
  const id = selectedId.value;
  const version = ++versions.orderDetail;
  orderDetailNo.value = orderNo;
  orderVisible.value = true;
  orderDetail.value = null;
  errors.orderDetail = "";
  loading.orderDetail = true;
  try {
    const result = await api.order(orderNo);
    if (current(id, version, "orderDetail") && orderVisible.value) orderDetail.value = result;
  } catch (error) { if (current(id, version, "orderDetail")) errors.orderDetail = errorMessage(error); }
  finally { if (current(id, version, "orderDetail")) loading.orderDetail = false; }
}
function closeOrder(): void {
  versions.orderDetail++;
  orderDetail.value = null;
  orderDetailNo.value = "";
}
function submittedRows(data: unknown, snapshot: unknown): Array<{ key: string; label: string; value: string }> {
  if (!isRecord(data)) return [];
  const labels = new Map(fields.value.map(field => [field.fieldKey, field.label]));
  if (isRecord(snapshot) && Array.isArray(snapshot.fields)) {
    for (const field of snapshot.fields) {
      if (isRecord(field) && typeof field.key === "string" && typeof field.label === "string") labels.set(field.key, field.label);
    }
  }
  return Object.entries(data).map(([key, value]) => ({
    key, label: labels.get(key) || key,
    value: value === null || value === undefined || value === "" ? "-" : typeof value === "object" ? JSON.stringify(value, null, 2) : typeof value === "boolean" ? value ? "是" : "否" : String(value)
  }));
}
async function saveRemark(): Promise<void> {
  if (!registrationDetail.value || !canWriteRegistration.value || saving.remark || checkingIn.value) return;
  saving.remark = true;
  errors.registrationDetail = "";
  try {
    const result = await api.saveRemark(registrationDetail.value.id, remark.value.trim() || null);
    Object.assign(registrationDetail.value, result);
    remark.value = result.adminRemark || "";
    ElMessage.success("备注已保存");
    await loadRegistrations();
  } catch (error) { errors.registrationDetail = errorMessage(error); }
  finally { saving.remark = false; }
}
function canCheckInAttendee(attendee: AdminRegistrationAttendee): boolean {
  return canCheckIn.value && attendee.checkInStatus === "PENDING" && registrationDetail.value?.status === "CONFIRMED" && registrationDetail.value.order.status === "PAID";
}
async function checkIn(attendee: AdminRegistrationAttendee): Promise<void> {
  if (!canCheckInAttendee(attendee) || checkingIn.value || saving.remark) return;
  checkingIn.value = attendee.id;
  errors.registrationDetail = "";
  try {
    try {
      await ElMessageBox.confirm("确认 " + (attendee.name || "该参会人") + "（" + (attendee.phone || attendee.id) + "）已到场并完成签到？", "确认签到", {
        confirmButtonText: "确认签到", cancelButtonText: "取消", type: "warning", closeOnClickModal: false
      });
    } catch { return; }
    if (!canCheckInAttendee(attendee)) return;
    const result = await api.checkIn(attendee.id);
    Object.assign(attendee, result);
    if (registrationDetail.value) {
      const attendees = registrationDetail.value.attendees;
      registrationDetail.value.checkInProgress = { total: attendees.length,
        checkedIn: attendees.filter(item => item.checkInStatus === "CHECKED_IN").length,
        pending: attendees.filter(item => item.checkInStatus === "PENDING").length,
        notRequired: attendees.filter(item => item.checkInStatus === "NOT_REQUIRED").length };
    }
    ElMessage.success("签到完成");
    await loadRegistrations();
  } catch (error) { errors.registrationDetail = errorMessage(error); }
  finally { checkingIn.value = ""; }
}
async function exportRegistrations(): Promise<void> {
  if (!canExport.value || saving.export || loading.registrations || !registrationApplied.value || errors.registrations) return;
  const filters = { ...registrationApplied.value };
  saving.export = true;
  try {
    if (registrationPagination.total > 5000) throw new Error("当前筛选超过 5000 条，请缩小筛选范围后导出");
    const blob = await api.exportRegistrations(filters);
    if (!alive) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "registrations-" + new Date().toISOString().slice(0, 10) + ".xls";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { ElMessage.error(errorMessage(error)); }
  finally { saving.export = false; }
}

watch(activeTab, () => { void loadTab(); });
watch(() => session.permissions.value.join(","), () => {
  if (!canViewConference.value) {
    selectedId.value = "";
    conference.value = null;
    conferences.value = [];
    skuVisible.value = fieldVisible.value = registrationVisible.value = orderVisible.value = false;
  }
  if (!canViewRegistrations.value) { registrations.value = []; registrationVisible.value = false; }
  if (!canViewOrders.value) { orders.value = []; orderVisible.value = false; }
  if ((activeTab.value === "registrations" && !canViewRegistrations.value) || (activeTab.value === "orders" && !canViewOrders.value)) activeTab.value = "basic";
});
onMounted(() => { void loadConferences(); });
onBeforeUnmount(() => { alive = false; });
</script>

<style scoped>
.scoped-workspace {
  --el-color-primary: #967025; --el-color-primary-light-3: #b3975c; --el-color-primary-light-5: #cbbb92;
  --el-color-primary-light-7: #e0d7c2; --el-color-primary-light-8: #ebe4d5; --el-color-primary-light-9: #f7f4ed;
  --el-color-primary-dark-2: #76571b;
  min-height: 100vh; color: #272b30; background: #f5f6f7; font-size: 14px; letter-spacing: 0;
}
.workspace-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; padding: 12px 24px; background: #fff; border-top: 3px solid #b79143; border-bottom: 1px solid #e0e3e7; box-sizing: border-box; }
.brand, .account { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; min-width: 0; }
.brand strong { color: #967025; font-size: 21px; white-space: nowrap; }
.brand span { padding-left: 14px; border-left: 1px solid #d5d9de; color: #666e78; }
.account span { overflow-wrap: anywhere; max-width: 240px; }
.workspace-body { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: calc(100vh - 67px); }
.conference-sidebar { padding: 20px 16px; background: #fff; border-right: 1px solid #e0e3e7; min-width: 0; }
.section-heading, .table-toolbar, .content-heading, .inline-controls, .remark-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.section-heading h1 { font-size: 15px; margin: 0; }
.section-heading > .el-button:last-child, .table-toolbar > .el-button:last-child, .content-heading > .el-button:last-child { margin-left: auto; }
.search-row { display: flex; gap: 8px; margin: 18px 0 12px; }
.search-row .el-input { min-width: 0; }
.conference-list { min-height: 160px; }
.conference-option { display: flex; flex-direction: column; gap: 7px; text-align: left; width: 100%; padding: 14px 12px; border: 0; border-bottom: 1px solid #eceef0; border-left: 3px solid transparent; background: transparent; color: #30363d; cursor: pointer; font: inherit; }
.conference-option strong { font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.conference-option span { color: #707781; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.conference-option:hover { background: #f6f7f8; }
.conference-option.selected { background: #f8f5ee; border-left-color: #b79143; }
.conference-option:focus-visible { outline: 2px solid #967025; outline-offset: -2px; }
.conference-option:disabled { cursor: default; opacity: .65; }
.conference-pagination { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 16px; font-size: 12px; color: #68717c; flex-wrap: wrap; }
.workspace-content { padding: 22px 28px 36px; min-width: 0; background: #fff; }
.content-heading { margin-bottom: 18px; }
.content-heading > div { flex: 1; min-width: 0; }
.content-heading h2 { font-size: 20px; line-height: 1.5; margin: 0 0 5px; overflow-wrap: anywhere; }
.muted, .filter-summary { color: #68717c; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.content-form { max-width: 900px; padding-top: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.wide { grid-column: 1 / -1; }
.form-grid :deep(.el-form-item), .option-row :deep(.el-form-item) { min-width: 0; }
.scoped-workspace :deep(.el-date-editor.el-input), .scoped-workspace :deep(.el-input-number), .scoped-dialog :deep(.el-date-editor.el-input), .scoped-dialog :deep(.el-input-number) { width: 100%; }
.cover-preview { width: 180px; height: 110px; margin-top: 10px; background: #f5f6f7; border: 1px solid #e4e7eb; }
.inline-controls { width: 100%; }
.inline-controls :deep(.el-input-number) { max-width: 180px; }
.table-toolbar { margin: 10px 0 16px; }
.ticket-details { padding: 0 20px; line-height: 1.7; overflow-wrap: anywhere; }
.filter-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; }
.filter-toolbar > .el-input { width: 285px; max-width: 100%; }
.filter-toolbar > .el-select { width: 150px; max-width: 100%; }
.filter-toolbar > .el-button { margin-left: 0; }
.filter-summary { margin: 5px 0 14px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 18px; overflow-x: auto; padding-bottom: 5px; }
.order-summary { display: flex; flex-wrap: wrap; gap: 20px 30px; margin: 12px 0 18px; padding: 14px 0; border-top: 1px solid #e3e6ea; border-bottom: 1px solid #e3e6ea; }
.order-summary dt { font-size: 12px; color: #68717c; }
.order-summary dd { margin: 8px 0 0; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.scoped-workspace :deep(.el-alert), .scoped-dialog :deep(.el-alert) { margin-bottom: 14px; }
.loading-area { min-height: 180px; }
.access-state { padding: 50px 20px; }
.scoped-dialog h3 { font-size: 15px; margin: 24px 0 14px; }
.detail-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 12px 0; }
.detail-facts > div, .submitted-fields > div { min-width: 0; }
.detail-facts dt, .submitted-fields dt { color: #68717c; font-size: 12px; margin-bottom: 5px; overflow-wrap: anywhere; }
.detail-facts dd, .submitted-fields dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.attendee-section { padding: 8px 0 18px; border-top: 1px solid #e2e5e9; }
.submitted-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px 24px; margin: 16px 0; }
.remark-footer { justify-content: space-between; margin-top: 12px; }
.option-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1000px) {
  .workspace-body { grid-template-columns: 240px minmax(0, 1fr); }
  .workspace-content { padding: 18px; }
}
@media (max-width: 720px) {
  .workspace-header { padding: 12px; gap: 12px; flex-wrap: wrap; }
  .account { margin-left: auto; }
  .brand strong { font-size: 18px; }
  .workspace-body { display: block; }
  .conference-sidebar { border-right: 0; border-bottom: 1px solid #e0e3e7; padding: 14px; }
  .conference-list { max-height: 245px; min-height: 0; overflow-y: auto; }
  .conference-option { padding: 10px; }
  .workspace-content { padding: 16px 12px; }
  .content-heading h2 { font-size: 18px; }
  .form-grid, .detail-facts, .submitted-fields, .option-row { grid-template-columns: minmax(0, 1fr); }
  .filter-toolbar > .el-input { width: 100%; }
  .filter-toolbar > .el-select { flex: 1 1 135px; }
  .pagination { justify-content: flex-start; }
}
</style>
