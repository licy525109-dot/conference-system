<template>
  <section class="admin-page">
    <AdminPageHeader :title="currentRoute.title" :eyebrow="currentRoute.group" :badge="currentRoute.badge || ''" badge-tone="warning" :subtitle="currentRoute.description || ''">
      <AdminFeatureBadge :label="statusLabel" :description="statusDescription" :tone="currentRoute.badge ? 'warning' : 'success'" />
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <template v-if="section === 'inventory'">
      <AdminFilterBar>
        <el-select v-model="conferenceId" filterable placeholder="选择会议" style="width: 280px" @change="loadInventory">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <template #actions>
          <el-button type="primary" :disabled="!conferenceId" @click="saveInventoryRule">保存规则</el-button>
          <el-button :loading="submitting" @click="scanInventory">手动扫描库存</el-button>
        </template>
      </AdminFilterBar>
      <AdminSectionCard title="库存预警规则" subtitle="按会议配置阈值，扫描时会逐票种生成真实预警日志。">
        <el-form :model="inventoryRule" label-width="120px" class="inline-form">
          <el-form-item label="启用"><el-switch v-model="inventoryRule.enabled" /></el-form-item>
          <el-form-item label="剩余阈值"><el-input-number v-model="inventoryRule.thresholdRemaining" :min="0" /></el-form-item>
          <el-form-item label="提醒方式"><el-select v-model="inventoryRule.notifyMode"><el-option label="后台提醒" value="ADMIN_ONLY" /><el-option label="通知任务预留" value="NOTIFICATION_TASK" /></el-select></el-form-item>
        </el-form>
      </AdminSectionCard>
      <AdminSectionCard title="库存预警日志">
        <el-table :data="inventoryLogs" empty-text="暂无库存预警日志">
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column prop="remainingStock" label="剩余" width="90" />
          <el-table-column prop="thresholdRemaining" label="阈值" width="90" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="message" label="说明" min-width="220" />
          <el-table-column prop="createdAt" label="时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('checkin')">
      <AdminFilterBar>
        <el-input v-if="section === 'checkin-verify'" v-model="checkinCredential" placeholder="报名号 / 二维码内容 / 参会人 ID" style="width: 340px" @keyup.enter="verifyCredential" />
        <el-select v-model="conferenceId" clearable filterable placeholder="统计会议" style="width: 280px" @change="loadCheckin">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <el-input v-if="section !== 'checkin-verify'" v-model="checkinFilters.keyword" clearable placeholder="姓名 / 手机 / 报名号 / 微信昵称" style="width: 280px" @keyup.enter="loadCheckin" />
        <el-select v-if="section === 'checkin-stats'" v-model="checkinFilters.checkInStatus" clearable placeholder="签到状态" style="width: 140px" @change="loadCheckin">
          <el-option label="已签到" value="CHECKED_IN" />
          <el-option label="未签到" value="PENDING" />
          <el-option label="无需核销" value="NOT_REQUIRED" />
        </el-select>
        <el-select v-if="section === 'checkin-stats'" v-model="checkinFilters.paymentStatus" clearable placeholder="支付状态" style="width: 140px" @change="loadCheckin">
          <el-option label="已支付" value="PAID" />
          <el-option label="待支付" value="PENDING" />
          <el-option label="已关闭" value="CLOSED" />
        </el-select>
        <el-select v-model="checkinFilters.method" clearable placeholder="核销方式" style="width: 150px" @change="loadCheckin">
          <el-option label="客户自助" value="SELF_INPUT" />
          <el-option label="工作人员扫码" value="QR_SCAN" />
          <el-option label="后台应急补签" value="ADMIN_MANUAL" />
        </el-select>
        <template #actions>
          <el-button v-if="section === 'checkin-verify'" type="primary" :disabled="!checkinCredential" @click="verifyCredential">应急补签</el-button>
          <el-button v-else type="primary" @click="loadCheckin">筛选</el-button>
          <el-button v-if="section === 'checkin-stats'" :disabled="checkinListRows.length === 0" @click="exportCheckinRows">导出当前名单</el-button>
        </template>
      </AdminFilterBar>
      <el-alert
        v-if="section === 'checkin-verify'"
        class="checkin-guide"
        title="工作人员扫码入口：小程序个人中心会按后台授权显示“扫码核销”。常规现场核销请使用工作人员小程序扫码，后台应急补签仅用于异常处理。"
        type="info"
        :closable="false"
        show-icon
      />
      <AdminSectionCard v-if="section === 'checkin-verify'" title="后台应急补签" subtitle="仅用于现场异常处理。常规签到请使用客户自助签到或工作人员小程序扫码。">
        <el-alert title="后台补签会写入审计日志；重复签到不会重复计数，会返回首次签到时间。" type="warning" :closable="false" show-icon />
        <div v-if="checkinResult" class="result-card">
          <strong>{{ checkinResult.message || "处理完成" }}</strong>
          <span>报名号：{{ checkinResult.registrationNo || "-" }}</span>
          <span>参会人：{{ checkinResult.attendeeName || "-" }}</span>
          <span>签到时间：{{ checkinResult.checkedInAt || "-" }}</span>
        </div>
      </AdminSectionCard>
      <div v-if="section === 'checkin-stats'" class="admin-stat-grid">
        <AdminStatCard class="is-clickable" label="已报名" :value="checkinRegistered" @click="openCheckinDetailList('registeredList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('registeredList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="已支付" :value="checkinPaid" @click="openCheckinDetailList('paidList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('paidList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="已签到" :value="checkinCheckedIn" tone="success" @click="openCheckinDetailList('checkedInList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('checkedInList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="未签到" :value="checkinUnchecked" tone="warning" @click="openCheckinDetailList('uncheckedInList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('uncheckedInList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="无需核销" :value="checkinNotRequired" @click="openCheckinDetailList('notRequiredList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('notRequiredList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="签到失败" :value="checkinFailed" tone="danger" @click="openCheckinDetailList('failedList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('failedList')">查看详情</button></AdminStatCard>
        <AdminStatCard class="is-clickable" label="重复签到" :value="checkinRepeated" tone="warning" @click="openCheckinDetailList('repeatedList')"><button class="stat-card-action" type="button" @click.stop="openCheckinDetailList('repeatedList')">查看详情</button></AdminStatCard>
      </div>
      <AdminSectionCard v-if="section === 'checkin-verify'" title="签到工作人员配置" subtitle="从已有微信用户中授权扫码权限，可限定全部会议或单场会议；小程序扫码接口仍会校验该授权。">
        <div class="staff-config-row">
          <el-input v-model="staffKeyword" clearable placeholder="搜索微信昵称 / 手机 / openid" style="width: 260px" @keyup.enter="loadStaffUsers" />
          <el-button @click="loadStaffUsers">搜索用户</el-button>
          <el-select v-model="staffForm.userId" filterable placeholder="选择工作人员" style="width: 280px">
            <el-option v-for="user in staffUsers" :key="user.id" :label="staffUserLabel(user)" :value="user.id" />
          </el-select>
          <el-select v-model="staffForm.conferenceId" clearable placeholder="可核销会议：全部" style="width: 260px">
            <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
          <el-input v-model="staffForm.remark" placeholder="备注（选填）" style="width: 220px" />
          <el-button type="primary" :disabled="!staffForm.userId" @click="grantCheckinStaff">授予扫码权限</el-button>
        </div>
        <el-table :data="staffAssignments" empty-text="暂无工作人员授权">
          <el-table-column label="微信用户" min-width="220">
            <template #default="{ row }">
              <div class="wechat-user-cell">
                <img v-if="row.user?.wechatAvatarUrl" :src="row.user.wechatAvatarUrl" alt="" />
                <span v-else class="avatar-fallback">{{ staffUserInitial(row.user) }}</span>
                <div>
                  <strong>{{ row.user?.wechatNickname || row.user?.nickname || "微信用户" }}</strong>
                  <small>{{ row.user?.phone || row.user?.openid || row.userId }}</small>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="scopeText" label="核销范围" min-width="180" />
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="Boolean(row.enabled)" :label="row.enabled ? '已启用' : '已停用'" :tone="row.enabled ? 'success' : 'neutral'" /></template></el-table-column>
          <el-table-column label="操作" width="120"><template #default="{ row }"><el-button size="small" @click="toggleCheckinStaff(row)">{{ row.enabled ? "停用" : "启用" }}</el-button></template></el-table-column>
        </el-table>
      </AdminSectionCard>
      <AdminSectionCard v-if="section === 'checkin-logs'" title="签到记录" subtitle="展示每一条客户自助、工作人员扫码、后台应急补签和撤销明细。">
        <el-table :data="checkinLogs" empty-text="暂无签到记录">
          <el-table-column label="微信用户" width="180">
            <template #default="{ row }">
              <div class="wechat-user-cell compact">
                <img v-if="row.wechatAvatarUrl" :src="row.wechatAvatarUrl" alt="" />
                <span v-else class="avatar-fallback">{{ userInitial(row) }}</span>
                <div>
                  <strong>{{ row.wechatNickname || "-" }}</strong>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column prop="registrationNo" label="报名号" min-width="150" />
          <el-table-column prop="attendeeName" label="参会人" width="120" />
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column prop="method" label="核销方式" width="140"><template #default="{ row }">{{ checkinMethodText(row.method) }}</template></el-table-column>
          <el-table-column prop="result" label="结果" width="110"><template #default="{ row }">{{ resultText(row.result) }}</template></el-table-column>
          <el-table-column prop="beforeStatus" label="核销前" width="110"><template #default="{ row }">{{ checkinStatusText(row.beforeStatus) }}</template></el-table-column>
          <el-table-column prop="afterStatus" label="核销后" width="110"><template #default="{ row }">{{ checkinStatusText(row.afterStatus) }}</template></el-table-column>
          <el-table-column prop="operatorName" label="操作人" width="140" />
          <el-table-column prop="failureReason" label="失败原因" min-width="150" />
          <el-table-column prop="createdAt" label="时间" width="190" />
          <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button size="small" @click="openCheckinDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </AdminSectionCard>
      <AdminSectionCard v-else title="签到统计" subtitle="按票种、核销方式和时间段聚合，避免与签到记录页重复。">
        <div class="stat-tables">
          <el-table :data="asRows(checkinStats.bySku)" empty-text="暂无票种统计">
            <el-table-column prop="key" label="票种" min-width="160" />
            <el-table-column prop="total" label="人数" width="100" />
            <el-table-column prop="checkedIn" label="已签到" width="100" />
          </el-table>
          <el-table :data="asRows(checkinStats.byMethod)" empty-text="暂无方式统计">
            <el-table-column prop="key" label="方式" min-width="160"><template #default="{ row }">{{ checkinMethodText(row.key) }}</template></el-table-column>
            <el-table-column prop="count" label="次数" width="100" />
          </el-table>
          <el-table :data="asRows(checkinStats.byHour)" empty-text="暂无时间段统计">
            <el-table-column prop="key" label="时间段" min-width="180" />
            <el-table-column prop="count" label="次数" width="100" />
          </el-table>
        </div>
        <el-tabs v-model="checkinListTab" class="checkin-list-tabs">
          <el-tab-pane label="已报名名单" name="registeredList" />
          <el-tab-pane label="已支付名单" name="paidList" />
          <el-tab-pane label="已签到名单" name="checkedInList" />
          <el-tab-pane label="未签到名单" name="uncheckedInList" />
          <el-tab-pane label="无需核销名单" name="notRequiredList" />
          <el-tab-pane label="失败明细" name="failedList" />
          <el-tab-pane label="重复明细" name="repeatedList" />
        </el-tabs>
        <el-table :data="checkinListRows" :empty-text="checkinEmptyText">
          <el-table-column label="微信用户" width="190">
            <template #default="{ row }">
              <div class="wechat-user-cell compact">
                <img v-if="row.wechatAvatarUrl" :src="row.wechatAvatarUrl" alt="" />
                <span v-else class="avatar-fallback">{{ userInitial(row) }}</span>
                <div>
                  <strong>{{ row.wechatNickname || "-" }}</strong>
                  <small>{{ row.userPhone || "-" }}</small>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="attendeeName" label="参会人" width="120" />
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column prop="company" label="公司" min-width="140" />
          <el-table-column prop="skuName" label="票种" min-width="140" />
          <el-table-column prop="registrationNo" label="报名号" min-width="150" />
          <el-table-column prop="paymentStatusText" label="支付状态" width="110" />
          <el-table-column prop="checkInStatusText" label="签到状态" width="110" />
          <el-table-column prop="checkedInAt" label="签到时间" width="190" />
          <el-table-column prop="checkInMethodText" label="签到方式" width="140" />
          <el-table-column prop="operatorName" label="操作人" width="140" />
          <el-table-column prop="failureReason" label="失败原因" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button size="small" @click="openCheckinDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </AdminSectionCard>
      <el-dialog v-model="checkinListDialogVisible" :title="checkinListTitle" width="1100px">
        <div class="dialog-toolbar">
          <el-button :disabled="checkinDetailRows.length === 0" @click="exportRows(checkinListTitle, checkinDetailRows)">导出当前详情</el-button>
        </div>
        <el-table :data="checkinDetailRows" :empty-text="checkinEmptyText" max-height="520">
          <el-table-column prop="attendeeName" label="参会人" width="120" />
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column prop="company" label="公司" min-width="140" />
          <el-table-column prop="registrationNo" label="报名号" min-width="150" />
          <el-table-column prop="paymentStatusText" label="支付状态" width="110" />
          <el-table-column prop="checkInStatusText" label="签到状态" width="110" />
          <el-table-column prop="checkedInAt" label="签到时间" width="190" />
          <el-table-column prop="checkInMethodText" label="签到方式" width="140" />
          <el-table-column prop="operatorName" label="操作人" width="140" />
          <el-table-column prop="failureReason" label="失败原因" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button size="small" @click="openCheckinDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
      </el-dialog>
      <el-dialog v-model="checkinDetailVisible" title="签到详情" width="760px">
        <div v-if="checkinDetail" class="checkin-detail">
          <div class="wechat-user-cell detail-user">
            <img v-if="String(checkinDetail.wechatAvatarUrl || '')" :src="String(checkinDetail.wechatAvatarUrl)" alt="" />
            <span v-else class="avatar-fallback">{{ userInitial(checkinDetail) }}</span>
            <div>
              <strong>{{ checkinDetail.wechatNickname || "微信用户" }}</strong>
              <small>{{ checkinDetail.userPhone || "-" }}</small>
            </div>
          </div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="会议">{{ checkinDetail.conferenceTitle || "-" }}</el-descriptions-item>
            <el-descriptions-item label="报名号">{{ checkinDetail.registrationNo || "-" }}</el-descriptions-item>
            <el-descriptions-item label="参会人">{{ checkinDetail.attendeeName || "-" }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ checkinDetail.phone || "-" }}</el-descriptions-item>
            <el-descriptions-item label="公司">{{ checkinDetail.company || "-" }}</el-descriptions-item>
            <el-descriptions-item label="票种">{{ checkinDetail.skuName || "-" }}</el-descriptions-item>
            <el-descriptions-item label="支付状态">{{ checkinDetail.paymentStatusText || paymentStatusText(checkinDetail.paymentStatus) }}</el-descriptions-item>
            <el-descriptions-item label="报名状态">{{ checkinDetail.registrationStatus || "-" }}</el-descriptions-item>
            <el-descriptions-item label="签到状态">{{ checkinDetail.checkInStatusText || checkinStatusText(checkinDetail.checkInStatus) }}</el-descriptions-item>
            <el-descriptions-item label="签到时间">{{ checkinDetail.checkedInAt || checkinDetail.createdAt || "-" }}</el-descriptions-item>
            <el-descriptions-item label="签到方式">{{ checkinDetail.checkInMethodText || checkinMethodText(checkinDetail.method) }}</el-descriptions-item>
            <el-descriptions-item label="操作人">{{ checkinDetail.operatorName || "-" }}</el-descriptions-item>
            <el-descriptions-item label="失败原因" :span="2">{{ checkinDetail.failureReason || "-" }}</el-descriptions-item>
          </el-descriptions>
          <div class="form-summary">
            <strong>报名表单摘要</strong>
            <el-empty v-if="formSummaryRows(checkinDetail).length === 0" description="暂无表单摘要" />
            <el-table v-else :data="formSummaryRows(checkinDetail)" size="small">
              <el-table-column prop="label" label="字段" width="180" />
              <el-table-column prop="value" label="内容" min-width="220" show-overflow-tooltip />
            </el-table>
          </div>
        </div>
      </el-dialog>
    </template>

    <template v-else-if="section === 'payment-exceptions'">
      <AdminFilterBar>
        <el-input v-model="keyword" placeholder="订单号 / 姓名 / 手机 / 交易号" style="width: 300px" @keyup.enter="loadPaymentExceptions" />
        <template #actions><el-button type="primary" @click="loadPaymentExceptions">查询异常</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="支付异常" subtitle="只展示和记录处理备注，不允许人工修改支付成功状态。">
        <el-table :data="paymentExceptions" empty-text="暂无支付异常">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(toNumber(row.payableAmountCent)) }}</template></el-table-column>
          <el-table-column label="异常原因" min-width="260"><template #default="{ row }">{{ exceptionText(row.exceptions) }}</template></el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section === 'payment-records'">
      <AdminFilterBar>
        <el-input v-model="keyword" placeholder="订单号 / 商户单号 / 微信单号" style="width: 300px" @keyup.enter="loadPayments" />
        <el-select v-model="paymentStatus" clearable placeholder="状态" style="width: 160px">
          <el-option label="支付成功" value="SUCCESS" /><el-option label="待支付" value="PENDING" /><el-option label="支付失败" value="FAILED" />
        </el-select>
        <template #actions><el-button type="primary" @click="loadPayments">查询流水</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="支付记录" subtitle="来自真实 payments 表，不提供人工改支付状态。">
        <el-table :data="payments" empty-text="暂无支付记录">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
          <el-table-column prop="provider" label="渠道" width="110"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
          <el-table-column prop="status" label="状态" width="120"><template #default="{ row }">{{ paymentStatusText(row.status) }}</template></el-table-column>
          <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
          <el-table-column prop="transactionId" label="交易号" min-width="180" />
          <el-table-column prop="paidAt" label="支付时间" width="190" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section === 'coupon-campaigns'">
      <AdminFilterBar>
        <el-input v-model="campaignForm.name" placeholder="活动名称" style="width: 220px" />
        <el-select v-model="campaignForm.couponIds" multiple collapse-tags placeholder="关联优惠券" style="width: 320px">
          <el-option v-for="item in coupons" :key="item.id" :label="`${item.name} (${item.code})`" :value="item.id" />
        </el-select>
        <template #actions><el-button type="primary" :disabled="!campaignForm.name || campaignForm.couponIds.length === 0" @click="createCampaign">创建券活动</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard title="券活动批次" subtitle="每个批次有 claimCode 和小程序领取路径，可用于二维码领取。">
        <el-table :data="couponCampaigns" empty-text="暂无券活动">
          <el-table-column prop="name" label="活动" min-width="180" />
          <el-table-column prop="claimCode" label="领取码" min-width="150" />
          <el-table-column prop="claimedCount" label="已领取" width="90" />
          <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="Boolean(row.enabled)" /></template></el-table-column>
          <el-table-column label="优惠券" min-width="220"><template #default="{ row }">{{ couponNames(row.coupons) }}</template></el-table-column>
          <el-table-column label="操作" width="130"><template #default="{ row }"><el-button size="small" @click="showCampaignQr(String(row.id))">二维码信息</el-button></template></el-table-column>
        </el-table>
      </AdminSectionCard>
      <pre v-if="qrInfo" class="json-block">{{ qrInfo }}</pre>
    </template>

    <template v-else-if="section.startsWith('notification-config')">
      <AdminSectionCard :title="section === 'notification-config-sms' ? '短信配置' : '微信订阅消息配置'" subtitle="读取服务端 env 开关和数据库模板映射；密钥不进入前端。">
        <el-descriptions v-if="channelConfig" :column="2" border>
          <el-descriptions-item label="通道">{{ channelConfig.channel }}</el-descriptions-item>
          <el-descriptions-item label="启用状态">{{ channelConfig.statusText }}</el-descriptions-item>
          <el-descriptions-item label="Env Key">{{ channelConfig.envKey }}</el-descriptions-item>
          <el-descriptions-item label="密钥展示">{{ channelConfig.secretVisible ? "可见" : "不可见" }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="asRows(channelConfig?.templates)" empty-text="暂无模板映射">
          <el-table-column prop="code" label="模板编码" min-width="160" />
          <el-table-column prop="name" label="模板名称" min-width="160" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="templateKey" label="外部模板 Key" min-width="180" />
        </el-table>
      </AdminSectionCard>
    </template>

    <template v-else-if="section.startsWith('finance')">
      <AdminFilterBar v-if="section === 'finance-wechat-bills'">
        <el-date-picker v-model="billDate" type="date" value-format="YYYY-MM-DD" placeholder="账单日期" />
        <template #actions><el-button type="primary" :disabled="!billDate" @click="createBill">创建账单批次</el-button></template>
      </AdminFilterBar>
      <AdminSectionCard :title="currentRoute.title">
        <el-table :data="financeRows" empty-text="暂无财务数据">
          <el-table-column prop="refundNo" label="退款号" min-width="150" />
          <el-table-column prop="invoiceNo" label="发票号" min-width="150" />
          <el-table-column prop="billType" label="账单类型" width="110" />
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="金额" width="120"><template #default="{ row }">{{ moneyMaybe(row.amountCent ?? row.localAmountCent ?? row.remoteAmountCent) }}</template></el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="190" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button v-if="section === 'finance-refunds'" size="small" @click="approveRefundRow(String(row.id))">批准</el-button>
              <el-button v-if="section === 'finance-invoices'" size="small" @click="approveInvoiceRow(String(row.id))">通过</el-button>
              <el-button v-if="section === 'finance-wechat-bills'" size="small" @click="reconcileBill(String(row.id))">对账</el-button>
            </template>
          </el-table-column>
        </el-table>
      </AdminSectionCard>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatCard from "../../components/AdminStatCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { currentRoute } from "../../router";
import {
  approveInvoice,
  approveRefund,
  createCheckinStaff,
  createCouponCampaign,
  createWechatBill,
  generateCouponCampaignQr,
  getCheckinStats,
  getInventoryAlertRule,
  getNotificationChannelConfig,
  listCheckinLogs,
  listCheckinStaff,
  listConferences,
  listCouponCampaigns,
  listCoupons,
  listFinancePayments,
  listInventoryAlertLogs,
  listInvoices,
  listPaymentExceptions,
  listReconciliationResults,
  listRefunds,
  listUsers,
  listWechatBills,
  manualCheckin,
  reconcileWechatBill,
  scanInventoryAlerts,
  updateCheckinStaff,
  updateInventoryAlertRule,
} from "../../services/admin";
import type { AdminAppUser, CheckinStaffAssignment, Conference, Coupon, FinancePayment } from "../../services/types";

type CheckinListTab = "registeredList" | "paidList" | "checkedInList" | "uncheckedInList" | "notRequiredList" | "failedList" | "repeatedList";

const loading = ref(false);
const submitting = ref(false);
const conferences = ref<Conference[]>([]);
const conferenceId = ref("");
const keyword = ref("");
const paymentStatus = ref("");
const coupons = ref<Coupon[]>([]);
const inventoryRule = reactive({ enabled: false, thresholdRemaining: 10, notifyMode: "ADMIN_ONLY" });
const inventoryLogs = ref<Record<string, unknown>[]>([]);
const checkinCredential = ref("");
const checkinLogs = ref<Record<string, unknown>[]>([]);
const checkinStats = ref<Record<string, unknown>>({});
const checkinResult = ref<Record<string, unknown> | null>(null);
const checkinListTab = ref<CheckinListTab>("checkedInList");
const checkinFilters = reactive({ keyword: "", checkInStatus: "", paymentStatus: "", method: "" });
const checkinListDialogVisible = ref(false);
const checkinDetailVisible = ref(false);
const checkinDetail = ref<Record<string, unknown> | null>(null);
const staffUsers = ref<AdminAppUser[]>([]);
const staffAssignments = ref<CheckinStaffAssignment[]>([]);
const staffKeyword = ref("");
const staffForm = reactive({ userId: "", conferenceId: "", remark: "" });
const paymentExceptions = ref<Record<string, unknown>[]>([]);
const payments = ref<FinancePayment[]>([]);
const couponCampaigns = ref<Record<string, unknown>[]>([]);
const campaignForm = reactive({ name: "", couponIds: [] as string[] });
const qrInfo = ref("");
const channelConfig = ref<Record<string, unknown> | null>(null);
const financeRows = ref<Record<string, unknown>[]>([]);
const billDate = ref("");

const section = computed(() => {
  const path = currentRoute.value.path;
  if (path.includes("inventory")) return "inventory";
  if (path.includes("checkin/verify")) return "checkin-verify";
  if (path.includes("checkin/logs")) return "checkin-logs";
  if (path.includes("checkin/stats")) return "checkin-stats";
  if (path.includes("payment-exceptions")) return "payment-exceptions";
  if (path.includes("payment-records")) return "payment-records";
  if (path.includes("coupon-campaigns")) return "coupon-campaigns";
  if (path.includes("wechat-subscribe")) return "notification-config-wechat";
  if (path.includes("notifications/sms")) return "notification-config-sms";
  if (path.includes("finance/refunds")) return "finance-refunds";
  if (path.includes("finance/invoices")) return "finance-invoices";
  if (path.includes("finance/wechat-bills")) return "finance-wechat-bills";
  if (path.includes("finance/reconciliation")) return "finance-reconciliation";
  return "unknown";
});
const statusLabel = computed(() => (currentRoute.value.badge ? `${currentRoute.value.badge}能力` : "已接入真实数据"));
const statusDescription = computed(() => {
  if (!currentRoute.value.badge) return "页面、接口和数据链路已接入，可按业务流程使用。";
  if (currentRoute.value.badge === "辅助") return "该入口用于运营核查和人工备注，不会绕过支付、退款或签到主链路。";
  return "该能力仍需按页面提示完成配置或联调后再开放给一线运营使用。";
});
const checkinRegistered = computed(() => toNumber(checkinStats.value.registeredCount));
const checkinPaid = computed(() => toNumber(checkinStats.value.paidCount));
const checkinCheckedIn = computed(() => toNumber(checkinStats.value.checkedIn));
const checkinUnchecked = computed(() => toNumber(checkinStats.value.uncheckedIn ?? checkinStats.value.pending));
const checkinNotRequired = computed(() => toNumber(checkinStats.value.notRequired));
const checkinFailed = computed(() => toNumber(checkinStats.value.failedCount));
const checkinRepeated = computed(() => toNumber(checkinStats.value.repeatedCount));
const checkinListRows = computed(() => asRows(checkinStats.value[checkinListTab.value]));
const checkinDetailRows = computed(() => asRows(checkinStats.value[checkinListTab.value]));
const checkinListTitle = computed(() => ({
  registeredList: "已报名名单",
  paidList: "已支付名单",
  checkedInList: "已签到名单",
  uncheckedInList: "未签到名单",
  notRequiredList: "无需核销名单",
  failedList: "签到失败明细",
  repeatedList: "重复签到明细"
})[checkinListTab.value]);
const checkinEmptyText = computed(() => {
  const messages: Record<CheckinListTab, string> = {
    registeredList: "暂无报名人员",
    paidList: "暂无已支付人员",
    checkedInList: "暂无已签到人员",
    uncheckedInList: "暂无未签到人员",
    notRequiredList: "暂无无需核销人员",
    failedList: "暂无签到失败记录",
    repeatedList: "暂无重复签到记录"
  };
  return checkinStats.value.emptyReason && checkinListRows.value.length === 0 ? `${messages[checkinListTab.value]}：${String(checkinStats.value.emptyReason)}` : messages[checkinListTab.value];
});

onMounted(() => void load());
watch(() => currentRoute.value.path, () => void load());

async function load() {
  loading.value = true;
  try {
    await ensureConferences();
    if (section.value === "inventory") await loadInventory();
    else if (section.value.startsWith("checkin")) await loadCheckin();
    else if (section.value === "payment-exceptions") await loadPaymentExceptions();
    else if (section.value === "payment-records") await loadPayments();
    else if (section.value === "coupon-campaigns") await loadCampaigns();
    else if (section.value.startsWith("notification-config")) await loadChannelConfig();
    else if (section.value.startsWith("finance")) await loadFinance();
  } finally {
    loading.value = false;
  }
}

async function ensureConferences() {
  if (conferences.value.length === 0) {
    conferences.value = (await listConferences({ page: 1, pageSize: 200 })).items;
    conferenceId.value ||= conferences.value[0]?.id ?? "";
  }
}

async function loadInventory() {
  if (!conferenceId.value) return;
  const rule = await getInventoryAlertRule(conferenceId.value);
  Object.assign(inventoryRule, { enabled: Boolean(rule.enabled), thresholdRemaining: toNumber(rule.thresholdRemaining) || 10, notifyMode: String(rule.notifyMode || "ADMIN_ONLY") });
  inventoryLogs.value = (await listInventoryAlertLogs({ page: 1, pageSize: 100, conferenceId: conferenceId.value })).items;
}

async function saveInventoryRule() {
  await updateInventoryAlertRule(conferenceId.value, inventoryRule);
  await loadInventory();
  ElMessage.success("库存预警规则已保存");
}

async function scanInventory() {
  submitting.value = true;
  try {
    const result = await scanInventoryAlerts();
    await loadInventory();
    ElMessage.success(`扫描完成，生成 ${toNumber(result.created)} 条日志`);
  } finally {
    submitting.value = false;
  }
}

async function loadCheckin() {
  const params = {
    conferenceId: conferenceId.value || undefined,
    keyword: checkinFilters.keyword || undefined,
    checkInStatus: checkinFilters.checkInStatus || undefined,
    paymentStatus: checkinFilters.paymentStatus || undefined,
    method: checkinFilters.method || undefined
  };
  checkinStats.value = await getCheckinStats(params);
  checkinLogs.value = (await listCheckinLogs({ page: 1, pageSize: 100, ...params })).items;
  if (section.value === "checkin-verify") {
    await Promise.all([loadStaffUsers(), loadStaffAssignments()]);
  }
}

async function verifyCredential() {
  checkinResult.value = await manualCheckin({ credentialCode: checkinCredential.value });
  checkinCredential.value = "";
  await loadCheckin();
  ElMessage.success(String(checkinResult.value.message || "处理完成"));
}

function selectCheckinList(tab: CheckinListTab) {
  checkinListTab.value = tab;
}

function openCheckinDetailList(tab: CheckinListTab) {
  checkinListTab.value = tab;
  checkinListDialogVisible.value = true;
}

function openCheckinDetail(row: Record<string, unknown>) {
  checkinDetail.value = row;
  checkinDetailVisible.value = true;
}

async function loadStaffUsers() {
  staffUsers.value = (await listUsers({ page: 1, pageSize: 50, keyword: staffKeyword.value })).items;
}

async function loadStaffAssignments() {
  staffAssignments.value = (await listCheckinStaff({ page: 1, pageSize: 100, conferenceId: conferenceId.value || undefined })).items;
}

async function grantCheckinStaff() {
  await createCheckinStaff({
    userId: staffForm.userId,
    conferenceId: staffForm.conferenceId || undefined,
    remark: staffForm.remark || undefined
  });
  Object.assign(staffForm, { userId: "", conferenceId: "", remark: "" });
  await loadStaffAssignments();
  ElMessage.success("已授予扫码核销权限");
}

async function toggleCheckinStaff(row: CheckinStaffAssignment) {
  await updateCheckinStaff(row.id, { enabled: !row.enabled });
  await loadStaffAssignments();
  ElMessage.success(row.enabled ? "已停用工作人员权限" : "已启用工作人员权限");
}

function exportCheckinRows() {
  const headers = ["微信昵称", "用户手机", "参会人", "手机号", "公司", "票种", "报名号", "支付状态", "签到状态", "签到时间", "签到方式", "操作人", "失败原因"];
  const rows = checkinListRows.value.map((row) => [
    row.wechatNickname,
    row.userPhone,
    row.attendeeName,
    row.phone,
    row.company,
    row.skuName,
    row.registrationNo,
    row.paymentStatusText,
    row.checkInStatusText,
    row.checkedInAt,
    row.checkInMethodText,
    row.operatorName,
    row.failureReason
  ]);
  downloadCsv(`checkin-${checkinListTab.value}.csv`, [headers, ...rows]);
}

function exportRows(title: string, sourceRows: Record<string, unknown>[]) {
  const headers = ["微信昵称", "用户手机", "参会人", "手机号", "公司", "票种", "报名号", "支付状态", "签到状态", "签到时间", "签到方式", "操作人", "失败原因"];
  const rows = sourceRows.map((row) => [
    row.wechatNickname,
    row.userPhone,
    row.attendeeName,
    row.phone,
    row.company,
    row.skuName,
    row.registrationNo,
    row.paymentStatusText,
    row.checkInStatusText,
    row.checkedInAt || row.createdAt,
    row.checkInMethodText || checkinMethodText(row.method),
    row.operatorName,
    row.failureReason
  ]);
  downloadCsv(`${title}.csv`, [headers, ...rows]);
}

async function loadPaymentExceptions() {
  paymentExceptions.value = (await listPaymentExceptions({ keyword: keyword.value })).items;
}

async function loadPayments() {
  payments.value = (await listFinancePayments({ page: 1, pageSize: 100, keyword: keyword.value, status: paymentStatus.value })).items;
}

async function loadCampaigns() {
  const [couponData, campaignData] = await Promise.all([listCoupons({ page: 1, pageSize: 100 }), listCouponCampaigns({ page: 1, pageSize: 100 })]);
  coupons.value = couponData.items;
  couponCampaigns.value = campaignData.items as unknown as Record<string, unknown>[];
}

async function createCampaign() {
  await createCouponCampaign({ name: campaignForm.name, couponIds: campaignForm.couponIds });
  Object.assign(campaignForm, { name: "", couponIds: [] });
  await loadCampaigns();
  ElMessage.success("券活动已创建");
}

async function showCampaignQr(id: string) {
  qrInfo.value = JSON.stringify(await generateCouponCampaignQr(id), null, 2);
}

async function loadChannelConfig() {
  channelConfig.value = await getNotificationChannelConfig(section.value === "notification-config-sms" ? "sms" : "wechat-subscribe");
}

async function loadFinance() {
  if (section.value === "finance-refunds") financeRows.value = (await listRefunds({ page: 1, pageSize: 100 })).items as unknown as Record<string, unknown>[];
  else if (section.value === "finance-invoices") financeRows.value = (await listInvoices({ page: 1, pageSize: 100 })).items as unknown as Record<string, unknown>[];
  else if (section.value === "finance-wechat-bills") financeRows.value = (await listWechatBills()).items as unknown as Record<string, unknown>[];
  else financeRows.value = (await listReconciliationResults({ page: 1, pageSize: 100 })).items as unknown as Record<string, unknown>[];
}

async function approveRefundRow(id: string) {
  await approveRefund(id);
  await loadFinance();
  ElMessage.success("退款已批准");
}

async function approveInvoiceRow(id: string) {
  await approveInvoice(id);
  await loadFinance();
  ElMessage.success("发票已通过");
}

async function createBill() {
  await createWechatBill({ billDate: billDate.value, billType: "TRADE" });
  await loadFinance();
  ElMessage.success("微信账单批次已创建");
}

async function reconcileBill(id: string) {
  await reconcileWechatBill(id);
  await loadFinance();
  ElMessage.success("对账完成");
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) || 0 : 0;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function moneyMaybe(value: unknown) {
  return typeof value === "number" ? `¥${formatCent(value)}` : "-";
}

function exceptionText(value: unknown) {
  return asRows(value).map((item) => item.message).filter(Boolean).join("；") || "-";
}

function couponNames(value: unknown) {
  return asRows(value).map((item) => item.name || item.code).filter(Boolean).join("，") || "-";
}

function checkinMethodText(value: unknown) {
  return ({ SELF_INPUT: "客户自助", QR_SCAN: "工作人员扫码", ADMIN_MANUAL: "后台应急补签", REVOKE: "撤销核销", VERIFY: "扫码核销" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function checkinStatusText(value: unknown) {
  return ({ CHECKED_IN: "已签到", PENDING: "未签到", NOT_REQUIRED: "无需核销", CANCELLED: "已取消" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function resultText(value: unknown) {
  return ({ SUCCESS: "成功", FAILED: "失败", SKIPPED: "已跳过" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function providerText(value: unknown) {
  return ({ MOCK: "Mock 测试", WECHAT: "微信支付" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function paymentStatusText(value: unknown) {
  return ({ SUCCESS: "成功", PENDING: "待支付", FAILED: "失败", CLOSED: "已关闭" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function staffUserLabel(user: AdminAppUser) {
  return [user.wechatNickname || user.nickname || "微信用户", user.phone || user.openid || user.id].filter(Boolean).join(" / ");
}

function staffUserInitial(user: AdminAppUser | undefined) {
  return String(user?.wechatNickname || user?.nickname || "微").slice(0, 1);
}

function userInitial(row: Record<string, unknown>) {
  return String(row.wechatNickname || row.attendeeName || "微").slice(0, 1);
}

function formSummaryRows(row: Record<string, unknown>) {
  return asRows(row.formSummary);
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.json-block {
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: #0f172a;
  color: #e2e8f0;
}

.result-card {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-surface-muted);
}

.stat-tables {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.is-clickable {
  cursor: pointer;
}

.checkin-list-tabs {
  margin-top: 16px;
}

.checkin-guide {
  margin-bottom: 14px;
}

.staff-config-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.dialog-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.checkin-detail {
  display: grid;
  gap: 16px;
}

.detail-user {
  padding: 12px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: #f8fbff;
}

.form-summary {
  display: grid;
  gap: 10px;
}

.stat-card-action {
  margin-top: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--admin-color-primary);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.wechat-user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.wechat-user-cell img,
.avatar-fallback {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #edf4ff;
  color: var(--admin-color-primary);
  font-size: 13px;
  font-weight: 800;
  object-fit: cover;
}

.wechat-user-cell.compact img,
.wechat-user-cell.compact .avatar-fallback {
  width: 28px;
  height: 28px;
}

.wechat-user-cell strong,
.wechat-user-cell small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-user-cell small {
  color: var(--admin-color-muted);
  font-size: 12px;
}
</style>
