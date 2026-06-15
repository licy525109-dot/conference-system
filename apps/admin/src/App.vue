<template>
  <main v-if="!admin" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>会议后台</h1>
      <el-form :model="loginForm" label-position="top" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" class="full-button" :loading="loading" @click="submitLogin">登录</el-button>
      </el-form>
    </el-card>
  </main>

  <el-container v-else class="admin-shell">
    <el-aside width="220px" class="aside">
      <div class="brand">会议后台</div>
      <el-menu :default-active="activeView" @select="setView">
        <el-menu-item index="dashboard">Dashboard</el-menu-item>
        <el-menu-item index="conferences">会议管理</el-menu-item>
        <el-menu-item index="skus">报名规格</el-menu-item>
        <el-menu-item index="fields">报名字段</el-menu-item>
        <el-menu-item index="coupons">优惠券</el-menu-item>
        <el-menu-item index="promotions">满减规则</el-menu-item>
        <el-menu-item index="orders">订单列表</el-menu-item>
        <el-menu-item index="registrations">报名名单</el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span>{{ admin.displayName || admin.username }}</span>
        <el-button @click="logout">退出</el-button>
      </el-header>
      <el-main class="main">
        <section v-if="activeView === 'dashboard'" class="page-section">
          <h2>Dashboard</h2>
          <el-row :gutter="16">
            <el-col :span="8"><el-card shadow="never">会议、规格、字段配置</el-card></el-col>
            <el-col :span="8"><el-card shadow="never">订单只读查看</el-card></el-col>
            <el-col :span="8"><el-card shadow="never">报名名单只读查看</el-card></el-col>
          </el-row>
        </section>

        <section v-if="activeView === 'conferences'" class="page-section">
          <div class="toolbar">
            <h2>会议管理</h2>
            <el-button type="primary" @click="openConferenceCreate">新建会议</el-button>
          </div>
          <el-table :data="conferences" border>
            <el-table-column prop="title" label="标题" min-width="220" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="location" label="地点" width="140" />
            <el-table-column label="时间" min-width="220">
              <template #default="{ row }">{{ formatDate(row.startAt) }} - {{ formatDate(row.endAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template #default="{ row }">
                <el-button size="small" @click="openConferenceEdit(row)">编辑</el-button>
                <el-dropdown @command="(status: string) => changeConferenceStatus(row.id, status)">
                  <el-button size="small">状态</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="DRAFT">DRAFT</el-dropdown-item>
                      <el-dropdown-item command="PUBLISHED">PUBLISHED</el-dropdown-item>
                      <el-dropdown-item command="CLOSED">CLOSED</el-dropdown-item>
                      <el-dropdown-item command="ARCHIVED">ARCHIVED</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button size="small" @click="selectConference(row, 'skus')">规格</el-button>
                <el-button size="small" @click="selectConference(row, 'fields')">字段</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'skus'" class="page-section">
          <div class="toolbar">
            <h2>报名规格</h2>
            <el-select v-model="selectedConferenceId" placeholder="选择会议" @change="loadSkus">
              <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedConferenceId" @click="openSkuCreate">新增规格</el-button>
          </div>
          <el-table :data="skus" border>
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column label="价格" width="120">
              <template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template>
            </el-table-column>
            <el-table-column prop="stock" label="库存" width="100" />
            <el-table-column prop="soldCount" label="已售" width="100" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }"><el-button size="small" @click="openSkuEdit(row)">编辑</el-button></template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'fields'" class="page-section">
          <div class="toolbar">
            <h2>报名字段</h2>
            <el-select v-model="selectedConferenceId" placeholder="选择会议" @change="loadFields">
              <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedConferenceId" @click="openFieldCreate">新增字段</el-button>
          </div>
          <el-table :data="fields" border>
            <el-table-column prop="label" label="标签" min-width="140" />
            <el-table-column prop="fieldKey" label="字段 Key" min-width="140" />
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="required" label="必填" width="90" />
            <el-table-column prop="enabled" label="启用" width="90" />
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button size="small" @click="openFieldEdit(row)">编辑</el-button>
                <el-button size="small" type="warning" @click="disableField(row.id)">停用</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'coupons'" class="page-section">
          <div class="toolbar">
            <h2>优惠券</h2>
            <el-input v-model="couponKeyword" placeholder="券码/名称" class="search" @keyup.enter="loadCoupons" />
            <el-button @click="loadCoupons">查询</el-button>
            <el-button type="primary" @click="openCouponCreate">新增优惠券</el-button>
          </div>
          <el-table :data="coupons" border>
            <el-table-column prop="code" label="券码" width="140" />
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column prop="type" label="类型" width="110" />
            <el-table-column label="优惠" width="140">
              <template #default="{ row }">{{ couponDiscountText(row) }}</template>
            </el-table-column>
            <el-table-column label="门槛" width="150">
              <template #default="{ row }">{{ thresholdText(row.minAmountCent, row.minQuantity) }}</template>
            </el-table-column>
            <el-table-column label="使用次数" width="100">
              <template #default="{ row }">{{ row.redemptionCount }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">{{ row.enabled ? "启用" : "停用" }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }"><el-button size="small" @click="openCouponEdit(row)">编辑</el-button></template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'promotions'" class="page-section">
          <div class="toolbar">
            <h2>满减规则</h2>
            <el-input v-model="promotionKeyword" placeholder="规则名称" class="search" @keyup.enter="loadPromotionRules" />
            <el-button @click="loadPromotionRules">查询</el-button>
            <el-button type="primary" @click="openPromotionCreate">新增满减</el-button>
          </div>
          <el-table :data="promotionRules" border>
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column label="门槛" width="160">
              <template #default="{ row }">{{ thresholdText(row.minAmountCent, row.minQuantity) }}</template>
            </el-table-column>
            <el-table-column label="优惠" width="120">
              <template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template>
            </el-table-column>
            <el-table-column label="可叠券" width="100">
              <template #default="{ row }">{{ row.stackableWithCoupon ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">{{ row.enabled ? "启用" : "停用" }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }"><el-button size="small" @click="openPromotionEdit(row)">编辑</el-button></template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'orders'" class="page-section">
          <div class="toolbar">
            <h2>订单列表</h2>
            <el-input v-model="orderKeyword" placeholder="订单号/姓名/手机" class="search" @keyup.enter="loadOrders" />
            <el-button @click="loadOrders">查询</el-button>
          </div>
          <el-table :data="orders" border>
            <el-table-column prop="orderNo" label="订单号" min-width="190" />
            <el-table-column label="微信头像" width="90">
              <template #default="{ row }">
                <el-avatar shape="square" :size="42" :src="row.user?.wechatAvatarUrl || undefined">{{ avatarText(row.user) }}</el-avatar>
              </template>
            </el-table-column>
            <el-table-column label="微信昵称" width="140">
              <template #default="{ row }">{{ wechatNickname(row.user) }}</template>
            </el-table-column>
            <el-table-column label="注册时间" width="170">
              <template #default="{ row }">{{ userTime(row.user?.registeredAt) }}</template>
            </el-table-column>
            <el-table-column label="最近活跃" width="170">
              <template #default="{ row }">{{ userTime(row.user?.lastActiveAt) }}</template>
            </el-table-column>
            <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
            <el-table-column prop="attendeeName" label="姓名" width="120" />
            <el-table-column prop="phone" label="手机" width="140" />
            <el-table-column label="应付" width="110">
              <template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="paymentStatus" label="支付状态" width="120">
              <template #default="{ row }">{{ row.paymentStatus || "未支付" }}</template>
            </el-table-column>
            <el-table-column prop="transactionId" label="微信交易号" min-width="180">
              <template #default="{ row }">{{ row.transactionId || "-" }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" @click="openOrderDetail(row.orderNo)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'registrations'" class="page-section">
          <div class="toolbar">
            <h2>报名名单</h2>
            <el-input v-model="registrationKeyword" placeholder="报名号/姓名/手机/订单" class="search" @keyup.enter="loadRegistrations" />
            <el-button @click="loadRegistrations">查询</el-button>
          </div>
          <el-table :data="registrations" border>
            <el-table-column prop="registrationNo" label="报名号" min-width="190" />
            <el-table-column label="微信头像" width="90">
              <template #default="{ row }">
                <el-avatar shape="square" :size="42" :src="row.user?.wechatAvatarUrl || undefined">{{ avatarText(row.user) }}</el-avatar>
              </template>
            </el-table-column>
            <el-table-column label="微信昵称" width="140">
              <template #default="{ row }">{{ wechatNickname(row.user) }}</template>
            </el-table-column>
            <el-table-column label="注册时间" width="170">
              <template #default="{ row }">{{ userTime(row.user?.registeredAt) }}</template>
            </el-table-column>
            <el-table-column label="最近活跃" width="170">
              <template #default="{ row }">{{ userTime(row.user?.lastActiveAt) }}</template>
            </el-table-column>
            <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
            <el-table-column prop="skuName" label="规格" width="140" />
            <el-table-column label="人数" width="90">
              <template #default="{ row }">{{ row.attendeeCount || 1 }}</template>
            </el-table-column>
            <el-table-column label="核销进度" width="130">
              <template #default="{ row }">{{ formatCheckInProgress(row.checkInProgress) }}</template>
            </el-table-column>
            <el-table-column prop="attendeeName" label="姓名" width="120" />
            <el-table-column prop="phone" label="手机" width="140" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column label="后台备注" min-width="180">
              <template #default="{ row }">
                <el-tooltip v-if="row.adminRemark" :content="row.adminRemark" placement="top">
                  <span class="ellipsis-text">{{ row.adminRemark }}</span>
                </el-tooltip>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" @click="openRegistrationDetail(row.id)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-main>
    </el-container>
  </el-container>

  <el-dialog v-model="conferenceDialogVisible" :title="conferenceForm.id ? '编辑会议' : '新建会议'" width="720px">
    <el-form :model="conferenceForm" label-width="110px">
      <el-form-item label="标题"><el-input v-model="conferenceForm.title" /></el-form-item>
      <el-form-item label="副标题"><el-input v-model="conferenceForm.subtitle" /></el-form-item>
      <el-form-item label="封面 URL"><el-input v-model="conferenceForm.coverImage" /></el-form-item>
      <el-form-item label="开始时间"><el-date-picker v-model="conferenceForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
      <el-form-item label="结束时间"><el-date-picker v-model="conferenceForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
      <el-form-item label="地点"><el-input v-model="conferenceForm.location" /></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="conferenceForm.status">
          <el-option label="DRAFT" value="DRAFT" />
          <el-option label="PUBLISHED" value="PUBLISHED" />
          <el-option label="CLOSED" value="CLOSED" />
          <el-option label="ARCHIVED" value="ARCHIVED" />
        </el-select>
      </el-form-item>
      <el-form-item label="需要核销"><el-switch v-model="conferenceForm.checkInEnabled" /></el-form-item>
      <el-form-item label="团体报名"><el-switch v-model="conferenceForm.groupRegistrationEnabled" /></el-form-item>
      <el-form-item label="单单最大票数"><el-input-number v-model="conferenceForm.maxTicketsPerOrder" :min="0" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="conferenceForm.sortOrder" :min="0" /></el-form-item>
      <el-form-item label="详情 JSON"><el-input v-model="conferenceForm.contentJsonText" type="textarea" :rows="5" /></el-form-item>
      <el-form-item label="样式 JSON"><el-input v-model="conferenceForm.styleJsonText" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="conferenceDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveConference">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="skuDialogVisible" :title="skuForm.id ? '编辑规格' : '新增规格'" width="620px">
    <el-form :model="skuForm" label-width="100px">
      <el-form-item label="名称"><el-input v-model="skuForm.name" /></el-form-item>
      <el-form-item label="说明"><el-input v-model="skuForm.description" /></el-form-item>
      <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="skuForm.status">
          <el-option label="ACTIVE" value="ACTIVE" />
          <el-option label="INACTIVE" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="skuDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveSku">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="fieldDialogVisible" :title="fieldForm.id ? '编辑字段' : '新增字段'" width="620px">
    <el-form :model="fieldForm" label-width="110px">
      <el-form-item label="标签"><el-input v-model="fieldForm.label" /></el-form-item>
      <el-form-item label="字段 Key"><el-input v-model="fieldForm.fieldKey" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="fieldForm.type">
          <el-option v-for="type in fieldTypes" :key="type" :label="type" :value="type" />
        </el-select>
      </el-form-item>
      <el-form-item label="必填"><el-switch v-model="fieldForm.required" /></el-form-item>
      <el-form-item label="占位文案"><el-input v-model="fieldForm.placeholder" /></el-form-item>
      <el-form-item label="选项 JSON"><el-input v-model="fieldForm.optionsJsonText" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="校验 JSON"><el-input v-model="fieldForm.validationJsonText" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="fieldForm.sortOrder" :min="0" /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="fieldForm.enabled" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="fieldDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveField">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="couponDialogVisible" :title="couponForm.id ? '编辑优惠券' : '新增优惠券'" width="720px">
    <el-form :model="couponForm" label-width="120px">
      <el-form-item label="券码"><el-input v-model="couponForm.code" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="couponForm.name" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="couponForm.type">
          <el-option label="固定金额" value="AMOUNT" />
          <el-option label="百分比" value="PERCENT" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="couponForm.type === 'AMOUNT'" label="优惠金额(元)">
        <el-input-number v-model="couponForm.discountAmountYuan" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item v-else label="折扣比例">
        <el-input-number v-model="couponForm.discountPercent" :min="1" :max="10000" />
        <span class="form-help">基点：8500 表示 85%</span>
      </el-form-item>
      <el-form-item label="最多优惠(元)"><el-input-number v-model="couponForm.maxDiscountYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="最低金额(元)"><el-input-number v-model="couponForm.minAmountYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="最低张数"><el-input-number v-model="couponForm.minQuantity" :min="0" /></el-form-item>
      <el-form-item label="总次数"><el-input-number v-model="couponForm.totalLimit" :min="0" /></el-form-item>
      <el-form-item label="每人次数"><el-input-number v-model="couponForm.perUserLimit" :min="0" /></el-form-item>
      <el-form-item label="限定会议">
        <el-select v-model="couponForm.conferenceId" clearable placeholder="全部会议">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="限定规格 ID"><el-input v-model="couponForm.allowedSkuIdsText" placeholder="多个 ID 用英文逗号分隔" /></el-form-item>
      <el-form-item label="开始时间"><el-date-picker v-model="couponForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" clearable /></el-form-item>
      <el-form-item label="结束时间"><el-date-picker v-model="couponForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" clearable /></el-form-item>
      <el-form-item label="可与满减叠加"><el-switch v-model="couponForm.stackableWithPromotion" /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="couponForm.enabled" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="couponDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveCoupon">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="promotionDialogVisible" :title="promotionForm.id ? '编辑满减' : '新增满减'" width="700px">
    <el-form :model="promotionForm" label-width="120px">
      <el-form-item label="名称"><el-input v-model="promotionForm.name" /></el-form-item>
      <el-form-item label="限定会议">
        <el-select v-model="promotionForm.conferenceId" clearable placeholder="全部会议">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="限定规格 ID"><el-input v-model="promotionForm.allowedSkuIdsText" placeholder="多个 ID 用英文逗号分隔" /></el-form-item>
      <el-form-item label="最低金额(元)"><el-input-number v-model="promotionForm.minAmountYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="最低张数"><el-input-number v-model="promotionForm.minQuantity" :min="0" /></el-form-item>
      <el-form-item label="优惠金额(元)"><el-input-number v-model="promotionForm.discountAmountYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="开始时间"><el-date-picker v-model="promotionForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" clearable /></el-form-item>
      <el-form-item label="结束时间"><el-date-picker v-model="promotionForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" clearable /></el-form-item>
      <el-form-item label="可与券叠加"><el-switch v-model="promotionForm.stackableWithCoupon" /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="promotionForm.enabled" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="promotionDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="savePromotionRule">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="orderDetailVisible" title="订单详情" width="840px">
    <div v-if="selectedOrderDetail" class="detail-stack">
      <section>
        <h3>用户微信资料</h3>
        <div class="wechat-user">
          <el-avatar shape="square" :size="56" :src="selectedOrderDetail.user?.wechatAvatarUrl || undefined">
            {{ avatarText(selectedOrderDetail.user) }}
          </el-avatar>
          <div>
            <div>微信昵称：{{ wechatNickname(selectedOrderDetail.user) }}</div>
            <div>openid：{{ selectedOrderDetail.user?.openid || "-" }}</div>
            <div>注册时间：{{ userTime(selectedOrderDetail.user?.registeredAt) }}</div>
            <div>最近活跃：{{ userTime(selectedOrderDetail.user?.lastActiveAt) }}</div>
          </div>
        </div>
      </section>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ selectedOrderDetail.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="订单状态">{{ selectedOrderDetail.status }}</el-descriptions-item>
        <el-descriptions-item label="报名姓名">{{ selectedOrderDetail.attendeeName || "-" }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ selectedOrderDetail.phone || "-" }}</el-descriptions-item>
        <el-descriptions-item label="原价金额">¥{{ formatCent(selectedOrderDetail.originAmountCent) }}</el-descriptions-item>
        <el-descriptions-item label="优惠金额">¥{{ formatCent(selectedOrderDetail.discountAmountCent) }}</el-descriptions-item>
        <el-descriptions-item label="应付金额">¥{{ formatCent(selectedOrderDetail.payableAmountCent) }}</el-descriptions-item>
        <el-descriptions-item label="实付金额">{{ selectedOrderDetail.paidAmountCent === null ? "-" : `¥${formatCent(selectedOrderDetail.paidAmountCent)}` }}</el-descriptions-item>
      </el-descriptions>
      <section>
        <h3>优惠明细</h3>
        <el-table :data="selectedOrderDetail.discounts" border>
          <el-table-column prop="type" label="类型" width="130" />
          <el-table-column prop="title" label="名称" min-width="180" />
          <el-table-column label="金额" width="120">
            <template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template>
          </el-table-column>
        </el-table>
      </section>
      <section>
        <h3>支付信息</h3>
        <el-table :data="selectedOrderDetail.payments" border>
          <el-table-column prop="provider" label="渠道" width="100" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180">
            <template #default="{ row }">{{ row.transactionId || "-" }}</template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ typeof row.amountCent === "number" ? `¥${formatCent(row.amountCent)}` : "-" }}</template>
          </el-table-column>
        </el-table>
      </section>
      <section>
        <h3>报名信息</h3>
        <pre class="json-block">{{ formatJson(selectedOrderDetail.submittedFormJson) }}</pre>
      </section>
    </div>
  </el-dialog>

  <el-dialog v-model="registrationDetailVisible" title="报名详情" width="840px">
    <div v-if="selectedRegistrationDetail" class="detail-stack">
      <section>
        <h3>用户信息</h3>
        <div class="wechat-user">
          <el-avatar shape="square" :size="56" :src="selectedRegistrationDetail.user?.wechatAvatarUrl || undefined">
            {{ avatarText(selectedRegistrationDetail.user) }}
          </el-avatar>
          <div>
            <div>微信昵称：{{ wechatNickname(selectedRegistrationDetail.user) }}</div>
            <div>openid：{{ selectedRegistrationDetail.user?.openid || "-" }}</div>
            <div>注册时间：{{ userTime(selectedRegistrationDetail.user?.registeredAt) }}</div>
            <div>最近活跃：{{ userTime(selectedRegistrationDetail.user?.lastActiveAt) }}</div>
            <div>报名姓名：{{ selectedRegistrationDetail.attendeeName }}</div>
            <div>手机号：{{ selectedRegistrationDetail.phone }}</div>
          </div>
        </div>
      </section>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="报名号">{{ selectedRegistrationDetail.registrationNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ selectedRegistrationDetail.status }}</el-descriptions-item>
        <el-descriptions-item label="会议">{{ selectedRegistrationDetail.conferenceTitle }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ selectedRegistrationDetail.skuName }}</el-descriptions-item>
        <el-descriptions-item label="订单号">{{ selectedRegistrationDetail.order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="支付金额">¥{{ formatCent(selectedRegistrationDetail.paidAmountCent) }}</el-descriptions-item>
      </el-descriptions>
      <section>
        <h3>支付信息</h3>
        <el-table :data="selectedRegistrationDetail.order.payments" border>
          <el-table-column prop="provider" label="渠道" width="100" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180">
            <template #default="{ row }">{{ row.transactionId || "-" }}</template>
          </el-table-column>
        </el-table>
      </section>
      <section>
        <h3>参会人</h3>
        <el-table :data="selectedRegistrationDetail.attendees" border>
          <el-table-column prop="skuName" label="规格" min-width="120" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="phone" label="手机" width="140" />
          <el-table-column prop="company" label="单位" min-width="140">
            <template #default="{ row }">{{ row.company || "-" }}</template>
          </el-table-column>
          <el-table-column prop="title" label="职位" width="120">
            <template #default="{ row }">{{ row.title || "-" }}</template>
          </el-table-column>
          <el-table-column label="核销状态" width="130">
            <template #default="{ row }">{{ checkInStatusText(row.checkInStatus) }}</template>
          </el-table-column>
          <el-table-column label="核销时间" width="170">
            <template #default="{ row }">{{ row.checkedInAt ? formatDate(row.checkedInAt) : "-" }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.checkInStatus !== 'PENDING'" @click="checkInAttendee(row.id)">
                确认核销
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
      <section>
        <h3>内部备注</h3>
        <el-input v-model="registrationRemarkDraft" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="仅后台可见" />
        <div class="dialog-actions">
          <span class="muted-text">
            最近更新：{{ selectedRegistrationDetail.remarkUpdatedAt ? formatDate(selectedRegistrationDetail.remarkUpdatedAt) : "暂无" }}
          </span>
          <el-button type="primary" :loading="registrationRemarkSaving" @click="saveRegistrationRemark">保存备注</el-button>
        </div>
      </section>
      <section>
        <h3>报名表单</h3>
        <pre class="json-block">{{ formatJson(selectedRegistrationDetail.formDataJson) }}</pre>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  createConference,
  createCoupon,
  createFormField,
  createPromotionRule,
  createSku,
  disableFormField,
  getAdminMe,
  getOrder,
  getRegistration,
  checkInRegistrationAttendee,
  listConferences,
  listCoupons,
  listFormFields,
  listOrders,
  listPromotionRules,
  listRegistrations,
  listSkus,
  loginAdmin,
  updateConference,
  updateConferenceCheckInConfig,
  updateConferenceStatus,
  updateCoupon,
  updateFormField,
  updatePromotionRule,
  updateRegistrationRemark,
  updateSku
} from "./services/admin";
import { clearAdminToken, getAdminToken } from "./services/api";
import type {
  AdminOrder,
  AdminOrderDetail,
  AdminRegistration,
  AdminRegistrationDetail,
  AdminUser,
  AdminWechatUser,
  Conference,
  Coupon,
  FormField,
  PromotionRule,
  Sku
} from "./services/types";

type ViewName = "dashboard" | "conferences" | "skus" | "fields" | "coupons" | "promotions" | "orders" | "registrations";

const admin = ref<AdminUser | null>(null);
const activeView = ref<ViewName>("dashboard");
const loading = ref(false);
const loginForm = reactive({ username: "admin", password: "" });

const conferences = ref<Conference[]>([]);
const selectedConferenceId = ref("");
const skus = ref<Sku[]>([]);
const fields = ref<FormField[]>([]);
const coupons = ref<Coupon[]>([]);
const promotionRules = ref<PromotionRule[]>([]);
const orders = ref<AdminOrder[]>([]);
const registrations = ref<AdminRegistration[]>([]);
const selectedOrderDetail = ref<AdminOrderDetail | null>(null);
const selectedRegistrationDetail = ref<AdminRegistrationDetail | null>(null);
const orderDetailVisible = ref(false);
const registrationDetailVisible = ref(false);
const registrationRemarkDraft = ref("");
const registrationRemarkSaving = ref(false);
const orderKeyword = ref("");
const registrationKeyword = ref("");
const couponKeyword = ref("");
const promotionKeyword = ref("");

const conferenceDialogVisible = ref(false);
const skuDialogVisible = ref(false);
const fieldDialogVisible = ref(false);
const couponDialogVisible = ref(false);
const promotionDialogVisible = ref(false);
const fieldTypes = ["TEXT", "TEXTAREA", "PHONE", "EMAIL", "SELECT", "RADIO", "CHECKBOX", "DATE"] as const;

const conferenceForm = reactive({
  id: "",
  title: "",
  subtitle: "",
  coverImage: "",
  startAt: "",
  endAt: "",
  location: "",
  status: "DRAFT",
  checkInEnabled: false,
  groupRegistrationEnabled: true,
  maxTicketsPerOrder: 0,
  sortOrder: 0,
  contentJsonText: "{}",
  styleJsonText: "{}"
});

const skuForm = reactive({
  id: "",
  name: "",
  description: "",
  priceYuan: 0,
  stock: 0,
  status: "ACTIVE"
});

const fieldForm = reactive({
  id: "",
  label: "",
  fieldKey: "",
  type: "TEXT",
  required: false,
  placeholder: "",
  optionsJsonText: "[]",
  validationJsonText: "{}",
  sortOrder: 0,
  enabled: true
});

const couponForm = reactive({
  id: "",
  code: "",
  name: "",
  type: "AMOUNT" as Coupon["type"],
  discountAmountYuan: 0,
  discountPercent: 8500,
  maxDiscountYuan: 0,
  minAmountYuan: 0,
  minQuantity: 0,
  totalLimit: 0,
  perUserLimit: 0,
  enabled: true,
  startAt: "",
  endAt: "",
  stackableWithPromotion: false,
  conferenceId: "",
  allowedSkuIdsText: ""
});

const promotionForm = reactive({
  id: "",
  name: "",
  conferenceId: "",
  allowedSkuIdsText: "",
  minAmountYuan: 0,
  minQuantity: 0,
  discountAmountYuan: 0,
  enabled: true,
  startAt: "",
  endAt: "",
  stackableWithCoupon: false
});

const selectedConference = computed(() => conferences.value.find((item) => item.id === selectedConferenceId.value) ?? null);

onMounted(async () => {
  if (!getAdminToken()) {
    return;
  }

  try {
    const me = await getAdminMe();
    admin.value = me.admin;
    await loadConferences();
  } catch {
    clearAdminToken();
  }
});

async function submitLogin() {
  loading.value = true;
  try {
    admin.value = await loginAdmin(loginForm.username, loginForm.password);
    await loadConferences();
    ElMessage.success("登录成功");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loading.value = false;
  }
}

function logout() {
  clearAdminToken();
  admin.value = null;
}

async function setView(index: string) {
  activeView.value = index as ViewName;
  if (activeView.value === "conferences") await loadConferences();
  if (activeView.value === "skus") await loadSkus();
  if (activeView.value === "fields") await loadFields();
  if (activeView.value === "coupons") await loadCoupons();
  if (activeView.value === "promotions") await loadPromotionRules();
  if (activeView.value === "orders") await loadOrders();
  if (activeView.value === "registrations") await loadRegistrations();
}

async function loadConferences() {
  const data = await listConferences({ page: 1, pageSize: 50 });
  conferences.value = data.items;
  if (!selectedConferenceId.value && conferences.value[0]) {
    selectedConferenceId.value = conferences.value[0].id;
  }
}

async function loadSkus() {
  await loadConferences();
  if (!selectedConferenceId.value) return;
  skus.value = (await listSkus(selectedConferenceId.value)).items;
}

async function loadFields() {
  await loadConferences();
  if (!selectedConferenceId.value) return;
  fields.value = (await listFormFields(selectedConferenceId.value)).items;
}

async function loadCoupons() {
  await loadConferences();
  coupons.value = (await listCoupons({ page: 1, pageSize: 50, keyword: couponKeyword.value })).items;
}

async function loadPromotionRules() {
  await loadConferences();
  promotionRules.value = (await listPromotionRules({ page: 1, pageSize: 50, keyword: promotionKeyword.value })).items;
}

async function loadOrders() {
  orders.value = (await listOrders({ page: 1, pageSize: 50, keyword: orderKeyword.value })).items;
}

async function loadRegistrations() {
  registrations.value = (await listRegistrations({ page: 1, pageSize: 50, keyword: registrationKeyword.value })).items;
}

async function openOrderDetail(orderNo: string) {
  try {
    selectedOrderDetail.value = await getOrder(orderNo);
    orderDetailVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "订单详情加载失败");
  }
}

