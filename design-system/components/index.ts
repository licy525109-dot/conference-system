import { createComponentRegistry, type ComponentRegistry, type RegisteredComponent } from "../registry/index";

const baseSchema = {
  type: "object",
  additionalProperties: true
};

function component(type: string, displayName: string, props: string[]): RegisteredComponent {
  return {
    type,
    schema: {
      ...baseSchema,
      properties: Object.fromEntries(props.map((prop) => [prop, { type: ["string", "number", "boolean", "array", "object", "null"] }]))
    },
    render: (inputProps) => ({
      component: displayName,
      props: inputProps
    }),
    editor: {
      group: "Design System",
      displayName,
      editableProps: props
    },
    meta: {
      displayName
    }
  };
}

export const DSButton = component("ds-button", "DSButton", ["text", "variant", "size", "disabled", "action"]);
export const DSCard = component("ds-card", "DSCard", ["title", "subtitle", "imageUrl", "meta", "action"]);
export const DSGrid = component("ds-grid", "DSGrid", ["title", "columns", "items", "gap"]);
export const DSBanner = component("ds-banner", "DSBanner", ["title", "subtitle", "description", "imageUrl", "actions", "height"]);
export const DSList = component("ds-list", "DSList", ["title", "items", "itemVariant", "emptyText"]);
export const DSSection = component("ds-section", "DSSection", ["title", "description", "children", "spacing"]);
export const DSTag = component("ds-tag", "DSTag", ["text", "tone", "size"]);
export const DSImage = component("ds-image", "DSImage", ["src", "alt", "mode", "ratio"]);
export const DSCarousel = component("ds-carousel", "DSCarousel", ["images", "autoplay", "indicatorDots", "height"]);

export const designSystemComponents: RegisteredComponent[] = [
  DSButton,
  DSCard,
  DSGrid,
  DSBanner,
  DSList,
  DSSection,
  DSTag,
  DSImage,
  DSCarousel
];

export function createDesignSystemRegistry(): ComponentRegistry {
  return createComponentRegistry(designSystemComponents);
}
