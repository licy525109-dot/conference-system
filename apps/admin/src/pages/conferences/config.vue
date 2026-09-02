<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会议配置详情"
      :subtitle="conference?.title || '请选择会议'"
      eyebrow="会议管理"
      badge="配置中心"
      badge-tone="info"
    >
      <template #actions>
      <div class="inline-actions">
        <el-select v-model="conferenceId" placeholder="选择会议" style="width: 260px" @change="loadAll">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <el-button @click="goBack">返回列表</el-button>
      </div>
      </template>
    </AdminPageHeader>

    <el-tabs v-if="conference" v-model="activeTab" class="data-panel">
      <el-tab-pane label="基础信息" name="basic">
        <el-form :model="conferenceForm" label-width="120px" class="form-panel">
          <div class="form-section-heading">
            <strong>会议信息</strong>
            <span>用于会议列表、详情页和分享卡片展示。</span>
          </div>
          <el-form-item label="标题"><el-input v-model="conferenceForm.title" /></el-form-item>
          <el-form-item label="副标题"><el-input v-model="conferenceForm.subtitle" /></el-form-item>
          <el-form-item label="会议封面"><ConferenceCoverPicker v-model="conferenceForm.coverImage" /></el-form-item>
          <el-form-item label="地点"><el-input v-model="conferenceForm.location" /></el-form-item>

          <div class="form-section-heading">
            <strong>会议时间</strong>
            <span>表示会议实际举办的开始和结束时间，会展示在用户端详情页。</span>
          </div>
          <el-form-item label="会议开始时间">
            <el-date-picker v-model="conferenceForm.startAt" class="date-picker" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="选择会议开始时间" />
          </el-form-item>
          <el-form-item label="会议结束时间">
            <el-date-picker v-model="conferenceForm.endAt" class="date-picker" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="选择会议结束时间" />
          </el-form-item>

          <div class="form-section-heading">
            <strong>报名开放时间</strong>
            <span>控制用户何时可以报名，不是会议举办时间；两项都不填时默认跟随会议时间。</span>
          </div>
          <el-form-item label="报名开始时间">
            <el-date-picker v-model="conferenceForm.registrationStartsAt" class="date-picker" clearable type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="不填则跟随会议开始时间" />
          </el-form-item>
          <el-form-item label="报名截止时间">
            <el-date-picker v-model="conferenceForm.registrationEndsAt" class="date-picker" clearable type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="不填则跟随会议结束时间" />
          </el-form-item>

          <div class="form-section-heading">
            <strong>报名与签到</strong>
            <span>设置报名数量规则以及现场签到方式。</span>
          </div>
          <el-form-item label="启用签到"><el-switch v-model="conferenceForm.checkInEnabled" /></el-form-item>
          <template v-if="conferenceForm.checkInEnabled">
            <el-form-item label="签到时间">
              <div class="date-range">
                <el-date-picker v-model="conferenceForm.checkInStartsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="开始时间" />
                <el-date-picker v-model="conferenceForm.checkInEndsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="结束时间" />
              </div>
            </el-form-item>
            <el-form-item label="签到方式">
              <el-checkbox-group v-model="conferenceForm.checkInMethods">
                <el-checkbox label="QR_SCAN">二维码扫码核销</el-checkbox>
                <el-checkbox label="SELF_PHONE_NAME">客户自助手机号 + 姓名核销</el-checkbox>
                <el-checkbox label="SELF_CUSTOM_FIELDS">客户自助自定义报名字段核销</el-checkbox>
                <el-checkbox label="ADMIN_MANUAL">后台应急补签</el-checkbox>
              </el-checkbox-group>
              <p class="form-help">常规签到建议使用客户自助签到或工作人员扫码；后台应急补签仅用于现场异常处理。</p>
            </el-form-item>
            <template v-if="conferenceForm.checkInMethods.includes('SELF_PHONE_NAME')">
              <el-form-item label="手机号字段">
                <el-select v-model="conferenceForm.checkInFieldBindings.phoneFieldKey" filterable placeholder="选择报名表单字段">
                  <el-option v-for="field in enabledFields" :key="field.id" :label="`${field.label} (${field.fieldKey})`" :value="field.fieldKey" />
                </el-select>
                <p v-if="!hasPhoneLikeField" class="form-warning">当前报名表单未配置手机号字段，无法启用手机号核销</p>
              </el-form-item>
              <el-form-item label="姓名字段">
                <el-select v-model="conferenceForm.checkInFieldBindings.nameFieldKey" filterable placeholder="选择报名表单字段">
                  <el-option v-for="field in enabledFields" :key="field.id" :label="`${field.label} (${field.fieldKey})`" :value="field.fieldKey" />
                </el-select>
                <p v-if="!hasNameLikeField" class="form-warning">当前报名表单未配置姓名字段，无法启用姓名核销</p>
              </el-form-item>
            </template>
            <el-form-item v-if="conferenceForm.checkInMethods.includes('SELF_CUSTOM_FIELDS')" label="自定义字段">
              <el-select v-model="conferenceForm.checkInFieldBindings.customFieldKeys" multiple filterable placeholder="选择报名表单字段">
                <el-option v-for="field in enabledFields" :key="field.id" :label="`${field.label} (${field.fieldKey})`" :value="field.fieldKey" />
              </el-select>
            </el-form-item>
          </template>
          <el-form-item label="团体报名"><el-switch v-model="conferenceForm.groupRegistrationEnabled" /></el-form-item>
          <el-form-item label="单单最大票数"><el-input-number v-model="conferenceForm.maxTicketsPerOrder" :min="0" /></el-form-item>
          <el-form-item><el-button type="primary" @click="saveConference">保存基础配置</el-button></el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="票种配置" name="skus">
        <div class="toolbar">
          <el-button type="primary" @click="openSku()">新增票种</el-button>
        </div>
        <el-table :data="skus" empty-text="暂无票种">
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column label="价格" width="120"><template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template></el-table-column>
          <el-table-column prop="stock" label="库存" width="100" />
          <el-table-column prop="soldCount" label="已售" width="100" />
          <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openSku(row)">编辑</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="报名字段" name="fields">
        <div class="toolbar">
          <el-button type="primary" @click="openField()">新增字段</el-button>
        </div>
        <el-table :data="fields" empty-text="暂无字段">
          <el-table-column prop="label" label="标签" min-width="140" />
          <el-table-column prop="fieldKey" label="字段标识" min-width="140" />
          <el-table-column label="类型" width="120"><template #default="{ row }">{{ fieldTypeText(row.type) }}</template></el-table-column>
          <el-table-column label="必填" width="90"><template #default="{ row }"><AdminStatusBadge :status="row.required" :label="row.required ? '必填' : '选填'" :tone="row.required ? 'warning' : 'neutral'" /></template></el-table-column>
          <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" @click="openField(row)">编辑</el-button>
              <el-button size="small" type="warning" @click="stopField(row.id)">停用</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="优惠配置" name="discounts">
        <AdminFeatureBadge label="后端计价已接入" description="优惠券和满减会参与 quote/create order，最终金额仍由后端重新计算并固化快照。" tone="success" />
        <div class="discount-grid">
          <AdminSectionCard title="优惠券" subtitle="固定金额或折扣券，可限定当前会议。">
            <CouponsPage :conference-id="conferenceId" embedded />
          </AdminSectionCard>
          <AdminSectionCard title="满减规则" subtitle="满金额或满张数优惠，可限定当前会议。">
            <PromotionsPage :conference-id="conferenceId" embedded />
          </AdminSectionCard>
        </div>
      </el-tab-pane>

      <el-tab-pane label="详情内容" name="detail">
        <div class="detail-tab-stack">
          <section class="form-panel">
            <ConferenceDetailRichTextEditor
              ref="detailRichTextEditorRef"
              v-model="detailSections"
              :title="conferenceForm.title"
              :subtitle="conferenceForm.subtitle"
              :cover-image="conferenceForm.coverImage"
              :saving="savingDetailContent"
              :long-image-segments="detailImage.segments"
              @save="saveDetailContent"
              @choose-material="openDetailMaterialPicker('rich-text')"
            />
          </section>

          <section class="form-panel detail-image-panel detail-image-panel--secondary">
          <div class="detail-image-heading">
            <div>
              <h3>整页长图（可选）</h3>
              <p class="muted-text">适合已有完整设计稿的会议。长图会排在富文本内容之后，并自动压缩、切片以保证小程序稳定展示。</p>
            </div>
            <AdminStatusBadge :status="detailImage.segments.length > 0" :label="detailImage.segments.length > 0 ? '已配置' : '未配置'" />
          </div>

          <div v-if="detailImage.segments.length" class="detail-image-workspace">
            <div class="phone-preview">
              <div class="phone-preview-header">{{ conferenceForm.title || "会议详情" }}</div>
              <div class="phone-preview-scroll">
                <img v-for="segment in detailImage.segments" :key="segment.url" :src="segment.url" alt="会议详情长图预览" />
              </div>
            </div>
            <div class="detail-image-meta">
              <strong>当前长图</strong>
              <span>{{ detailImage.width || "-" }} × {{ detailImage.height || "-" }} px</span>
              <span>{{ detailImage.segments.length }} 个展示分片</span>
              <span v-if="detailImage.sizeBytes">{{ formatFileSize(detailImage.sizeBytes) }}</span>
              <p>源图会按顺序无缝展示。若需要经常调整文字和图片，建议使用上方可视化编辑器。</p>
            </div>
          </div>

          <div v-else class="detail-image-empty">
            <Picture class="detail-image-empty-icon" />
            <strong>还没有会议详情长图</strong>
            <span>建议源图宽度不低于 750px，JPG、PNG 或 WebP，原图不超过 20MB。</span>
          </div>

          <el-progress v-if="uploadingDetailImage" :percentage="detailImageUploadProgress" :stroke-width="8" />
          <div class="detail-image-actions">
            <el-button type="primary" :icon="Upload" :loading="uploadingDetailImage" @click="triggerDetailImageUpload">
              {{ detailImage.segments.length ? "替换长图" : "上传长图" }}
            </el-button>
            <el-button :icon="FolderOpened" :disabled="uploadingDetailImage" @click="openDetailMaterialPicker('long-image')">从素材库选择</el-button>
            <el-button v-if="detailImage.segments.length" type="danger" plain :icon="Delete" :disabled="uploadingDetailImage" @click="removeDetailImage">删除长图</el-button>
          </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="发布设置" name="publish">
        <section class="form-panel publish-panel">
          <div>
            <h3>当前发布状态</h3>
            <p class="muted-text">会议上下架仍在会议管理列表中操作，避免配置页误触影响用户端报名入口。</p>
          </div>
          <AdminStatusBadge :status="conference.status" />
          <el-button @click="goBack">返回会议管理调整状态</el-button>
        </section>
      </el-tab-pane>
    </el-tabs>

    <section v-else class="data-panel">
      <p class="muted-text">暂无会议，请先创建会议。</p>
    </section>

    <el-dialog v-model="skuDialogVisible" :title="skuForm.id ? '编辑票种' : '新增票种'" width="560px">
      <el-form :model="skuForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="skuForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="skuForm.description" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="skuForm.status"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="INACTIVE" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="skuDialogVisible = false">取消</el-button><el-button type="primary" @click="saveSku">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="fieldDialogVisible" :title="fieldForm.id ? '编辑字段' : '新增字段'" width="620px">
      <el-form :model="fieldForm" label-width="110px">
        <el-form-item>
          <template #label>标签<FieldHelp content="这是用户端表单展示名称，例如“姓名”“公司”“手机号”。" /></template>
          <el-input v-model="fieldForm.label" placeholder="例如：姓名" />
        </el-form-item>
        <el-form-item>
          <template #label>字段标识<FieldHelp content="用于数据存储、导出和签到字段绑定，建议使用拼音或英文数字，例如 name、phone、company。" /></template>
          <el-input v-model="fieldForm.fieldKey" placeholder="例如：name / phone / company" />
        </el-form-item>
        <el-form-item label="类型"><el-select v-model="fieldForm.type"><el-option v-for="type in fieldTypes" :key="type" :label="fieldTypeText(type)" :value="type" /></el-select></el-form-item>
        <el-form-item label="必填"><el-switch v-model="fieldForm.required" /></el-form-item>
        <el-form-item>
          <template #label>占位文案<FieldHelp content="这是输入框内的提示语，例如“请输入姓名”。" /></template>
          <el-input v-model="fieldForm.placeholder" placeholder="例如：请输入姓名" />
        </el-form-item>
        <el-form-item v-if="isOptionField" label="选项内容"><el-input v-model="fieldForm.optionsText" type="textarea" :rows="3" placeholder="每行一个选项，仅下拉、单选、多选需要配置" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="fieldForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="fieldForm.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="fieldDialogVisible = false">取消</el-button><el-button type="primary" @click="saveField">保存</el-button></template>
    </el-dialog>

    <el-dialog
      v-model="detailMaterialVisible"
      :title="detailMaterialTarget === 'rich-text' ? '选择详情内容图片' : '选择会议详情长图'"
      width="820px"
      @closed="detailMaterialTarget = 'long-image'"
    >
      <div class="material-picker">
        <div class="material-search">
          <el-input v-model="detailMaterialKeyword" clearable placeholder="搜索图片素材" @keyup.enter="loadDetailMaterials" />
          <el-button :loading="detailMaterialLoading" @click="loadDetailMaterials">搜索</el-button>
        </div>
        <p class="form-help">
          {{ detailMaterialTarget === "rich-text" ? "选择后会插入当前光标位置，保存详情后同步发布到 H5 和小程序。" : "选择已有素材时将作为一张完整详情图展示；超长源图建议使用“上传长图”，系统会自动压缩切片。" }}
        </p>
        <el-empty v-if="!detailMaterialLoading && detailMaterialAssets.length === 0" description="暂无可用图片素材" />
        <div v-else class="material-grid">
          <button v-for="asset in detailMaterialAssets" :key="asset.id" class="material-card" @click="chooseDetailMaterial(asset)">
            <img :src="asset.url" :alt="asset.name" />
            <strong>{{ asset.name }}</strong>
            <span>{{ asset.width || "-" }} × {{ asset.height || "-" }}</span>
          </button>
        </div>
      </div>
    </el-dialog>

    <input ref="detailImageInput" class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp" @change="handleDetailImageUpload" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, FolderOpened, Picture, Upload } from "@element-plus/icons-vue";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import ConferenceCoverPicker from "../../components/conference/ConferenceCoverPicker.vue";
