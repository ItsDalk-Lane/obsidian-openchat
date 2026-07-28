import type { SessionInfo } from "./types";

export interface SessionListTreeNode {
  session: SessionInfo;
  children: SessionListTreeNode[];
}

export function buildSessionTree(sessions: SessionInfo[]): SessionListTreeNode[] {
  const byId = new Map<string, SessionListTreeNode>();
  for (const session of sessions) {
    byId.set(session.id, { session, children: [] });
  }

  const parentOf = new Map<string, string>();
  for (const session of sessions) {
    if (session.parentSessionId) parentOf.set(session.id, session.parentSessionId);
  }

  function resolveAncestor(id: string): string | null {
    let current = parentOf.get(id);
    let nearestAncestor: string | null = null;
    const visited = new Set([id]);

    while (current) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (nearestAncestor === null && byId.has(current)) {
        nearestAncestor = current;
      }
      current = parentOf.get(current);
    }

    return nearestAncestor;
  }

  const roots: SessionListTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: SessionListTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}
