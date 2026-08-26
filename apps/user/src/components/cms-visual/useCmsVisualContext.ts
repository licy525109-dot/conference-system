import type { PageDsl } from "@conference/dsl-runtime";
import { expandLegacyCmsTemplate } from "@conference/shared";
import type { CmsComponent } from "@/services/cms";
import {
  cmsVisualComponentsFromDsl,
  hasCmsVisualComponents,
  hasLegacyCmsVisualNodes,
  isFixedBusinessTemplateComponent
} from "./cmsVisualDslAdapter";

export { cmsVisualComponentsFromDsl, hasCmsVisualComponents, hasLegacyCmsVisualNodes } from "./cmsVisualDslAdapter";

export function expandedCmsVisualComponentsFromDsl(dsl: PageDsl): CmsComponent[] {
  return cmsVisualComponentsFromDsl(dsl).flatMap(expandCmsVisualComponent);
}

export function runtimeCmsVisualComponentsFromDsl(dsl: PageDsl): CmsComponent[] {
  const components = cmsVisualComponentsFromDsl(dsl);
  if (hasCmsVisualComponents(dsl) || hasLegacyCmsVisualNodes(dsl)) {
    return components.flatMap(expandCmsVisualComponent);
  }

  return components.filter(isFixedBusinessTemplateComponent).flatMap(expandCmsVisualComponent);
}

export function expandCmsVisualComponent(component: CmsComponent): CmsComponent[] {
  if (component.type !== "fixed-business-template") return [component];
  return expandLegacyCmsTemplate(component);
}
