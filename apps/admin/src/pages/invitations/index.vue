<template>
  <section
    class="admin-page invitations-admin"
    :class="{
      'is-editing': ['content', 'design', 'roster', 'registration'].includes(
        tab,
      ),
    }"
  >
    <AdminPageHeader title="专属邀请函" eyebrow="会议邀约"
      ><template #actions
        ><el-button
          v-if="can('settings')"
          :icon="Setting"
          @click="wechatSettingsVisible = true"
          >公众号配置</el-button
        ><el-button
          v-if="can('content')"
          :icon="Rank"
          :disabled="!detail || loading || saving || publishing"
          @click="openCoverCanvas"
          >封面定位</el-button
        ><el-button
          v-if="can('access') && can('content')"
          :icon="Plus"
          @click="newCampaignVisible = true"
          >新建会议邀请函</el-button
        ></template
      ></AdminPageHeader
    >
    <div class="invite-campaign-bar">
      <el-select
        :model-value="selectedId"
        placeholder="选择会议"
        filterable
        :loading="loading"
        :disabled="saving || publishing"
        aria-label="选择会议邀请函"
        @update:model-value="selectCampaign"
        ><el-option
          v-for="campaign in campaigns"
          :key="campaign.id"
          :label="campaign.title"
          :value="campaign.id" /></el-select
      ><el-tag
        v-if="detail"
        :type="
          detail.publishedRevision
            ? detail.hasChanges || dirty
              ? 'warning'
              : 'success'
            : 'info'
        "
        >{{
          !detail.publishedRevision
            ? "尚未发布"
            : detail.hasChanges || dirty
              ? "有待发布更新"
              : "已发布"
        }}</el-tag
      ><span v-if="detail?.publishedAt" class="invite-publish-date"
        >{{ formatDate(detail.publishedAt) }} 更新</span
      >
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />
    <el-skeleton v-if="loading" :rows="5" animated />
    <el-empty v-else-if="!detail" description="暂无已授权的会议邀请函" />
    <template v-else>
      <el-tabs v-model="tab" class="invite-tabs"
        ><el-tab-pane label="邀请记录" name="recipients" /><el-tab-pane
          v-if="can('content') || can('publish')"
          label="会议内容"
          name="content" /><el-tab-pane
          v-if="can('content') || can('publish')"
          label="公开名单"
          name="roster" /><el-tab-pane
          v-if="can('content') || can('publish')"
          label="视觉与分享"
          name="design" /><el-tab-pane
          v-if="can('content') || can('publish')"
          label="报名入口"
          name="registration" /><el-tab-pane
          v-if="can('access')"
          label="会议授权"
          name="access"
      /></el-tabs>
      <template v-if="tab === 'recipients'">
        <div class="invite-list-toolbar">
          <el-input
            v-model="keyword"
            clearable
            :prefix-icon="Search"
            placeholder="搜索受邀人"
            aria-label="搜索受邀人"
            @keyup.enter="search"
            @clear="search"
          /><el-button :icon="Search" :loading="listLoading" @click="search"
            >搜索</el-button
          ><el-button
            v-if="can('write')"
            :icon="Files"
            :disabled="!detail.publishedRevision"
            @click="batchVisible = true"
            >批量生成</el-button
          ><el-button
            v-if="can('write')"
            type="primary"
            :icon="Plus"
            :disabled="!detail.publishedRevision"
            @click="newRecipient"
            >生成邀请函</el-button
          >
        </div>
        <el-empty
          v-if="!records.length && !listLoading"
          :description="
            detail.publishedRevision
              ? '还没有个人邀请记录'
              : '发布会议内容后即可生成个人邀请函'
          "
        />
        <div v-else v-loading="listLoading" class="invite-records">
          <article
            v-for="record in records"
            :key="record.id"
            class="invite-record"
          >
            <div class="invite-record__person">
              <div class="invite-record__initial">
                {{ record.name.slice(0, 1) }}
              </div>
              <div>
                <strong
                  >{{ record.name
                  }}<small>{{ record.salutation }}</small></strong
                ><span
                  >{{ record.creator.displayName || record.creator.username }} ·
                  {{ formatDate(record.createdAt) }}</span
                >
              </div>
            </div>
            <div class="invite-record__status">
              <el-tag
                :type="
                  !record.enabled
                    ? 'info'
                    : record.registrationCount
                      ? 'success'
                      : 'warning'
                "
                >{{
                  !record.enabled
                    ? "已停用"
                    : record.registrationCount
                      ? "已有报名"
                      : "待报名"
                }}</el-tag
              >
            </div>
            <div class="invite-record__actions">
              <el-button
                :icon="View"
                :disabled="!record.enabled"
                @click="openLink(record.shareUrl)"
                >打开</el-button
              ><el-button
                :icon="Share"
                :disabled="!record.enabled"
                @click="showShare(record)"
                >分享</el-button
              ><el-dropdown
                v-if="
                  can('write') &&
                  (record.createdBy === session.admin.value?.id || can('all'))
                "
                trigger="click"
                @command="recordAction(record, String($event))"
                ><el-button
                  :icon="MoreFilled"
                  title="更多操作"
                  aria-label="更多操作"
                /><template #dropdown
                  ><el-dropdown-menu
                    ><el-dropdown-item command="edit"
                      >修改受邀人</el-dropdown-item
                    ><el-dropdown-item
                      :command="record.enabled ? 'disable' : 'enable'"
                      >{{
                        record.enabled ? "停用邀请" : "启用邀请"
                      }}</el-dropdown-item
                    ></el-dropdown-menu
                  ></template
                ></el-dropdown
              >
            </div>
          </article>
        </div>
        <el-pagination
          v-if="total"
          class="invite-pagination"
          :current-page="page"
          :page-size="20"
          layout="prev, pager, next, total"
          :total="total"
          @current-change="changePage"
        />
      </template>
      <div
        v-else-if="
          ['content', 'design', 'roster', 'registration'].includes(tab)
        "
        class="invite-editor-layout"
        :class="{ 'invite-editor-layout--wide': tab !== 'roster' }"
      >
        <div class="invite-editor">
          <nav
            v-if="!detail.publishedRevision"
            class="invite-setup-steps"
            aria-label="邀请函配置"
          >
            <button
              :class="{ active: tab === 'design' }"
              @click="tab = 'design'"
            >
              <span>01</span>选视觉<el-icon v-if="draft.coverImageUrl"
                ><Check
              /></el-icon></button
            ><button
              :class="{ active: tab === 'content' }"
              @click="tab = 'content'"
            >
              <span>02</span>会议内容<el-icon
                v-if="draft.title && draft.dateLabel && draft.location"
                ><Check
              /></el-icon></button
            ><button
              :class="{ active: tab === 'roster' }"
              @click="tab = 'roster'"
            >
              <span>03</span>公开名单<small>{{ draft.invitees.length }}</small>
            </button>
          </nav>
          <div class="invite-editor-toolbar">
            <span>{{ dirty ? "有未保存修改" : "草稿已保存" }}</span>
            <div>
              <el-button :icon="View" @click="previewVisible = true"
                >预览</el-button
              ><el-button
                v-if="can('content')"
                :icon="DocumentChecked"
                :loading="saving"
                :disabled="!dirty || publishing"
                @click="save"
                >保存草稿</el-button
              ><el-button
                v-if="can('publish')"
                type="primary"
                :icon="Promotion"
                :loading="publishing"
                :disabled="
                  saving ||
                  (!dirty && !detail.hasChanges) ||
                  (dirty && !can('content'))
                "
                @click="publish"
                >{{ dirty ? "保存并发布" : "发布更新" }}</el-button
              >
            </div>
          </div>
          <el-form
            label-position="top"
            :disabled="!can('content') || saving || publishing"
          >
            <InvitationModulesEditor
              v-if="tab === 'content'"
              v-model="draft"
              :campaign-id="selectedId"
              :preview-document="previewDocument"
              :disabled="!can('content') || saving || publishing"
            />
            <InvitationRosterEditor
              v-else-if="tab === 'roster'"
              v-model="draft.invitees"
              v-model:sort="draft.inviteeSort"
              :note="rosterModule?.settings?.inviteeNote"
              :disabled="!can('content') || saving || publishing"
              @update:note="updateRosterNote"
            />
            <InvitationDesignStudio
              v-else-if="tab === 'design'"
              ref="designStudio"
              v-model="draft"
              v-model:preview-name="previewName"
              :campaign-id="selectedId"
              :disabled="!can('content') || saving || publishing"
              @replay="
                previewVisible = true;
                replayPreview();
              "
            />
            <InvitationRegistrationEditor
              v-else-if="tab === 'registration'"
              v-model="draft.registration"
              :linked-id="detail.conferenceId"
              :conferences="options.conferences"
              :disabled="!can('content') || saving || publishing"
            />
          </el-form>
        </div>
        <aside v-if="tab === 'roster'" class="invite-preview-aside">
          <div class="invite-preview-heading">
            <span>嘉宾视角 · {{ previewName || "受邀嘉宾" }}</span
            ><el-button
              :icon="Refresh"
              text
              title="重播入场动效"
              aria-label="重播入场动效"
              @click="replayPreview"
            />
          </div>
          <div ref="previewScreen" class="invite-preview-screen">
            <InvitationRuntime
              :key="previewKey"
              :document="previewDocument"
              preview
              @register="previewVisible = true"
            />
          </div>
        </aside>
      </div>
      <section v-else-if="tab === 'access'" class="invite-access">
        <h2>会议授权人员</h2>
        <el-checkbox-group v-model="memberIds"
          ><el-checkbox
            v-for="admin in options.admins"
            :key="admin.id"
            :value="admin.id"
            >{{ admin.displayName || admin.username }}</el-checkbox
          ></el-checkbox-group
        ><el-button type="primary" :loading="saving" @click="saveMembers"
          >保存授权</el-button
        >
      </section>
    </template>
    <el-dialog
      v-model="newCampaignVisible"
      title="新建会议邀请函"
      width="min(92vw, 480px)"
      :close-on-click-modal="!saving"
      :close-on-press-escape="!saving"
      :show-close="!saving"
      ><el-form
        label-position="top"
        :disabled="saving"
        @submit.prevent="createCampaign"
        ><el-form-item label="会议来源">
          <el-radio-group v-model="newSource" aria-label="会议来源">
            <el-radio-button value="internal">系统内会议</el-radio-button>
            <el-radio-button value="external">外部会议</el-radio-button>
          </el-radio-group> </el-form-item
        ><el-form-item v-if="newSource === 'internal'" label="会议"
          ><el-select
            v-model="newConferenceId"
            filterable
            placeholder="选择会议"
            style="width: 100%"
            ><el-option
              v-for="conference in availableConferences"
              :key="conference.id"
              :label="conference.title"
              :value="conference.id" /></el-select
        ></el-form-item>
        <template v-else>
          <el-form-item label="会议名称" required
            ><el-input v-model="newTitle" aria-label="会议名称" maxlength="200"
          /></el-form-item>
          <el-form-item label="会议时间"
            ><el-input
              v-model="newDateLabel"
              aria-label="会议时间"
              maxlength="200"
          /></el-form-item>
          <el-form-item label="会议地点"
            ><el-input
              v-model="newLocation"
              aria-label="会议地点"
              maxlength="200"
          /></el-form-item>
          <InvitationRegistrationEditor
            v-model="newRegistration"
            :conferences="options.conferences"
            :disabled="saving"
          />
        </template> </el-form
      ><template #footer
        ><el-button :disabled="saving" @click="newCampaignVisible = false"
          >取消</el-button
        ><el-button
          type="primary"
          :disabled="!canCreateCampaign"
          :loading="saving"
          @click="createCampaign"
          >创建</el-button
        ></template
      ></el-dialog
    >
    <InvitationBatchDialog
      v-if="can('write') && detail?.publishedRevision"
      :key="selectedId"
      v-model="batchVisible"
      :campaign-id="selectedId"
      :roster="detail.published?.invitees || []"
      @generated="search"
    />
    <InvitationWechatSettings
      v-if="can('settings')"
      v-model="wechatSettingsVisible"
    />
    <el-dialog
      v-model="recipientVisible"
      :title="editingRecipientId ? '修改受邀人' : '生成专属邀请函'"
      width="min(92vw, 480px)"
      :close-on-click-modal="!saving"
      ><el-form label-position="top" @submit.prevent="saveRecipient"
        ><el-form-item label="受邀人姓名" required
          ><el-input
            v-model="recipientName"
            maxlength="80"
            autofocus /></el-form-item
        ><el-form-item label="称谓"
          ><el-input v-model="recipientSalutation" maxlength="40"
        /></el-form-item>
        <el-form-item
          v-if="recipientCandidates.length > 1"
          label="同名嘉宾 · 确认名单位置"
          required
        >
          <el-select
            v-model="recipientRosterId"
            placeholder="选择对应的单位与职务"
            aria-label="匹配公开名单"
            style="width: 100%"
            ><el-option
              v-for="person in recipientCandidates"
              :key="person.id"
              :value="person.id"
              :label="`${person.name} · ${person.organization || '未填写单位'} · ${person.role || '未填写职务'}`"
          /></el-select>
        </el-form-item>
        <p
          v-else-if="recipientCandidates.length === 1"
          class="invite-match-status"
        >
          已匹配：{{
            recipientCandidates[0].organization || recipientCandidates[0].name
          }}
          {{ recipientCandidates[0].role }}
        </p>
        <div class="invite-salutation-preview">
          尊敬的{{ recipientName || "嘉宾" }}{{ recipientSalutation }}：
        </div></el-form
      ><template #footer
        ><el-button @click="recipientVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="
            !recipientName.trim() ||
            (recipientCandidates.length > 1 && !recipientRosterId)
          "
          :loading="saving"
          @click="saveRecipient"
          >{{ editingRecipientId ? "保存修改" : "生成邀请函" }}</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="shareVisible"
      title="邀请函已就绪"
      width="min(92vw, 480px)"
      ><div class="invite-share-result">
        <strong>{{ recipientName }}{{ recipientSalutation }}</strong
        ><img
          v-if="shareQr"
          :src="shareQr"
          width="220"
          height="220"
          alt="微信扫码打开专属邀请函"
          class="invite-share-qr"
        />
        <el-input
          :model-value="generatedUrl"
          readonly
          aria-label="专属邀请地址"
        />
        <div class="invite-share-result__actions">
          <el-button type="primary" :icon="View" @click="openLink(generatedUrl)"
            >打开邀请函</el-button
          ><el-button :icon="CopyDocument" @click="copy(generatedUrl)"
            >复制地址</el-button
          >
        </div>
        <p>在微信中打开邀请函后，通过右上角发送图文卡片。</p>
      </div></el-dialog
    >
    <el-dialog
      v-model="previewVisible"
      title="邀请函预览"
      width="min(100vw, 438px)"
      class="invite-preview-dialog"
      top="3vh"
      ><InvitationRuntime
        v-if="previewVisible"
        :key="previewKey"
        :document="previewDocument"
        preview
    /></el-dialog>
  </section>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  CopyDocument,
  Files,
  Check,
  DocumentChecked,
  MoreFilled,
  Plus,
  Promotion,
  Rank,
  Refresh,
  Search,
  Share,
  Setting,
  View,
} from "@element-plus/icons-vue";
import {
  createInvitationContent,
  normalizeInvitationContent,
  normalizeInvitationModuleSettings,
  normalizeInvitationRegistration,
  invitationRegistrationUrl,
  invitationNameKey,
  type InvitationCampaignSummary,
  type InvitationContent,
  type InvitationRecord,
  type PublicInvitation,
} from "@conference/shared";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import InvitationRuntime from "../../components/invitations/InvitationRuntime.vue";
import InvitationBatchDialog from "../../components/invitations/InvitationBatchDialog.vue";
import InvitationModulesEditor from "../../components/invitations/InvitationModulesEditor.vue";
import InvitationDesignStudio from "../../components/invitations/InvitationDesignStudio.vue";
import InvitationRosterEditor from "../../components/invitations/InvitationRosterEditor.vue";
import InvitationRegistrationEditor from "../../components/invitations/InvitationRegistrationEditor.vue";
import InvitationWechatSettings from "../../components/invitations/InvitationWechatSettings.vue";
import { useAdminSession } from "../../stores/admin-session";
import { API_BASE_URL } from "../../config";
import {
  createInvitationCampaign,
  createInvitationRecipient,
  getInvitationCampaign,
  getInvitationMembers,
  invitationOptions,
  invitationRegistrationOptions,
  listInvitationCampaigns,
  listInvitationRecipients,
  publishInvitationCampaign,
  saveInvitationCampaign,
  saveInvitationMembers,
  updateInvitationRecipient,
  type InvitationCampaignDetail,
  type InvitationOptions,
} from "../../services/invitations";
const session = useAdminSession();
const can = (permission: string) =>
  session.hasPermission(`invitation:${permission}`);
