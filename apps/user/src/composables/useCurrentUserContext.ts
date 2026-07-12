import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  clearAuthSession,
  ensureLogin,
  getMe,
  getStoredUser,
  getToken,
  setAuthSession,
  type CurrentUser
} from "@/services/auth";
import { getMemberCenter, type CurrentMembership } from "@/services/member";
import { getMyCoupons, getMyMallOrders } from "@/services/operations";
import { getMyRegistrations } from "@/services/registration";

const CONTEXT_TTL_MS = 30 * 1000;

const user = ref<CurrentUser | null>(getStoredUser());
const membership = ref<CurrentMembership | null>(null);
const registrationCount = ref(0);
const pendingConferenceCount = ref(0);
const orderCount = ref(0);
const couponCount = ref(0);
const loading = ref(false);
const loadedAt = ref(0);
let inFlight: Promise<void> | null = null;

export function useCurrentUserContext() {
  const displayName = computed(() => user.value?.wechatNickname || user.value?.nickname || "微信用户");
  const isLoggedIn = computed(() => Boolean(user.value && getToken()));
  const context = computed<Record<string, unknown> | null>(() => {
    if (!isLoggedIn.value || !user.value) return null;
    return {
      loggedIn: true,
      userId: user.value.id,
      avatarUrl: user.value.wechatAvatarUrl || "",
      nickname: displayName.value,
      phone: user.value.phone || "",
      memberStatus: membership.value ? membershipStatusText(membership.value.status) : "普通用户",
      memberLevel: membership.value?.level.name || "普通用户",
      registrationCount: registrationCount.value,
      pendingConferenceCount: pendingConferenceCount.value,
      orderCount: orderCount.value,
      couponCount: couponCount.value
    };
  });

  async function refresh(options: { force?: boolean; interactive?: boolean } = {}): Promise<void> {
    if (options.interactive) await ensureLogin();
    if (!getToken()) {
      resetContext();
      return;
    }
    if (!options.force && Date.now() - loadedAt.value < CONTEXT_TTL_MS) return;
    if (inFlight) return inFlight;

    inFlight = loadContext().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function login(): Promise<void> {
    await ensureLogin();
    await refresh({ force: true });
    uni.$emit("auth:changed", context.value);
  }

  function logout(): void {
    clearAuthSession();
    resetContext();
    uni.$emit("auth:changed", null);
  }

  function handleAuthChanged(): void {
    user.value = getStoredUser();
    loadedAt.value = 0;
    void refresh({ force: true });
  }

  onMounted(() => {
    uni.$on("auth:changed", handleAuthChanged);
    uni.$on("wechat-profile:updated", handleAuthChanged);
    void refresh();
  });

  onUnmounted(() => {
    uni.$off("auth:changed", handleAuthChanged);
    uni.$off("wechat-profile:updated", handleAuthChanged);
  });

  return {
    user,
    membership,
    loading,
    isLoggedIn,
    displayName,
    context,
    refresh,
    login,
    logout
  };
}

async function loadContext(): Promise<void> {
  loading.value = true;
  try {
    const token = getToken();
    const current = await getMe();
    if (token) setAuthSession(token, current);
    user.value = current;

    const [memberResult, registrationsResult, ordersResult, couponsResult] = await Promise.allSettled([
      getMemberCenter(),
      getMyRegistrations(),
      getMyMallOrders(),
      getMyCoupons()
    ]);

    membership.value = memberResult.status === "fulfilled" ? memberResult.value.membership : null;
    const registrations = registrationsResult.status === "fulfilled" ? registrationsResult.value : [];
    registrationCount.value = registrations.length;
    pendingConferenceCount.value = registrations.filter((item) => {
      if (["CANCELLED", "REFUNDED"].includes(String(item.status))) return false;
      const endsAt = Date.parse(item.conference?.endsAt || "");
      return !Number.isFinite(endsAt) || endsAt >= Date.now();
    }).length;
    orderCount.value = ordersResult.status === "fulfilled" ? ordersResult.value.items.length : 0;
    couponCount.value = couponsResult.status === "fulfilled" ? couponsResult.value.items.length : 0;
    loadedAt.value = Date.now();
  } catch {
    user.value = getStoredUser();
    if (!user.value) resetContext();
  } finally {
    loading.value = false;
  }
}

function resetContext(): void {
  user.value = null;
  membership.value = null;
  registrationCount.value = 0;
  pendingConferenceCount.value = 0;
  orderCount.value = 0;
  couponCount.value = 0;
  loadedAt.value = 0;
}

function membershipStatusText(status: string): string {
  if (status === "ACTIVE") return "有效会员";
  if (status === "EXPIRED") return "会员已到期";
  if (status === "DISABLED") return "会员已停用";
  return status || "普通用户";
}