import ConferenceDetailRichTextEditor from "../../components/conference/ConferenceDetailRichTextEditor.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import CouponsPage from "../coupons/index.vue";
import PromotionsPage from "../promotions/index.vue";
import { navigateTo, routeQuery } from "../../router";
import {
  createFormField,
  createMaterial,
  createSku,
  disableFormField,
  getConference,
  listConferences,
  listFormFields,
  listMaterials,
  listSkus,
  updateConference,
  updateConferenceCheckInConfig,
  updateFormField,
  updateSku
} from "../../services/admin";
import type { Conference, FormField, MaterialAsset, Sku } from "../../services/types";
import { isConferenceDetailImageAsset, prepareConferenceDetailImage } from "../../utils/conferenceDetailImage";
import {
  hasConferenceDetailSectionsContract,
  hasConferenceDetailRichTextContract,
  normalizeConferenceDetailContent,
  normalizeConferenceDetailRichText,
  normalizeConferenceDetailSections,
  serializeConferenceDetailSections
} from "@conference/shared";
import {
  conferenceDetailBlocksToEditorHtml,
  conferenceDetailRichTextToEditorHtml,
  createConferenceDetailRichText
} from "../../utils/conferenceDetailRichText";

const conferences = ref<Conference[]>([]);
const conferenceId = ref("");
const selectedConference = ref<Conference | null>(null);
const conference = computed(() => selectedConference.value);
const skus = ref<Sku[]>([]);
const fields = ref<FormField[]>([]);
const activeTab = ref("basic");
const skuDialogVisible = ref(false);
const fieldDialogVisible = ref(false);
const detailMaterialVisible = ref(false);
const detailMaterialLoading = ref(false);
const detailMaterialKeyword = ref("");
const detailMaterialAssets = ref<MaterialAsset[]>([]);
const detailImageInput = ref<HTMLInputElement | null>(null);
const detailRichTextEditorRef = ref<{ insertImage: (url: string, alt?: string) => boolean } | null>(null);
const uploadingDetailImage = ref(false);
const detailImageUploadProgress = ref(0);
const detailMaterialTarget = ref<"rich-text" | "long-image">("long-image");
const savingDetailContent = ref(false);
const fieldTypes = ["TEXT", "TEXTAREA", "PHONE", "EMAIL", "SELECT", "RADIO", "CHECKBOX", "DATE"] as const;