const campaigns = ref<InvitationCampaignSummary[]>([]);
const detail = ref<InvitationCampaignDetail | null>(null);
const options = ref<InvitationOptions>({ conferences: [], admins: [] });
const selectedId = ref("");
const draft = ref<InvitationContent>(createInvitationContent());
const rosterModule = computed(() =>
  draft.value.modules.find((module) => module.type === "invitees"),
);
function updateRosterNote(value: string) {
  if (
    !can("content") ||
    saving.value ||
    publishing.value ||
    !rosterModule.value
  )
    return;
  rosterModule.value.settings = {
    ...normalizeInvitationModuleSettings(rosterModule.value.settings),
    inviteeNote: value,
  };
}
const savedDraft = ref("");
const dirty = computed(() =>
  Boolean(detail.value && JSON.stringify(draft.value) !== savedDraft.value),
);
const records = ref<InvitationRecord[]>([]);
const keyword = ref("");
const page = ref(1);
const total = ref(0);
const tab = ref("recipients");
const batchVisible = ref(false);
const designStudio = ref<InstanceType<typeof InvitationDesignStudio>>();
async function openCoverCanvas() {
  if (
    !detail.value ||
    !can("content") ||
    loading.value ||
    saving.value ||
    publishing.value
  )
    return;
  tab.value = "design";
  await nextTick();
  await designStudio.value?.openCoverCanvas();
}
const loading = ref(false);
const listLoading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const error = ref("");
const newCampaignVisible = ref(false);
const newConferenceId = ref("");
const newSource = ref<"internal" | "external">("internal");
const newTitle = ref(""),
  newDateLabel = ref(""),
  newLocation = ref("");
