export type OperationKind = "prompt" | "bash" | "compact";

export class OperationLifecycleTracker {
  private active = new Map<OperationKind, string>();
  private terminal = new Set<string>();

  begin(kind: OperationKind, operationId: string): void {
    this.active.set(kind, operationId);
    this.terminal.delete(operationId);
  }

  current(kind: OperationKind): string | undefined {
    return this.active.get(kind);
  }

  finish(kind: OperationKind, operationId: string): boolean {
    const active = this.active.get(kind);
    if (!active || active !== operationId || this.terminal.has(operationId)) return false;
    this.terminal.add(operationId);
    this.active.delete(kind);
    return true;
  }

  abort(kind: OperationKind): string | undefined {
    const active = this.active.get(kind);
    if (!active || this.terminal.has(active)) return undefined;
    this.terminal.add(active);
    this.active.delete(kind);
    return active;
  }
}