const conferenceForm = reactive({
  title: "",
  subtitle: "",
  coverImage: "",
  location: "",
  startAt: "",
  endAt: "",
  registrationStartsAt: "",
  registrationEndsAt: "",
  checkInEnabled: false,
  checkInStartsAt: "",
  checkInEndsAt: "",
  checkInMethods: ["QR_SCAN", "ADMIN_MANUAL"] as string[],
  checkInFieldBindings: {
    phoneFieldKey: "",
    nameFieldKey: "",
    customFieldKeys: [] as string[]
  },
  groupRegistrationEnabled: true,
  maxTicketsPerOrder: 0
});
const detailImage = reactive(createEmptyDetailImage());
const detailSections = ref<DetailSectionDraft[]>([]);
const skuForm = reactive({ id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
const fieldForm = reactive({
  id: "",
  label: "",
  fieldKey: "",
  type: "TEXT",
  required: false,
  placeholder: "",
  optionsText: "",
  sortOrder: 0,
  enabled: true
});

onMounted(async () => {
  conferenceId.value = routeQuery.value.id ?? "";
  await loadAll();
});

const enabledFields = computed(() => fields.value.filter((field) => field.enabled));
const hasPhoneLikeField = computed(() => enabledFields.value.some((field) => field.type === "PHONE" || /手机|电话|phone|mobile/i.test(`${field.label}${field.fieldKey}`)));
const hasNameLikeField = computed(() => enabledFields.value.some((field) => /姓名|名称|name/i.test(`${field.label}${field.fieldKey}`)));
const isOptionField = computed(() => ["SELECT", "RADIO", "CHECKBOX"].includes(fieldForm.type));

watch(
  () => fieldForm.type,
  async (value, oldValue) => {
    if (!["SELECT", "RADIO", "CHECKBOX"].includes(oldValue) || ["SELECT", "RADIO", "CHECKBOX"].includes(value) || !fieldForm.optionsText.trim()) return;
    try {
      await ElMessageBox.confirm("切换为非选项型字段将清空选项内容，确认继续？", "清空选项内容", {
        confirmButtonText: "确认清空",
        cancelButtonText: "取消",
        type: "warning"
      });
      fieldForm.optionsText = "";
    } catch {
      fieldForm.type = oldValue;
    }
  }
);

async function loadAll() {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
  if (!conferenceId.value && conferences.value[0]) {
    conferenceId.value = conferences.value[0].id;
  }
  if (conferenceId.value) {
    const [detail, skuResponse, fieldResponse] = await Promise.all([
      getConference(conferenceId.value),
      listSkus(conferenceId.value),
      listFormFields(conferenceId.value)
    ]);
    selectedConference.value = detail;
    skus.value = skuResponse.items;
    fields.value = fieldResponse.items;
    syncConferenceForm();
  } else {
    selectedConference.value = null;
    skus.value = [];
    fields.value = [];
  }
}

function syncConferenceForm() {
  if (!conference.value) return;
  const contentJson = readRecord(conference.value.contentJson);
  Object.assign(conferenceForm, {
    title: conference.value.title,
    subtitle: conference.value.subtitle ?? "",
    coverImage: conference.value.coverImage ?? "",
    location: conference.value.location ?? "",
    startAt: conference.value.startAt,
    endAt: conference.value.endAt,
    registrationStartsAt: conference.value.registrationStartsAt ?? "",
    registrationEndsAt: conference.value.registrationEndsAt ?? "",
    checkInEnabled: conference.value.checkInEnabled,
    checkInStartsAt: conference.value.checkInStartsAt ?? "",
    checkInEndsAt: conference.value.checkInEndsAt ?? "",
    checkInMethods: conference.value.checkInMethods?.length ? [...conference.value.checkInMethods] : ["QR_SCAN", "ADMIN_MANUAL"],
    checkInFieldBindings: {
      phoneFieldKey: typeof conference.value.checkInFieldBindings?.phoneFieldKey === "string" ? conference.value.checkInFieldBindings.phoneFieldKey : "",
      nameFieldKey: typeof conference.value.checkInFieldBindings?.nameFieldKey === "string" ? conference.value.checkInFieldBindings.nameFieldKey : "",
      customFieldKeys: readStringArray(conference.value.checkInFieldBindings?.customFieldKeys)
    },
    groupRegistrationEnabled: conference.value.groupRegistrationEnabled,
    maxTicketsPerOrder: conference.value.maxTicketsPerOrder ?? 0
  });
  Object.assign(detailImage, normalizeDetailImage(contentJson));
  if (hasConferenceDetailSectionsContract(contentJson)) {
    const savedSections = normalizeConferenceDetailSections(contentJson).items;
    detailSections.value = savedSections.map((section) => ({
      id: section.id,
      title: section.title,
      enabled: section.enabled,
      html: conferenceDetailRichTextToEditorHtml(section.content)
    }));
    if (detailSections.value.length === 0) detailSections.value = [createDefaultDetailSection()];
  } else {
    const legacyHtml = hasConferenceDetailRichTextContract(contentJson)
      ? conferenceDetailRichTextToEditorHtml(normalizeConferenceDetailRichText(contentJson))
      : conferenceDetailBlocksToEditorHtml(normalizeConferenceDetailContent(contentJson).blocks);
    detailSections.value = [{ ...createDefaultDetailSection(), html: legacyHtml || "<p><br></p>" }];
  }
}

async function saveConference() {
  if (!conferenceId.value) return;
  if (!validateConferenceTimes()) return;
  await updateConference(conferenceId.value, {
    title: conferenceForm.title,
    subtitle: conferenceForm.subtitle,
    coverImage: conferenceForm.coverImage,
    location: conferenceForm.location,
    startAt: conferenceForm.startAt,
    endAt: conferenceForm.endAt,
    registrationStartsAt: conferenceForm.registrationStartsAt || null,
    registrationEndsAt: conferenceForm.registrationEndsAt || null,
    groupRegistrationEnabled: conferenceForm.groupRegistrationEnabled,
    maxTicketsPerOrder: conferenceForm.maxTicketsPerOrder > 0 ? conferenceForm.maxTicketsPerOrder : null
  });
  await updateConferenceCheckInConfig(conferenceId.value, {
    checkInEnabled: conferenceForm.checkInEnabled,
    checkInStartsAt: conferenceForm.checkInStartsAt || null,
    checkInEndsAt: conferenceForm.checkInEndsAt || null,
    checkInMethods: conferenceForm.checkInMethods,
    checkInFieldBindings: conferenceForm.checkInFieldBindings
  });
  await loadAll();
  ElMessage.success("会议配置已保存");
}

function validateConferenceTimes(): boolean {
  if (!conferenceForm.startAt || !conferenceForm.endAt) {
    ElMessage.warning("请完整填写会议开始和结束时间");
    return false;
  }
  if (new Date(conferenceForm.startAt) >= new Date(conferenceForm.endAt)) {
    ElMessage.warning("会议开始时间必须早于会议结束时间");
    return false;
  }
  const hasRegistrationStart = Boolean(conferenceForm.registrationStartsAt);
  const hasRegistrationEnd = Boolean(conferenceForm.registrationEndsAt);
  if (hasRegistrationStart !== hasRegistrationEnd) {
    ElMessage.warning("报名开始和截止时间请同时填写，或同时留空跟随会议时间");
    return false;
  }
  if (
    conferenceForm.registrationStartsAt
    && conferenceForm.registrationEndsAt
    && new Date(conferenceForm.registrationStartsAt) >= new Date(conferenceForm.registrationEndsAt)
  ) {
    ElMessage.warning("报名开始时间必须早于报名截止时间");
    return false;
  }
  return true;
}

function openSku(row?: Sku) {
  Object.assign(skuForm, row ? {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    priceYuan: row.priceCent / 100,
    stock: row.stock,
    status: row.status
  } : { id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuDialogVisible.value = true;
}

async function saveSku() {
  if (!conferenceId.value) return;
  const payload = {
    name: skuForm.name,
    description: skuForm.description,
    priceCent: Math.round(skuForm.priceYuan * 100),
    stock: skuForm.stock,
    status: skuForm.status
  };
  if (skuForm.id) await updateSku(skuForm.id, payload);
  else await createSku(conferenceId.value, payload);
  skuDialogVisible.value = false;
  skus.value = (await listSkus(conferenceId.value)).items;
}

function openField(row?: FormField) {
  Object.assign(fieldForm, row ? {
    id: row.id,
    label: row.label,
    fieldKey: row.fieldKey,
    type: row.type,
    required: row.required,
    placeholder: row.placeholder ?? "",
    optionsText: optionsToText(row.optionsJson),
    sortOrder: row.sortOrder,
    enabled: row.enabled
  } : {
    id: "",
    label: "",
    fieldKey: "",
    type: "TEXT",
    required: false,
    placeholder: "",
    optionsText: "",
    sortOrder: 0,
    enabled: true
  });
  fieldDialogVisible.value = true;
}

async function saveField() {
  if (!conferenceId.value) return;
  if (!fieldForm.label.trim()) {
    ElMessage.warning("标签必填");
    return;
  }
  if (!fieldForm.fieldKey.trim()) {
    ElMessage.warning("字段标识必填");
    return;
  }
  if (isOptionField.value && !fieldForm.optionsText.trim()) {
    ElMessage.warning("下拉、单选、多选字段至少需要一个选项");
    return;
  }
  const payload = {
    label: fieldForm.label.trim(),
    fieldKey: fieldForm.fieldKey.trim(),
    type: fieldForm.type,
    required: fieldForm.required,
    placeholder: fieldForm.placeholder,
    optionsJson: isOptionField.value ? textToOptions(fieldForm.optionsText) : [],
    validationJson: {},
    sortOrder: fieldForm.sortOrder,
    enabled: fieldForm.enabled
  };
  if (fieldForm.id) await updateFormField(fieldForm.id, payload);
  else await createFormField(conferenceId.value, payload);
  fieldDialogVisible.value = false;
  fields.value = (await listFormFields(conferenceId.value)).items;
}

async function stopField(id: string) {
  await ElMessageBox.confirm("确认停用该报名字段？已提交的历史报名数据不会被删除。", "停用报名字段", {
    confirmButtonText: "确认停用",
    cancelButtonText: "取消",
    type: "warning"
  });
  await disableFormField(id);
  if (conferenceId.value) fields.value = (await listFormFields(conferenceId.value)).items;
}

function goBack() {
  navigateTo("/conferences");
}

function triggerDetailImageUpload() {
  detailImageInput.value?.click();
}

async function handleDetailImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !conferenceId.value) return;

  uploadingDetailImage.value = true;
  detailImageUploadProgress.value = 1;
  try {
    const prepared = await prepareConferenceDetailImage(file);
    const assets: MaterialAsset[] = [];
    for (let index = 0; index < prepared.segments.length; index += 1) {
      const segment = prepared.segments[index];
      const asset = await createMaterial({
        name: `${file.name.replace(/\.[^.]+$/, "")} ${index + 1}/${prepared.segments.length}`,
        usage: "conference_detail",
        remark: `会议详情长图自动切片 ${index + 1}/${prepared.segments.length}`,
        file: segment.file,
        width: segment.width,
        height: segment.height,
        onProgress: (percent) => {
          detailImageUploadProgress.value = Math.round(((index + percent / 100) / prepared.segments.length) * 100);
        }
      });
      assets.push(asset);
    }

    Object.assign(detailImage, {
      sourceUrl: assets[0]?.url ?? "",
      width: prepared.width,
      height: prepared.height,
      sizeBytes: assets.reduce((total, asset) => total + (asset.sizeBytes ?? 0), 0),
      segments: assets.map((asset, index) => ({
        url: asset.url,
        materialId: asset.id,
        width: prepared.segments[index].width,
        height: prepared.segments[index].height
      }))
    });
    await persistDetailImage();
    ElMessage.success("详情长图已上传并保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "详情长图上传失败");
  } finally {
    uploadingDetailImage.value = false;
    detailImageUploadProgress.value = 0;
  }
}

async function openDetailMaterialPicker(target: "rich-text" | "long-image" = "long-image") {
  detailMaterialTarget.value = target;
  detailMaterialVisible.value = true;
  await loadDetailMaterials();
}

async function loadDetailMaterials() {
  detailMaterialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: detailMaterialKeyword.value, enabled: true });
    detailMaterialAssets.value = response.items.filter((asset) => isConferenceDetailImageAsset(asset.fileType, asset.url));
  } finally {
    detailMaterialLoading.value = false;
  }
}

