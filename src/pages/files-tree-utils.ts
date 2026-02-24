import type { FileTreeNode } from '../types';

export function collectVisibleNodeIds(
  nodes: FileTreeNode[],
  expanded: Record<string, boolean>
): string[] {
  const result: string[] = [];

  function walk(items: FileTreeNode[]) {
    for (const node of items) {
      result.push(node.id);
      if (node.type === 'directory' && node.children?.length && expanded[node.id]) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return result;
}

export function toggleExpanded(expanded: Record<string, boolean>, nodeId: string) {
  return {
    ...expanded,
    [nodeId]: !expanded[nodeId]
  };
}
