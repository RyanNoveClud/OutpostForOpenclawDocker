import { collectVisibleNodeIds, toggleExpanded } from '../pages/files-tree-utils.js';
import type { FileTreeNode } from '../types/index.js';

function run() {
  const tree: FileTreeNode[] = [
    {
      id: 'root',
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [
        { id: 'child-1', name: 'pages', path: 'src/pages', type: 'directory' },
        {
          id: 'child-2',
          name: 'components',
          path: 'src/components',
          type: 'directory',
          children: [{ id: 'leaf', name: 'A.tsx', path: 'src/components/A.tsx', type: 'file' }]
        }
      ]
    }
  ];

  const collapsed = collectVisibleNodeIds(tree, {});
  if (collapsed.length !== 1) throw new Error('T16_FAIL: collapsed tree should show root only');

  const expandedRoot = collectVisibleNodeIds(tree, { root: true });
  if (expandedRoot.length !== 3) throw new Error('T16_FAIL: root expand failed');

  const expandedDeep = collectVisibleNodeIds(tree, { root: true, 'child-2': true });
  if (!expandedDeep.includes('leaf')) throw new Error('T16_FAIL: deep node render failed');

  const toggled = toggleExpanded({ root: true }, 'root');
  if (toggled.root !== false) throw new Error('T16_FAIL: toggle failed');

  console.log('T16_FILES_TREE_SMOKE_PASS');
}

run();