async function chooseDetailMaterial(asset: MaterialAsset) {
  if (detailMaterialTarget.value === "rich-text") {
    const inserted = detailRichTextEditorRef.value?.insertImage(asset.url, asset.name);
    if (!inserted) {
      ElMessage.warning("编辑器尚未就绪，请稍后重试");
      return;
    }
    detailMaterialVisible.value = false;
    detailMaterialTarget.value = "long-image";
    ElMessage.success("图片已插入，请保存详情内容");
    return;
  }
  Object.assign(detailImage, {
    sourceUrl: asset.url,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    segments: [{ url: asset.url, materialId: asset.id, width: asset.width, height: asset.height }]
  });
  detailMaterialVisible.value = false;
  await persistDetailImage();
  ElMessage.success("详情长图已应用");
}

async function removeDetailImage() {
  await ElMessageBox.confirm("删除后用户端仍会保留会议基本信息和内容块，确认删除整页长图？", "删除详情长图", {
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
    type: "warning"
  });
  Object.assign(detailImage, createEmptyDetailImage());
  await persistDetailImage();
  ElMessage.success("详情长图已删除");
}

async function persistDetailImage() {
  if (!conferenceId.value || !conference.value) return;
  const contentJson = { ...readRecord(conference.value.contentJson) };
  if (detailImage.segments.length === 0) {
    delete contentJson.detailLongImage;
    delete contentJson.detailLongImageUrl;
    delete contentJson.detailImage;
    delete contentJson.detailImages;
  } else {
    contentJson.detailLongImage = {
      version: 1,
      sourceUrl: detailImage.sourceUrl,
      displayUrls: detailImage.segments.map((segment) => segment.url),
      segments: detailImage.segments,
      width: detailImage.width,
      height: detailImage.height,
      sizeBytes: detailImage.sizeBytes,
      updatedAt: new Date().toISOString()
    };
  }
  const updated = await updateConference(conferenceId.value, { contentJson });
  applyUpdatedConference(updated);
}

