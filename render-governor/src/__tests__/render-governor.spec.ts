import { createGovernedRuntimeContext, governRender } from "../index";

const context = createGovernedRuntimeContext({
  page: "home",
  platform: "h5"
});

const result = governRender(
  {
    page: "home",
    components: [
      {
        id: "hero-1",
        type: "hero-banner",
        enabled: true,
        sortOrder: 0,
        config: { title: "Hello" }
      }
    ]
  },
  { context }
);

assertEqual(result.dsl.schemaVersion, "p9", "schema");
assertEqual(Array.isArray(result.dsl.dsl.nodes), true, "locked dsl nodes");
assertEqual(result.tree.nodes.length, 1, "node count");
assertEqual(result.tree.nodes[0].type, "ds-banner", "governed type");
assertEqual(result.warnings[0]?.code, "LEGACY_CMS_COMPONENTS", "warning");

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