async function openRegistrationDetail(id: string) {
  try {
    selectedRegistrationDetail.value = await getRegistration(id);
    registrationRemarkDraft.value = selectedRegistrationDetail.value.adminRemark ?? "";
    registrationDetailVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "报名详情加载失败");
  }
}

async function saveRegistrationRemark() {
  if (!selectedRegistrationDetail.value) return;

  registrationRemarkSaving.value = true;
  try {
    selectedRegistrationDetail.value = await updateRegistrationRemark(
      selectedRegistrationDetail.value.id,
      registrationRemarkDraft.value
    );
    registrationRemarkDraft.value = selectedRegistrationDetail.value.adminRemark ?? "";
    await loadRegistrations();
    ElMessage.success("备注已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "备注保存失败");
  } finally {
    registrationRemarkSaving.value = false;
  }
}

function selectConference(row: Conference, view: ViewName) {
  selectedConferenceId.value = row.id;
  void setView(view);
}

function openConferenceCreate() {
  Object.assign(conferenceForm, {
    id: "",
    title: "",
    subtitle: "",
    coverImage: "",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    location: "",
    status: "DRAFT",
    checkInEnabled: false,
    groupRegistrationEnabled: true,
    maxTicketsPerOrder: 0,
    sortOrder: 0,
    contentJsonText: "{}",
    styleJsonText: "{}"
  });
  conferenceDialogVisible.value = true;
}

function openConferenceEdit(row: Conference) {
  Object.assign(conferenceForm, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    coverImage: row.coverImage ?? "",
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location ?? "",
    status: row.status,
    checkInEnabled: row.checkInEnabled,
    groupRegistrationEnabled: row.groupRegistrationEnabled,
    maxTicketsPerOrder: row.maxTicketsPerOrder ?? 0,
    sortOrder: row.sortOrder,
    contentJsonText: JSON.stringify(row.contentJson ?? {}, null, 2),
    styleJsonText: JSON.stringify(row.styleJson ?? {}, null, 2)
  });
  conferenceDialogVisible.value = true;
}