async function saveDetailContent() {
  if (!conferenceId.value || !conference.value) return;
  savingDetailContent.value = true;
  try {
    const contentJson = { ...readRecord(conference.value.contentJson) };
    const updatedAt = new Date().toISOString();
    const sectionItems = detailSections.value.map((section, index) => ({
      id: section.id,
      title: section.title.trim() || `栏目 ${index + 1}`,
      enabled: section.enabled,
      sort: (index + 1) * 10,
      content: createConferenceDetailRichText(section.html)
    }));
    contentJson.detailSections = {
      ...serializeConferenceDetailSections(sectionItems),
      updatedAt
    };
    const legacyContent = sectionItems.find((section) => section.enabled)?.content ?? sectionItems[0]?.content;
    contentJson.detailRichText = {
      ...(legacyContent ?? createConferenceDetailRichText("")),
      updatedAt
    };
    const updated = await updateConference(conferenceId.value, { contentJson });
    applyUpdatedConference(updated);
    const savedSections = normalizeConferenceDetailSections(updated.contentJson).items;
    detailSections.value = savedSections.map((section) => ({
      id: section.id,
      title: section.title,
      enabled: section.enabled,
      html: conferenceDetailRichTextToEditorHtml(section.content)
    }));
    ElMessage.success("会议详情内容已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "会议详情内容保存失败");
  } finally {
    savingDetailContent.value = false;
  }
}

function applyUpdatedConference(updated: Conference) {
  selectedConference.value = updated;
  const index = conferences.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) conferences.value[index] = { ...conferences.value[index], ...updated };
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function fieldTypeText(value: string) {
  return {
    TEXT: "单行文本",
    TEXTAREA: "多行文本",
    PHONE: "手机号",
    EMAIL: "邮箱",
    SELECT: "下拉选择",
    RADIO: "单选",
    CHECKBOX: "多选",
    DATE: "日期"
  }[value] ?? value;
}

function optionsToText(value: unknown[] | null) {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : String((item as { label?: unknown }).label ?? ""))).filter(Boolean).join("\n") : "";
}