const newRegistration = ref(
  normalizeInvitationRegistration({ mode: "external" }),
);
const wechatSettingsVisible = ref(false);
const canCreateCampaign = computed(() =>
  newSource.value === "internal"
    ? Boolean(newConferenceId.value)
    : Boolean(newTitle.value.trim()) &&
      (newRegistration.value.mode === "none" ||
        (newRegistration.value.mode === "external"
          ? Boolean(invitationRegistrationUrl(newRegistration.value.url))
          : Boolean(newRegistration.value.conferenceId))),
);
const recipientVisible = ref(false);
const recipientName = ref("");
const recipientSalutation = ref("老师");
const recipientRosterId = ref("");
const recipientCandidates = computed(() =>
  (detail.value?.published?.invitees || []).filter(
    (person) =>
      invitationNameKey(person.name) === invitationNameKey(recipientName.value),
  ),
);
watch(
  recipientName,
  () => {
    recipientRosterId.value =
      recipientCandidates.value.length === 1
        ? recipientCandidates.value[0].id
        : "";
  },
  { flush: "sync" },
);
const previewName = ref("受邀嘉宾");
const previewKey = ref(0);
const previewScreen = ref<HTMLElement>();
async function replayPreview() {
  previewKey.value++;
  await nextTick();
  previewScreen.value?.scrollTo({ top: 0, behavior: "instant" });
}
const editingRecipientId = ref("");
const previewVisible = ref(false);
const shareVisible = ref(false);
const generatedUrl = ref("");
const shareQr = ref("");
const memberIds = ref<string[]>([]);
let selectionRequest = 0;
let recipientRequest = 0;
const availableConferences = computed(() =>
  options.value.conferences.filter(
    (item) =>
      !campaigns.value.some((campaign) => campaign.conferenceId === item.id),
  ),
);
const previewDocument = computed<PublicInvitation>(() => ({
  recipient: { name: previewName.value || "受邀嘉宾", salutation: "老师" },
  conferenceId: detail.value?.conferenceId || "",
  revision: detail.value?.publishedRevision || 0,
  publishedAt: detail.value?.publishedAt || "",
  content: {
    ...draft.value,
    coverImageUrl: assetUrl(draft.value.coverImageUrl),
    logoUrl: assetUrl(draft.value.logoUrl),
    shareImageUrl: assetUrl(draft.value.shareImageUrl),
    guests: draft.value.guests.map((guest) => ({
      ...guest,
      imageUrl: assetUrl(guest.imageUrl),
    })),
  },
  shareUrl: "",
  registrationPath: "",
  registrationMode: draft.value.registration?.mode || "miniapp",
  registrationUrl: draft.value.registration?.url || "",
  registrationOpen: draft.value.registration?.mode !== "none",
  registrationMessage:
    draft.value.registration?.label ||
    (draft.value.registration?.mode === "external"
      ? "前往报名"
      : "前往小程序报名"),
  miniAppId: "",
}));
function assetUrl(url: string) {
  return url.startsWith("/uploads/")
    ? `${new URL(API_BASE_URL).origin}${url}`
    : url;
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fail(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : "操作失败，请重试";
  ElMessage.error(error.value);
}
function adopt(value: InvitationCampaignDetail) {
  detail.value = value;
  draft.value = normalizeInvitationContent(value.draft);
  savedDraft.value = JSON.stringify(draft.value);
}
async function loadCampaigns() {
  campaigns.value = (await listInvitationCampaigns()).items;
}
async function selectCampaign(id: string) {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        "当前修改尚未保存，确定切换会议？",
        "未保存的修改",
        {
          type: "warning",
          confirmButtonText: "切换会议",
          cancelButtonText: "继续编辑",
        },
      );
    } catch {
      return;
    }
  }
  const request = ++selectionRequest;
  ++recipientRequest;
  selectedId.value = id;
  loading.value = true;
  error.value = "";
  detail.value = null;
  records.value = [];
  page.value = 1;
  try {
    const result = await getInvitationCampaign(id);
    if (request !== selectionRequest) return;
    adopt(result);
    await loadRecipients();
    if (can("access")) {
      const members = await getInvitationMembers(id);
      if (request === selectionRequest) memberIds.value = members.adminIds;
    }
  } catch (cause) {
    if (request === selectionRequest) fail(cause);
  } finally {
    if (request === selectionRequest) loading.value = false;
  }
}
async function loadRecipients() {
  if (!selectedId.value) return;
  const request = ++recipientRequest;
  const id = selectedId.value;
  listLoading.value = true;
  try {
    const result = await listInvitationRecipients(id, {
      keyword: keyword.value,
      page: page.value,
      pageSize: 20,
    });
    if (request === recipientRequest && id === selectedId.value) {
      records.value = result.items;
      total.value = result.total;
    }
  } catch (cause) {
    if (request === recipientRequest) fail(cause);
  } finally {
    if (request === recipientRequest) listLoading.value = false;
  }
}
function search() {
  page.value = 1;
  void loadRecipients();
}
function changePage(value: number) {
  page.value = value;
  void loadRecipients();
}
async function createCampaign() {
  if (!canCreateCampaign.value || saving.value) return;
  saving.value = true;
  try {
    const result = await createInvitationCampaign(
      newSource.value === "internal"
        ? { source: "internal", conferenceId: newConferenceId.value }
        : {
            source: "external",
            title: newTitle.value,
            dateLabel: newDateLabel.value,
            location: newLocation.value,
            registration: newRegistration.value,
          },
    );
    newCampaignVisible.value = false;
    await loadCampaigns();
    await selectCampaign(result.id);
    tab.value = "design";
  } catch (cause) {
    fail(cause);
  } finally {
    saving.value = false;
  }
}
async function save() {
  if (!detail.value || saving.value) return;
  saving.value = true;
  error.value = "";
  const id = selectedId.value;
  try {
    const result = await saveInvitationCampaign(
      id,
      draft.value,
      detail.value.draftRevision,
    );
    if (id === selectedId.value) adopt(result);
    await loadCampaigns();
    ElMessage.success("草稿已保存");
  } catch (cause) {
    fail(cause);
  } finally {
    saving.value = false;
  }
}
async function publish() {
  if (
    !detail.value ||
    publishing.value ||
    saving.value ||
    (dirty.value && !can("content"))
  )
    return;
  try {
    await ElMessageBox.confirm(
      "本次更新将应用到该会议所有已生成的邀请函。",
      "发布会议邀请函",
      { confirmButtonText: "发布更新", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  publishing.value = true;
  const id = selectedId.value;
  try {
    if (dirty.value) {
      const saved = await saveInvitationCampaign(
        id,
        draft.value,
        detail.value.draftRevision,
      );
      if (id !== selectedId.value) return;
      adopt(saved);
    }
    const result = await publishInvitationCampaign(
      id,
      detail.value.draftRevision,
    );
    if (id === selectedId.value) adopt(result);
    await loadCampaigns();
    ElMessage.success("已发布，所有专属链接已同步");
  } catch (cause) {
    fail(cause);
  } finally {
    publishing.value = false;
  }
}
function newRecipient() {
  editingRecipientId.value = "";
  recipientName.value = "";
  recipientSalutation.value = "老师";
  recipientRosterId.value = "";
  recipientVisible.value = true;
}
async function saveRecipient() {
  if (saving.value) return;
  saving.value = true;
  try {
    if (editingRecipientId.value)
      await updateInvitationRecipient(editingRecipientId.value, {
        name: recipientName.value,
        salutation: recipientSalutation.value,
        publicInviteeId: recipientRosterId.value || null,
      });
    else {
      const result = await createInvitationRecipient(
        selectedId.value,
        recipientName.value,
        recipientSalutation.value,
        recipientRosterId.value || undefined,
      );
      showShare({
        ...result,
        name: recipientName.value,
        salutation: recipientSalutation.value,
      });
    }
    recipientVisible.value = false;
    page.value = 1;
    await loadRecipients();
  } catch (cause) {
    fail(cause);
  } finally {
    saving.value = false;
  }
}
function showShare(
  record: Pick<InvitationRecord, "name" | "salutation" | "shareUrl">,
) {
  recipientName.value = record.name;
  recipientSalutation.value = record.salutation;
  generatedUrl.value = record.shareUrl;
  recipientVisible.value = false;
  shareVisible.value = true;
}
watch(generatedUrl, async (url) => {
  shareQr.value = "";
  if (!url) return;
  try {
    const { toDataURL } = await import("qrcode");
    const image = await toDataURL(url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    if (generatedUrl.value === url) shareQr.value = image;
  } catch {
    ElMessage.warning("二维码暂不可用，可复制地址后在微信打开");
  }
});
async function recordAction(record: InvitationRecord, action: string) {
  if (action === "edit") {
    editingRecipientId.value = record.id;
    recipientName.value = record.name;
    recipientSalutation.value = record.salutation;
    recipientRosterId.value =
      record.publicInviteeId ||
      (recipientCandidates.value.length === 1
        ? recipientCandidates.value[0].id
        : "");
    recipientVisible.value = true;
    return;
  }
  try {
    await ElMessageBox.confirm(
      action === "disable"
        ? "停用后，已发送的邀请链接将无法打开。"
        : "重新启用此邀请函？",
      "确认操作",
      { confirmButtonText: "确认", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  try {
    await updateInvitationRecipient(record.id, {
      enabled: action === "enable",
    });
    await loadRecipients();
  } catch (cause) {
    fail(cause);
  }
}
async function saveMembers() {
  saving.value = true;
  try {
    await saveInvitationMembers(selectedId.value, memberIds.value);
    ElMessage.success("会议授权已保存");
  } catch (cause) {
    fail(cause);
  } finally {
    saving.value = false;
  }
}
function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success("邀请地址已复制");
  } catch {
    ElMessage.error("复制失败，请打开邀请函后通过微信分享");
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
watch(newCampaignVisible, async (visible) => {
  if (visible) {
    newSource.value = "internal";
    newConferenceId.value = "";
    newTitle.value = newDateLabel.value = newLocation.value = "";
    newRegistration.value = normalizeInvitationRegistration({
      mode: "external",
    });
  }
  if (visible && can("access")) {
    try {
      options.value = await invitationOptions();
    } catch (cause) {
      fail(cause);
    }
  }
});
onMounted(async () => {
  window.addEventListener("beforeunload", beforeUnload);
  loading.value = true;
  try {
    await loadCampaigns();
    if (can("access")) options.value = await invitationOptions();
    else if (can("content"))
      options.value = {
        ...(await invitationRegistrationOptions()),
        admins: [],
      };
    if (campaigns.value[0]) await selectCampaign(campaigns.value[0].id);
  } catch (cause) {
    fail(cause);
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => {
  ++selectionRequest;
  ++recipientRequest;
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<style scoped src="./invitations.css"></style>
