export interface DesignRenderNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: DesignRenderNode[];
  descriptor: {
    component: string;
    props: Record<string, unknown>;
  };
}

export interface DesignRenderTree {
  page: string;
  themeId: string;
  nodes: DesignRenderNode[];
}
