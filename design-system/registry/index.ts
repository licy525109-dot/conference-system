export type ComponentSchema = Record<string, unknown>;

export interface RenderDescriptor {
  component: string;
  props: Record<string, unknown>;
  slots?: Record<string, RenderDescriptor[]>;
}

export interface ComponentRenderContext {
  themeId: string;
  platform: "admin" | "h5" | "miniapp";
  data: Record<string, unknown>;
}

export interface RegisteredComponent {
  type: string;
  schema: ComponentSchema;
  render: (props: Record<string, unknown>, context: ComponentRenderContext) => RenderDescriptor;
  editor?: ComponentSchema;
  meta?: Record<string, unknown>;
}

export interface ComponentPluginManifest {
  id: string;
  name: string;
  version: string;
  components: RegisteredComponent[];
  sandbox: {
    runtime: "platform-renderer";
    permissions: string[];
  };
}

export class ComponentRegistry {
  private readonly components = new Map<string, RegisteredComponent>();
  private readonly plugins = new Map<string, ComponentPluginManifest>();

  register(component: RegisteredComponent): void {
    if (!component.type.trim()) {
      throw new Error("Component type is required.");
    }
    this.components.set(component.type, component);
  }

  get(type: string): RegisteredComponent | undefined {
    return this.components.get(type);
  }

  has(type: string): boolean {
    return this.components.has(type);
  }

  list(): RegisteredComponent[] {
    return Array.from(this.components.values());
  }

  installPlugin(plugin: ComponentPluginManifest): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Component plugin already installed: ${plugin.id}`);
    }
    for (const component of plugin.components) this.register(component);
    this.plugins.set(plugin.id, plugin);
  }

  uninstallPlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    for (const component of plugin.components) this.components.delete(component.type);
    this.plugins.delete(pluginId);
  }

  listPlugins(): ComponentPluginManifest[] {
    return Array.from(this.plugins.values());
  }
}

export function createComponentRegistry(components: RegisteredComponent[] = []): ComponentRegistry {
  const registry = new ComponentRegistry();
  for (const component of components) registry.register(component);
  return registry;
}

export function registerComponent(registry: ComponentRegistry, component: RegisteredComponent): ComponentRegistry {
  registry.register(component);
  return registry;
}

export function installComponentPlugin(registry: ComponentRegistry, plugin: ComponentPluginManifest): ComponentRegistry {
  registry.installPlugin(plugin);
  return registry;
}
