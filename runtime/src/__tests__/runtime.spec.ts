import { createRuntimeContext, renderDsl } from "../index";

const context = createRuntimeContext({
  page: "home",
  platform: "h5",
  data: {
    conferences: [{ id: "c1", title: "Demo" }]
  }
});

const dsl = {
  schemaVersion: "p9" as const,
  page: "home",
  dsl: {
    nodes: [
      {
        id: "hero-1",
        type: "ds-banner",
        enabled: true,
        sortOrder: 20,
        props: { title: "Hello" }
      },
      {
        id: "hidden",
        type: "ds-list",
        enabled: false,
        sortOrder: 10,
        props: { title: "Hidden" }
      }
    ]
  }
};

const tree = renderDsl(dsl, context);

assertEqual(tree.schemaVersion, "p9", "schema version");
assertEqual(tree.page, "home", "page");
assertEqual(tree.nodes.length, 1, "visible node count");
assertEqual(tree.nodes[0].type, "ds-banner", "component type");
assertEqual(tree.nodes[0].props.title, "Hello", "mapped props");
assertEqual(tree.warnings.length, 0, "warnings");

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
