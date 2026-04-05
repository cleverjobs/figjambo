import type { DocumentPayload, ExtractedNode } from '@figjambo/shared';

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function renderNode(node: ExtractedNode, allNodes: Map<string, ExtractedNode>): string {
  switch (node.type) {
    case 'STICKY': {
      // Normalize line separators, convert • to markdown list, blockquote each line
      const lines = node.text
        .replace(/[\u2028\u2029]/g, '\n')
        .split('\n')
        .map(line => {
          // Convert extracted bullet markers to markdown
          if (line.startsWith('• ')) return `> - ${line.slice(2)}`;
          if (/^\d+\. /.test(line)) return `> ${line}`;
          return `> ${line}`;
        });
      return lines.join('\n') + '\n';
    }

    case 'STAMP':
      return '';

    case 'TEXT': {
      const size = node.metadata.fontSize;
      if (size && size >= 36) return `# ${node.text}\n`;
      if (size && size >= 24) return `## ${node.text}\n`;
      if (size && size >= 18) return `### ${node.text}\n`;
      return `${node.text}\n`;
    }

    case 'SHAPE_WITH_TEXT': {
      const shape = node.metadata.shapeType || 'Shape';
      return `**[${shape}]** ${node.text}\n`;
    }

    case 'CODE_BLOCK': {
      const lang = node.metadata.codeLanguage?.toLowerCase() || '';
      return `\`\`\`${lang}\n${node.text}\n\`\`\`\n`;
    }

    case 'TABLE': {
      if (!node.metadata.cells || !node.metadata.numColumns) return '';
      const cols = node.metadata.numColumns;
      const rows = node.metadata.numRows || 0;

      const grid: string[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => '')
      );
      for (const cell of node.metadata.cells) {
        if (cell.row < rows && cell.column < cols) {
          grid[cell.row][cell.column] = cell.text;
        }
      }

      const lines: string[] = [];
      if (grid.length > 0) {
        lines.push('| ' + grid[0].map(c => c || ' ').join(' | ') + ' |');
        lines.push('| ' + grid[0].map(() => '---').join(' | ') + ' |');
        for (let r = 1; r < grid.length; r++) {
          lines.push('| ' + grid[r].map(c => c || ' ').join(' | ') + ' |');
        }
      }
      return lines.join('\n') + '\n';
    }

    case 'CONNECTOR': {
      const startNode = node.metadata.connectorStartId
        ? allNodes.get(node.metadata.connectorStartId)
        : null;
      const endNode = node.metadata.connectorEndId
        ? allNodes.get(node.metadata.connectorEndId)
        : null;

      const startLabel = startNode
        ? truncate(startNode.text || startNode.id, 40)
        : '?';
      const endLabel = endNode
        ? truncate(endNode.text || endNode.id, 40)
        : '?';
      const label = node.text ? ` --"${node.text}"--> ` : ' --> ';
      return `_${startLabel}${label}${endLabel}_\n`;
    }

    // STAMP handled above (skipped)

    case 'LINK_UNFURL': {
      const url = node.metadata.linkUrl || '';
      const title = node.metadata.linkTitle || node.text || url;
      const desc = node.metadata.linkDescription ? ` — ${node.metadata.linkDescription}` : '';
      return url ? `[${title}](${url})${desc}\n` : `${title}${desc}\n`;
    }

    case 'EMBED': {
      const url = node.metadata.embedUrl || '';
      const title = node.text || 'Embed';
      return url ? `[${title}](${url})\n` : `${title}\n`;
    }

    case 'MEDIA': {
      if (node.metadata.imageHashes && node.metadata.imageHashes.length > 0) {
        return node.metadata.imageHashes
          .map(ref => `![${node.text || 'image'}](./assets/${ref.imageHash}.png)\n`)
          .join('');
      }
      return `[MEDIA: ${node.text}]\n`;
    }

    default:
      return node.text ? `${node.text}\n` : '';
  }
}

// ─── Recursive section tree ──────────────────────────────────

