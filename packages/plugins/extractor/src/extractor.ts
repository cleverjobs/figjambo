import type { ExtractedNode, NodeMetadata, ImageRef, TableCell, NodeType } from '@figjambo/shared';

// ─── Helpers ─────────────────────────────────────────────────

function safeGetFills(node: MinimalFillsMixin): ReadonlyArray<Paint> {
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return [];
  return fills;
}

function extractFillColor(node: MinimalFillsMixin): string | undefined {
  for (const fill of safeGetFills(node)) {
    if (fill.type === 'SOLID' && fill.visible !== false) {
      const { r, g, b } = fill.color;
      const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    }
  }
  return undefined;
}

function safeGetFontSize(node: TextNode): number | null {
  if (node.fontSize === figma.mixed) {
    try {
      return node.getRangeFontSize(0, 1) as number;
    } catch {
      return null;
    }
  }
  return node.fontSize as number;
}

function safeGetFontFamily(node: TextNode): string | null {
  if (node.fontName === figma.mixed) {
    try {
      const font = node.getRangeFontName(0, 1) as FontName;
      return font.family;
    } catch {
      return null;
    }
  }
  return (node.fontName as FontName).family;
}

function extractConnectorEndpoint(
  endpoint: ConnectorEndpoint
): { nodeId?: string; position?: { x: number; y: number } } {
  if ('endpointNodeId' in endpoint && endpoint.endpointNodeId) {
    return { nodeId: endpoint.endpointNodeId };
  }
  if ('position' in endpoint && endpoint.position) {
    return { position: { x: endpoint.position.x, y: endpoint.position.y } };
  }
  return {};
}

async function extractImageRefs(node: SceneNode): Promise<ImageRef[]> {
  const refs: ImageRef[] = [];
  if (!('fills' in node)) return refs;

  for (const fill of safeGetFills(node as MinimalFillsMixin)) {
    if (fill.type === 'IMAGE' && fill.imageHash) {
      const image = figma.getImageByHash(fill.imageHash);
      if (image) {
        try {
          const size = await image.getSizeAsync();
          refs.push({
            imageHash: fill.imageHash,
            originalWidth: size.width,
            originalHeight: size.height,
          });
        } catch {
          refs.push({
            imageHash: fill.imageHash,
            originalWidth: 0,
            originalHeight: 0,
          });
        }
      }
    }
  }
  return refs;
}

function extractTableCells(node: TableNode): TableCell[] {
  const cells: TableCell[] = [];
  for (let row = 0; row < node.numRows; row++) {
    for (let col = 0; col < node.numColumns; col++) {
      try {
        const cell = node.cellAt(row, col);
        cells.push({ row, column: col, text: cell.text.characters });
      } catch {
        cells.push({ row, column: col, text: '' });
      }
    }
  }
  return cells;
}

// ─── Main Extraction ─────────────────────────────────────────

async function extractNode(
  node: SceneNode,
  parent: BaseNode | null
): Promise<ExtractedNode | null> {
  const base = {
    id: node.id,
    x: 'x' in node ? (node as any).x : 0,
    y: 'y' in node ? (node as any).y : 0,
    width: 'width' in node ? (node as any).width : 0,
    height: 'height' in node ? (node as any).height : 0,
    parentId: parent && 'id' in parent ? parent.id : null,
    parentType: parent && 'type' in parent ? (parent as SceneNode).type : null,
    parentName: parent && 'name' in parent ? parent.name : null,
    visible: node.visible,
  };

  let type: NodeType;
  let text = '';
  const metadata: NodeMetadata = {};

  switch (node.type) {
    case 'STICKY': {
      type = 'STICKY';
      text = node.text.characters;
      metadata.fillColor = extractFillColor(node);
      break;
    }
    case 'TEXT': {
      type = 'TEXT';
      text = node.characters;
      metadata.fontSize = safeGetFontSize(node);
      metadata.fontFamily = safeGetFontFamily(node);
      break;
    }
    case 'SHAPE_WITH_TEXT': {
      type = 'SHAPE_WITH_TEXT';
      text = node.text.characters;
      metadata.shapeType = node.shapeType;
      break;
    }
    case 'CONNECTOR': {
      type = 'CONNECTOR';
      text = node.text.characters;
      metadata.connectorType = node.connectorLineType;
      const start = extractConnectorEndpoint(node.connectorStart);
      const end = extractConnectorEndpoint(node.connectorEnd);
      if (start.nodeId) metadata.connectorStartId = start.nodeId;
      if (start.position) metadata.connectorStartPosition = start.position;
      if (end.nodeId) metadata.connectorEndId = end.nodeId;
      if (end.position) metadata.connectorEndPosition = end.position;
      break;
    }
    case 'CODE_BLOCK': {
      type = 'CODE_BLOCK';
      text = node.code;
      metadata.codeLanguage = node.codeLanguage;
      break;
    }
    case 'TABLE': {
      type = 'TABLE';
      metadata.numRows = node.numRows;
      metadata.numColumns = node.numColumns;
      metadata.cells = extractTableCells(node);
      break;
    }
    case 'SECTION': {
      type = 'SECTION';
      text = node.name;
      metadata.childCount = node.children.length;
      break;
    }
    case 'STAMP': {
      type = 'STAMP';
      text = node.name;
      metadata.stampExpression = node.name;
      break;
    }
    case 'FRAME': {
      type = 'FRAME';
      text = node.name;
      if ('children' in node) {
        metadata.childCount = (node as FrameNode).children.length;
      }
      break;
    }
    case 'MEDIA': {
      type = 'MEDIA';
      text = node.name;
      break;
    }
    default:
      // Skip unsupported node types (rectangles, ellipses, etc. without text)
      // But still check for image fills
      const imageRefs = await extractImageRefs(node);
      if (imageRefs.length > 0) {
        return {
          ...base,
          type: 'MEDIA',
          text: node.name,
          metadata: { imageHashes: imageRefs },
        };
      }
      return null;
  }

  // Check for image fills on all supported types
  const imageRefs = await extractImageRefs(node);
  if (imageRefs.length > 0) {
    metadata.imageHashes = imageRefs;
  }

  return { ...base, type, text, metadata };
}

export interface ExtractionResult {
  nodes: ExtractedNode[];
  imageHashes: Set<string>;
}

export async function extractAllNodes(
  page: PageNode,
  onProgress: (current: number, total: number) => void
): Promise<ExtractionResult> {
  const nodes: ExtractedNode[] = [];
  const imageHashes = new Set<string>();

  // Collect all scene nodes first for progress tracking
  const allNodes: Array<{ node: SceneNode; parent: BaseNode | null }> = [];

  function collectNodes(node: SceneNode, parent: BaseNode | null) {
    allNodes.push({ node, parent });
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        collectNodes(child as SceneNode, node);
      }
    }
  }

  for (const child of page.children) {
    collectNodes(child, page);
  }

  const total = allNodes.length;
  for (let i = 0; i < allNodes.length; i++) {
    const { node, parent } = allNodes[i];
    const extracted = await extractNode(node, parent);

    if (extracted) {
      nodes.push(extracted);
      if (extracted.metadata.imageHashes) {
        for (const ref of extracted.metadata.imageHashes) {
          imageHashes.add(ref.imageHash);
        }
      }
    }

    // Report progress every 50 nodes
    if (i % 50 === 0 || i === total - 1) {
      onProgress(i + 1, total);
    }
  }

  return { nodes, imageHashes };
}
