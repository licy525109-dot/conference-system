import type { DslNode, PageDsl } from "./types";

export function parseDsl(input: unknown, fallbackPage = "custom"): PageDsl {
  if (!isRecord(input)) {
    return emptyDsl(fallbackPage);
  }

  const schemaVersion = input.schemaVersion === "p9" ? "p9" : "p9";
  const page = typeof input.page === "string" && input.page.trim() ? input.page : fallbackPage;
  const sourceDsl = isRecord(input.dsl) ? input.dsl : {};
  const rawNodes = Array.isArray(sourceDsl.nodes) ? sourceDsl.nodes : [];
  return {
    schemaVersion,
    page,
    dsl: {
      nodes: normalizeNodes(rawNodes)
    },
    theme: isRecord(input.theme) ? input.theme : undefined,
    meta: isRecord(input.meta) ? input.meta : undefined
  };
}

function normalizeNodes(nodes: unknown[]): DslNode[] {
  return nodes
    .map((node, index) => normalizeNode(node, index))
    .filter((node): node is DslNode => Boolean(node))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function normalizeNode(value: unknown, index: number): DslNode | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" && value.type.trim() ? value.type : "ds-section";
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : `${type}-${index}`,
    type,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10,
    props: isRecord(value.props) ? value.props : {},
    children: Array.isArray(value.children) ? normalizeNodes(value.children) : [],
    dataSource: typeof value.dataSource === "string" ? value.dataSource : undefined,
    bindings: isStringRecord(value.bindings) ? value.bindings : undefined,
    meta: isRecord(value.meta) ? value.meta : {}
  };
}

function emptyDsl(page: string): PageDsl {
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: []
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
