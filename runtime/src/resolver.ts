import type { DslNode, ResolvedDslNode, RuntimeContext } from "./types";

export function resolveNodes(nodes: DslNode[], context: RuntimeContext, warnings: string[] = []): ResolvedDslNode[] {
  return nodes
    .filter((node) => node.enabled !== false)
    .map((node) => resolveNode(node, context, warnings))
    .filter((node): node is ResolvedDslNode => Boolean(node));
}

export function resolveNode(node: DslNode, context: RuntimeContext, warnings: string[]): ResolvedDslNode | null {
  const component = context.registry.get(node.type);
  if (!component) {
    warnings.push(`Unknown DSL component: ${node.type}`);
    return null;
  }

  const props = resolveProps(node, context);
  return {
    id: node.id,
    type: node.type,
    props,
    children: resolveNodes(node.children ?? [], context, warnings),
    component,
    meta: node.meta ?? {}
  };
}

export function resolveProps(node: DslNode, context: RuntimeContext): Record<string, unknown> {
  const props = { ...(node.props ?? {}) };
  const source = node.dataSource ? context.data[node.dataSource] : undefined;
  if (source !== undefined) {
    props.data = source;
  }

  for (const [target, path] of Object.entries(node.bindings ?? {})) {
    const value = readPath(context.data, path);
    if (value !== undefined) props[target] = value;
  }

  return props;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}
