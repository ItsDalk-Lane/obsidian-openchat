import type { RuntimeAdapter, RuntimeDescriptor, RuntimeKind } from "@/lib/kernel";

type RuntimeRegistryListener = (descriptors: RuntimeDescriptor[]) => void;

export class RuntimeRegistry {
  private readonly adapters = new Map<RuntimeKind, RuntimeAdapter>();
  private readonly listeners = new Set<RuntimeRegistryListener>();

  register(adapter: RuntimeAdapter): void {
    const current = this.adapters.get(adapter.descriptor.id);
    if (current) {
      throw new Error(`Runtime ${adapter.descriptor.id} is already registered`);
    }
    this.adapters.set(adapter.descriptor.id, adapter);
    this.emitChange();
  }

  unregister(runtimeKind: RuntimeKind): void {
    if (!this.adapters.delete(runtimeKind)) return;
    this.emitChange();
  }

  get(runtimeKind: RuntimeKind): RuntimeAdapter | null {
    return this.adapters.get(runtimeKind) ?? null;
  }

  list(): RuntimeDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor);
  }

  subscribe(listener: RuntimeRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.adapters.clear();
    this.listeners.clear();
  }

  private emitChange(): void {
    const descriptors = this.list();
    for (const listener of this.listeners) {
      listener(descriptors);
    }
  }
}
