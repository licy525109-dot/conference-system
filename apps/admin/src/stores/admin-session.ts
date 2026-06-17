import { computed, ref } from "vue";
import { clearAdminToken, getAdminToken } from "../services/api";
import { getAdminMe, loginAdmin } from "../services/admin";
import type { AdminUser } from "../services/types";

const admin = ref<AdminUser | null>(null);
const ready = ref(false);

export function useAdminSession() {
  const permissions = computed(() => admin.value?.permissions ?? []);

  function hasPermission(permission?: string): boolean {
    if (!permission) {
      return true;
    }
    return permissions.value.includes("*") || permissions.value.includes(permission);
  }

  async function init() {
    if (ready.value) {
      return;
    }
    if (!getAdminToken()) {
      ready.value = true;
      return;
    }

    try {
      const response = await getAdminMe();
      admin.value = response.admin;
    } catch {
      clearAdminToken();
      admin.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(username: string, password: string) {
    admin.value = await loginAdmin(username, password);
    ready.value = true;
  }

  function logout() {
    clearAdminToken();
    admin.value = null;
    window.location.hash = "#/dashboard";
  }

  return {
    admin,
    ready,
    permissions,
    hasPermission,
    init,
    login,
    logout
  };
}