async function saveConference() {
  try {
    const payload = {
      title: conferenceForm.title,
      subtitle: conferenceForm.subtitle,
      coverImage: conferenceForm.coverImage,
      startAt: conferenceForm.startAt,
      endAt: conferenceForm.endAt,
      location: conferenceForm.location,
      status: conferenceForm.status,
      groupRegistrationEnabled: conferenceForm.groupRegistrationEnabled,
      maxTicketsPerOrder: conferenceForm.maxTicketsPerOrder > 0 ? conferenceForm.maxTicketsPerOrder : null,
      sortOrder: conferenceForm.sortOrder,
      contentJson: parseJsonObject(conferenceForm.contentJsonText),
      styleJson: parseJsonObject(conferenceForm.styleJsonText)
    };
    if (conferenceForm.id) {
      await updateConference(conferenceForm.id, payload);
      await updateConferenceCheckInConfig(conferenceForm.id, conferenceForm.checkInEnabled);
    } else {
      const created = await createConference(payload);
      if (conferenceForm.checkInEnabled) {
        await updateConferenceCheckInConfig(created.id, true);
      }
    }
    conferenceDialogVisible.value = false;
    await loadConferences();
    ElMessage.success("会议已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function checkInAttendee(id: string) {
  if (!selectedRegistrationDetail.value) return;

  try {
    await checkInRegistrationAttendee(id);
    selectedRegistrationDetail.value = await getRegistration(selectedRegistrationDetail.value.id);
    await loadRegistrations();
    ElMessage.success("核销成功");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "核销失败");
  }
}

async function changeConferenceStatus(id: string, status: string) {
  try {
    await updateConferenceStatus(id, status);
    await loadConferences();
    ElMessage.success("状态已更新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "状态更新失败");
  }
}

function openSkuCreate() {
  Object.assign(skuForm, { id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuDialogVisible.value = true;
}

function openSkuEdit(row: Sku) {
  Object.assign(skuForm, {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    priceYuan: row.priceCent / 100,
    stock: row.stock,
    status: row.status
  });
  skuDialogVisible.value = true;
}

async function saveSku() {
  if (!selectedConference.value) return;
  try {
    const payload = {
      name: skuForm.name,
      description: skuForm.description,
      priceCent: Math.round(skuForm.priceYuan * 100),
      stock: skuForm.stock,
      status: skuForm.status
    };
    if (skuForm.id) {
      await updateSku(skuForm.id, payload);
    } else {
      await createSku(selectedConference.value.id, payload);
    }
    skuDialogVisible.value = false;
    await loadSkus();
    ElMessage.success("规格已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

function openFieldCreate() {
  Object.assign(fieldForm, {
    id: "",
    label: "",
    fieldKey: "",
    type: "TEXT",
    required: false,
    placeholder: "",
    optionsJsonText: "[]",
    validationJsonText: "{}",
    sortOrder: 0,
    enabled: true
  });
  fieldDialogVisible.value = true;
}

function openFieldEdit(row: FormField) {
  Object.assign(fieldForm, {
    id: row.id,
    label: row.label,
    fieldKey: row.fieldKey,
    type: row.type,
    required: row.required,
    placeholder: row.placeholder ?? "",
    optionsJsonText: JSON.stringify(row.optionsJson ?? [], null, 2),
    validationJsonText: JSON.stringify(row.validationJson ?? {}, null, 2),
    sortOrder: row.sortOrder,
    enabled: row.enabled
  });
  fieldDialogVisible.value = true;
}

async function saveField() {
  if (!selectedConference.value) return;
  try {
    const payload = {
      label: fieldForm.label,
      fieldKey: fieldForm.fieldKey,
      type: fieldForm.type,
      required: fieldForm.required,
      placeholder: fieldForm.placeholder,
      optionsJson: parseJsonArray(fieldForm.optionsJsonText),
      validationJson: parseJsonObject(fieldForm.validationJsonText),
      sortOrder: fieldForm.sortOrder,
      enabled: fieldForm.enabled
    };
    if (fieldForm.id) {
      await updateFormField(fieldForm.id, payload);
    } else {
      await createFormField(selectedConference.value.id, payload);
    }
    fieldDialogVisible.value = false;
    await loadFields();
    ElMessage.success("字段已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function disableField(id: string) {
  try {
    await disableFormField(id);
    await loadFields();
    ElMessage.success("字段已停用");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "停用失败");
  }
}

function openCouponCreate() {
  Object.assign(couponForm, {
    id: "",
    code: "",
    name: "",
    type: "AMOUNT",
    discountAmountYuan: 0,
    discountPercent: 8500,
    maxDiscountYuan: 0,
    minAmountYuan: 0,
    minQuantity: 0,
    totalLimit: 0,
    perUserLimit: 0,
    enabled: true,
    startAt: "",
    endAt: "",
    stackableWithPromotion: false,
    conferenceId: "",
    allowedSkuIdsText: ""
  });
  couponDialogVisible.value = true;
}

function openCouponEdit(row: Coupon) {
  Object.assign(couponForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    discountAmountYuan: (row.discountAmountCent ?? 0) / 100,
    discountPercent: row.discountPercent ?? 8500,
    maxDiscountYuan: (row.maxDiscountCent ?? 0) / 100,
    minAmountYuan: (row.minAmountCent ?? 0) / 100,
    minQuantity: row.minQuantity ?? 0,
    totalLimit: row.totalLimit ?? 0,
    perUserLimit: row.perUserLimit ?? 0,
    enabled: row.enabled,
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    stackableWithPromotion: row.stackableWithPromotion,
    conferenceId: row.conferenceId ?? "",
    allowedSkuIdsText: row.allowedSkuIds.join(",")
  });
  couponDialogVisible.value = true;
}

async function saveCoupon() {
  try {
    const payload = {
      code: couponForm.code,
      name: couponForm.name,
      type: couponForm.type,
      discountAmountCent: couponForm.type === "AMOUNT" ? yuanToCent(couponForm.discountAmountYuan) : null,
      discountPercent: couponForm.type === "PERCENT" ? couponForm.discountPercent : null,
      maxDiscountCent: couponForm.maxDiscountYuan > 0 ? yuanToCent(couponForm.maxDiscountYuan) : null,
      minAmountCent: couponForm.minAmountYuan > 0 ? yuanToCent(couponForm.minAmountYuan) : null,
      minQuantity: couponForm.minQuantity > 0 ? couponForm.minQuantity : null,
      totalLimit: couponForm.totalLimit > 0 ? couponForm.totalLimit : null,
      perUserLimit: couponForm.perUserLimit > 0 ? couponForm.perUserLimit : null,
      enabled: couponForm.enabled,
      startAt: couponForm.startAt || null,
      endAt: couponForm.endAt || null,
      stackableWithPromotion: couponForm.stackableWithPromotion,
      conferenceId: couponForm.conferenceId || null,
      allowedSkuIds: parseCsv(couponForm.allowedSkuIdsText)
    };
    if (couponForm.id) {
      await updateCoupon(couponForm.id, payload);
    } else {
      await createCoupon(payload);
    }
    couponDialogVisible.value = false;
    await loadCoupons();
    ElMessage.success("优惠券已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "优惠券保存失败");
  }
}

function openPromotionCreate() {
  Object.assign(promotionForm, {
    id: "",
    name: "",
    conferenceId: "",
    allowedSkuIdsText: "",
    minAmountYuan: 0,
    minQuantity: 0,
    discountAmountYuan: 0,
    enabled: true,
    startAt: "",
    endAt: "",
    stackableWithCoupon: false
  });
  promotionDialogVisible.value = true;
}

function openPromotionEdit(row: PromotionRule) {
  Object.assign(promotionForm, {
    id: row.id,
    name: row.name,
    conferenceId: row.conferenceId ?? "",
    allowedSkuIdsText: row.allowedSkuIds.join(","),
    minAmountYuan: (row.minAmountCent ?? 0) / 100,
    minQuantity: row.minQuantity ?? 0,
    discountAmountYuan: row.discountAmountCent / 100,
    enabled: row.enabled,
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    stackableWithCoupon: row.stackableWithCoupon
  });
  promotionDialogVisible.value = true;
}

async function savePromotionRule() {
  try {
    const payload = {
      name: promotionForm.name,
      conferenceId: promotionForm.conferenceId || null,
      allowedSkuIds: parseCsv(promotionForm.allowedSkuIdsText),
      minAmountCent: promotionForm.minAmountYuan > 0 ? yuanToCent(promotionForm.minAmountYuan) : null,
      minQuantity: promotionForm.minQuantity > 0 ? promotionForm.minQuantity : null,
      discountAmountCent: yuanToCent(promotionForm.discountAmountYuan),
      enabled: promotionForm.enabled,
      startAt: promotionForm.startAt || null,
      endAt: promotionForm.endAt || null,
      stackableWithCoupon: promotionForm.stackableWithCoupon
    };
    if (promotionForm.id) {
      await updatePromotionRule(promotionForm.id, payload);
    } else {
      await createPromotionRule(payload);
    }
    promotionDialogVisible.value = false;
    await loadPromotionRules();
    ElMessage.success("满减规则已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "满减规则保存失败");
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value = JSON.parse(text || "{}") as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON 必须是对象");
  }
  return value as Record<string, unknown>;
}

function parseJsonArray(text: string): unknown[] {
  const value = JSON.parse(text || "[]") as unknown;
  if (!Array.isArray(value)) {
    throw new Error("选项 JSON 必须是数组");
  }
  return value;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function yuanToCent(value: number) {
  return Math.round(value * 100);
}

function parseCsv(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function couponDiscountText(row: Coupon): string {
  if (row.type === "AMOUNT") {
    return `¥${formatCent(row.discountAmountCent ?? 0)}`;
  }
  return `${((row.discountPercent ?? 0) / 100).toFixed(2)}%`;
}

function thresholdText(minAmountCent: number | null, minQuantity: number | null): string {
  const parts = [];
  if (minAmountCent) parts.push(`满 ¥${formatCent(minAmountCent)}`);
  if (minQuantity) parts.push(`满 ${minQuantity} 张`);
  return parts.length > 0 ? parts.join(" / ") : "无门槛";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function userTime(value: string | null | undefined): string {
  return value ? formatDate(value) : "-";
}

function formatCheckInProgress(progress: AdminRegistration["checkInProgress"] | undefined): string {
  if (!progress || progress.total === 0) {
    return "暂无";
  }

  if (progress.notRequired === progress.total) {
    return "无需核销";
  }

  return `${progress.checkedIn}/${progress.total} 已核销`;
}

function checkInStatusText(status: string): string {
  const labels: Record<string, string> = {
    NOT_REQUIRED: "无需核销",
    PENDING: "待核销",
    CHECKED_IN: "已核销",
    CANCELLED: "已取消"
  };
  return labels[status] ?? status;
}

function wechatNickname(user: AdminWechatUser | null): string {
  return user?.wechatNickname?.trim() || "未填写";
}

function avatarText(user: AdminWechatUser | null): string {
  const nickname = user?.wechatNickname?.trim();
  return nickname ? nickname.slice(0, 1) : "未";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}
</script>
