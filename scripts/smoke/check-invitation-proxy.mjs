import { pathToFileURL } from "node:url";

export async function checkInvitationProxy({
  apiBase = "https://guanchaohuiji.com/api",
  adminOrigin = "https://admin.guanchaohuiji.com"
} = {}) {
  const base = apiBase.replace(/\/$/, "");
  const collection = "/admin/invitations/campaigns";
  const checks = [
    { path: collection, method: "OPTIONS", requestedMethod: "GET", status: 204 },
    { path: collection, method: "OPTIONS", requestedMethod: "POST", status: 204 },
    { path: `${collection}/proxy-smoke/assets/font`, method: "OPTIONS", requestedMethod: "POST", status: 204 },
    // No token is supplied. Reaching the API's 401 proves the proxy did not
    // redirect the request or replace authentication with a static response.
    { path: collection, method: "GET", status: 401 }
  ];
  const results = [];
  for (const check of checks) {
    const headers = { Origin: adminOrigin };
    if (check.requestedMethod) {
      headers["Access-Control-Request-Method"] = check.requestedMethod;
      headers["Access-Control-Request-Headers"] = "authorization,content-type";
    }
    const response = await fetch(`${base}${check.path}`, {
      method: check.method, headers, redirect: "manual", signal: AbortSignal.timeout(15_000)
    });
    const body = await response.text();
    const label = `${check.method} ${check.path}${check.requestedMethod ? ` (${check.requestedMethod})` : ""}`;
    if (response.status !== check.status || response.headers.has("location")) {
      throw new Error(`${label}: expected HTTP ${check.status} without redirect, got ${response.status}`);
    }
    if (response.headers.get("access-control-allow-origin") !== adminOrigin) {
      throw new Error(`${label}: missing admin CORS origin`);
    }
    if (check.requestedMethod) {
      const methods = (response.headers.get("access-control-allow-methods") || "").split(/\s*,\s*/);
      const allowedHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase().split(/\s*,\s*/);
      if (!methods.includes(check.requestedMethod) || !["authorization", "content-type"].every(h => allowedHeaders.includes(h))) {
        throw new Error(`${label}: incomplete preflight permissions`);
      }
    } else if (!response.headers.get("content-type")?.includes("application/json") || JSON.parse(body).statusCode !== 401) {
      throw new Error(`${label}: expected API authentication response`);
    }
    results.push({ request: label, status: response.status });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkInvitationProxy({ apiBase: process.env.API_BASE, adminOrigin: process.env.ADMIN_ORIGIN })
    .then(results => console.log(JSON.stringify({ invitationProxy: "PASS", results }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