interface SectionTree {
  node: ExtractedNode;
  depth: number;
  children: ExtractedNode[];       // Non-section content nodes
  subsections: SectionTree[];      // Nested sections/frames
}

function isContainer(node: ExtractedNode): boolean {
  return node.type === 'SECTION' || node.type === 'FRAME';
}

function getDepth(node: ExtractedNode, nodeMap: Map<string, ExtractedNode>): number {
  let depth = 0;
  let current = node;
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent || !isContainer(parent)) break;
    depth++;
    current = parent;
  }
  return depth;
}

function buildSectionTree(nodes: ExtractedNode[]): { roots: SectionTree[]; ungrouped: ExtractedNode[] } {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const containers = nodes.filter(isContainer);
  const treeMap = new Map<string, SectionTree>();

  // Create tree nodes for all containers
  for (const node of containers) {
    treeMap.set(node.id, {
      node,
      depth: getDepth(node, nodeMap),
      children: [],
      subsections: [],
    });
  }

  // Assign content nodes to their parent container
  const ungrouped: ExtractedNode[] = [];
  for (const node of nodes) {
    if (isContainer(node)) continue;
    if (node.parentId && treeMap.has(node.parentId)) {
      treeMap.get(node.parentId)!.children.push(node);
    } else {
      ungrouped.push(node);
    }
  }

  // Build parent-child relationships between containers
  const roots: SectionTree[] = [];
  for (const tree of treeMap.values()) {
    const parentId = tree.node.parentId;
    if (parentId && treeMap.has(parentId)) {
      treeMap.get(parentId)!.subsections.push(tree);
    } else {
      roots.push(tree);
    }
  }

  // Sort everything by position (Y then X)
  const byPosition = (a: { node: ExtractedNode } | ExtractedNode, b: { node: ExtractedNode } | ExtractedNode) => {
    const aNode = 'node' in a ? a.node : a;
    const bNode = 'node' in b ? b.node : b;
    return aNode.y - bNode.y || aNode.x - bNode.x;
  };

  roots.sort(byPosition);
  for (const tree of treeMap.values()) {
    tree.children.sort((a, b) => a.y - b.y || a.x - b.x);
    tree.subsections.sort(byPosition);
  }
  ungrouped.sort((a, b) => a.y - b.y || a.x - b.x);

  return { roots, ungrouped };
}

function renderSectionTree(
  tree: SectionTree,
  allNodes: Map<string, ExtractedNode>,
  lines: string[]
): void {
  const level = Math.min(2 + tree.depth, 6);
  const hashes = '#'.repeat(level);
  lines.push(`${hashes} ${tree.node.text || tree.node.type}`);
  lines.push('');

  // Render content children
  for (const child of tree.children) {
    if (!child.visible) continue;
    const rendered = renderNode(child, allNodes).trim();
    if (rendered) {
      lines.push(rendered);
      lines.push('');
    }
  }

  // Render subsections recursively
  for (const sub of tree.subsections) {
    renderSectionTree(sub, allNodes, lines);
  }
}

export function convertToMarkdown(payload: DocumentPayload): string {
  const lines: string[] = [];
  const allNodes = new Map(payload.nodes.map(n => [n.id, n]));

  // Header
  lines.push(`# ${payload.documentName} — ${payload.pageName}`);
  lines.push('');
  lines.push(`_Extracted: ${payload.extractedAt}_`);
  lines.push(`_Nodes: ${payload.nodeCount} | Images: ${payload.imageCount}_`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Build and render section tree
  const { roots, ungrouped } = buildSectionTree(payload.nodes);

  for (const root of roots) {
    renderSectionTree(root, allNodes, lines);
    lines.push('---');
    lines.push('');
  }

  // Ungrouped content
  if (ungrouped.length > 0) {
    lines.push('## Ungrouped Content');
    lines.push('');

    for (const node of ungrouped) {
      if (!node.visible) continue;
      const rendered = renderNode(node, allNodes).trim();
      if (rendered) {
        lines.push(rendered);
        lines.push('');
      }
    }
  }

  return lines.join('\n').replace(/[\u2028\u2029]/g, '\n');
}
