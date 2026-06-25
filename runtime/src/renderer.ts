import type { ComponentRenderContext } from "@conference/design-system";
import { parseDsl } from "./parser";
import { resolveNodes } from "./resolver";
import type { PageDsl, RuntimeContext, RuntimeRenderTree } from "./types";

export function renderDsl(input: PageDsl | unknown, context: RuntimeContext): RuntimeRenderTree {
  const dsl = parseDsl(input, context.page);
  const warnings: string[] = [];
  const nodes = resolveNodes(dsl.dsl.nodes, context, warnings);
  const renderContext: ComponentRenderContext = {
    themeId: context.theme.id,
    platform: context.platform,
    data: context.data
  };

  for (const node of nodes) {
    node.component.render(node.props, renderContext);
  }

  return {
    schemaVersion: "p9",
    page: dsl.page,
    themeId: context.theme.id,
    nodes,
    warnings
  };
}
