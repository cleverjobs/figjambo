import type { DocumentPayload, ExtractedNode } from '@figjambo/shared';

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function renderNode(node: ExtractedNode, allNodes: Map<string, ExtractedNode>): string {
  switch (node.type) {
    case 'STICKY': {
      const color = node.metadata.fillColor ? `[${node.metadata.fillColor}] ` : '';
      return `> ${color}${node.text}\n`;
    }

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

    case 'STAMP': {
      return `[STAMP: ${node.metadata.stampExpression || node.text}]\n`;
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

interface NodeGroup {
  heading: string;
  headingLevel: number;
  children: ExtractedNode[];
}

function groupNodesByParent(nodes: ExtractedNode[]): NodeGroup[] {
  // Build parent → children map
  const childrenOf = new Map<string, ExtractedNode[]>();
  const topLevel: ExtractedNode[] = [];
  const nodeById = new Map<string, ExtractedNode>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  for (const node of nodes) {
    if (node.type === 'SECTION' || node.type === 'FRAME') continue; // Sections are headings, not content

    if (node.parentId && (node.parentType === 'SECTION' || node.parentType === 'FRAME')) {
      const existing = childrenOf.get(node.parentId) || [];
      existing.push(node);
      childrenOf.set(node.parentId, existing);
    } else {
      topLevel.push(node);
    }
  }

  const groups: NodeGroup[] = [];

  // Sections and frames become groups
  for (const node of nodes) {
    if (node.type === 'SECTION' || node.type === 'FRAME') {
      const children = childrenOf.get(node.id) || [];
      // Sort children by position: top-to-bottom, left-to-right
      children.sort((a, b) => a.y - b.y || a.x - b.x);
      groups.push({
        heading: node.text || node.type,
        headingLevel: node.type === 'SECTION' ? 2 : 3,
        children,
      });
    }
  }

  // Sort groups by position
  const sectionNodes = nodes.filter(n => n.type === 'SECTION' || n.type === 'FRAME');
  groups.sort((a, b) => {
    const aNode = sectionNodes.find(n => n.text === a.heading);
    const bNode = sectionNodes.find(n => n.text === b.heading);
    if (!aNode || !bNode) return 0;
    return aNode.y - bNode.y || aNode.x - bNode.x;
  });

  // Add ungrouped top-level content
  if (topLevel.length > 0) {
    topLevel.sort((a, b) => a.y - b.y || a.x - b.x);
    groups.push({
      heading: 'Ungrouped Content',
      headingLevel: 2,
      children: topLevel,
    });
  }

  return groups;
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

  // Group and render
  const groups = groupNodesByParent(payload.nodes);

  for (const group of groups) {
    const hashes = '#'.repeat(group.headingLevel);
    lines.push(`${hashes} ${group.heading}`);
    lines.push('');

    for (const node of group.children) {
      if (!node.visible) continue;
      const rendered = renderNode(node, allNodes).trim();
      if (rendered) {
        lines.push(rendered);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