function textToOptions(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function createEmptyDetailImage(): DetailImageState {
  return { sourceUrl: "", width: null, height: null, sizeBytes: null, segments: [] };
}

function normalizeDetailImage(contentJson: Record<string, unknown>): DetailImageState {
  const raw = contentJson.detailLongImage ?? contentJson.detailLongImageUrl ?? contentJson.detailImage;
  const source = typeof raw === "string" ? { sourceUrl: raw } : readRecord(raw);
  const sourceUrl = readString(source.sourceUrl) || readString(source.url);
  const rawSegments = Array.isArray(source.segments) ? source.segments : [];
  const segments = rawSegments.map(normalizeDetailSegment).filter((item): item is DetailImageSegment => item !== null);
  const displayUrls = [
    ...readStringArray(source.displayUrls),
    ...readStringArray(contentJson.detailImages),
    sourceUrl
  ].filter(Boolean);
  for (const url of [...new Set(displayUrls)]) {
    if (!segments.some((segment) => segment.url === url)) segments.push({ url, materialId: null, width: null, height: null });
  }
  return {
    sourceUrl: sourceUrl || segments[0]?.url || "",
    width: readPositiveNumber(source.width),
    height: readPositiveNumber(source.height),
    sizeBytes: readPositiveNumber(source.sizeBytes),
    segments
  };
}

function normalizeDetailSegment(value: unknown): DetailImageSegment | null {
  if (typeof value === "string") return value.trim() ? { url: value.trim(), materialId: null, width: null, height: null } : null;
  const source = readRecord(value);
  const url = readString(source.url);
  return url ? {
    url,
    materialId: readString(source.materialId) || null,
    width: readPositiveNumber(source.width),
    height: readPositiveNumber(source.height)
  } : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function readPositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createDefaultDetailSection(): DetailSectionDraft {
  return {
    id: "activity-detail",
    title: "活动详情",
    enabled: true,
    html: "<p><br></p>"
  };
}

interface DetailImageSegment {
  url: string;
  materialId: string | null;
  width: number | null;
  height: number | null;
}

interface DetailSectionDraft {
  id: string;
  title: string;
  enabled: boolean;
  html: string;
}

interface DetailImageState {
  sourceUrl: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  segments: DetailImageSegment[];
}
</script>

<style scoped>
.discount-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 14px;
}

.detail-tab-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.publish-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.publish-panel h3 {
  margin: 0;
}

.date-range {
  display: flex;
  gap: 10px;
}

.date-picker {
  width: min(100%, 360px);
}

.form-section-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 6px 0 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--admin-color-border);
}

