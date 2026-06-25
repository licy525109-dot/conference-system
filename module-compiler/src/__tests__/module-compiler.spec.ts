import { strictEqual } from "node:assert";
import { compileBusinessModules, defaultModulesForPage, extractBusinessModules } from "../index";

const modules = defaultModulesForPage("home");
const result = compileBusinessModules({ page: "home", modules });

strictEqual(result.dsl.schemaVersion, "p9");
strictEqual(result.dsl.page, "home");
strictEqual(result.dsl.dsl.nodes.length, 3);
strictEqual(result.dsl.dsl.nodes[0].type, "ds-banner");
strictEqual(Array.isArray(result.dsl.meta?.businessModules), true);

const extracted = extractBusinessModules(result.dsl, "home");
strictEqual(extracted.modules.length, 3);
strictEqual(extracted.modules[0].type, "home-hero");