.form-section-heading:not(:first-child) {
  margin-top: 30px;
}

.form-section-heading strong {
  color: var(--admin-color-text);
  font-size: 15px;
}

.form-section-heading span {
  color: var(--admin-color-muted);
  font-size: 12px;
}

.form-help,
.form-warning {
  margin: 6px 0 0;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.5;
}

.form-warning {
  color: #b45309;
}

.detail-image-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-image-panel--secondary {
  border-top: 3px solid #d9e2e9;
}

.detail-image-heading,
.detail-image-actions,
.material-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-image-heading h3,
.detail-image-heading p {
  margin: 0;
}

.detail-image-heading p {
  margin-top: 6px;
}

.detail-image-workspace {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  padding: 20px;
  border: 1px solid var(--admin-color-border);
  background: #f5f7fa;
}

.phone-preview {
  overflow: hidden;
  border: 1px solid #cfd6df;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(24, 39, 57, 0.08);
}

.phone-preview-header {
  height: 48px;
  border-bottom: 1px solid #edf0f3;
  color: #172236;
  font-size: 14px;
  font-weight: 700;
  line-height: 48px;
  text-align: center;
}

.phone-preview-scroll {
  height: 540px;
  overflow-y: auto;
  background: #f4f5f3;
}

.phone-preview-scroll img {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
}

.detail-image-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--admin-color-muted);
  font-size: 13px;
  line-height: 1.65;
}

.detail-image-meta strong {
  color: var(--admin-color-text);
  font-size: 16px;
}

.detail-image-meta p {
  max-width: 560px;
  margin: 12px 0 0;
}

.detail-image-empty {
  display: flex;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed #cbd3dc;
  background: #f8fafc;
  color: var(--admin-color-muted);
}

.detail-image-empty strong {
  color: var(--admin-color-text);
  font-size: 16px;
}

.detail-image-empty-icon {
  width: 40px;
  color: #8b98a8;
}

.detail-image-actions {
  justify-content: flex-start;
}

.material-search .el-input {
  flex: 1;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.material-card {
  padding: 8px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #fff;
  color: var(--admin-color-text);
  cursor: pointer;
  text-align: left;
}

.material-card:hover {
  border-color: var(--el-color-primary);
}

.material-card img {
  display: block;
  width: 100%;
  height: 112px;
  border-radius: 6px;
  object-fit: cover;
  background: #f3f6fb;
}

.material-card strong,
.material-card span {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card span {
  color: var(--admin-color-muted);
}

.hidden-file {
  display: none;
}

@media (max-width: 900px) {
  .detail-image-workspace {
    grid-template-columns: 1fr;
  }

  .phone-preview {
    max-width: 360px;
  }
}
</style>
