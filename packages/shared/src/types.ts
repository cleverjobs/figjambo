// ─── Node Types ──────────────────────────────────────────────

export type NodeType =
  | 'STICKY'
  | 'TEXT'
  | 'SHAPE_WITH_TEXT'
  | 'CONNECTOR'
  | 'CODE_BLOCK'
  | 'TABLE'
  | 'SECTION'
  | 'STAMP'
  | 'FRAME'
  | 'MEDIA';

// ─── Metadata ────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface TableCell {
  row: number;
  column: number;
  text: string;
}

export interface ImageRef {
  imageHash: string;
  originalWidth: number;
  originalHeight: number;
}

export interface NodeMetadata {
  // STICKY
  fillColor?: string;

  // TEXT
  fontSize?: number | null;
  fontFamily?: string | null;
  fontWeight?: number | null;

  // SHAPE_WITH_TEXT
  shapeType?: string;

  // CONNECTOR
  connectorStartId?: string;
  connectorEndId?: string;
  connectorStartPosition?: Point;
  connectorEndPosition?: Point;
  connectorType?: string;

  // CODE_BLOCK
  codeLanguage?: string;

  // TABLE
  numRows?: number;
  numColumns?: number;
  cells?: TableCell[];

  // SECTION / FRAME
  childCount?: number;

  // STAMP
  stampExpression?: string;

  // MEDIA / any node with image fills
  imageHashes?: ImageRef[];
}

// ─── Extracted Node ──────────────────────────────────────────

export interface ExtractedNode {
  id: string;
  type: NodeType;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  parentType: string | null;
  parentName: string | null;
  visible: boolean;
  metadata: NodeMetadata;
}

// ─── Document Payload ────────────────────────────────────────

export interface DocumentPayload {
  documentName: string;
  pageName: string;
  extractedAt: string;
  nodeCount: number;
  imageCount: number;
  nodes: ExtractedNode[];
}

// ─── Plugin ↔ UI Messages ───────────────────────────────────

export type UIMessage =
  | { type: 'start-extract' }
  | { type: 'set-server-url'; url: string };

export type PluginMessage =
  | { type: 'extract-progress'; current: number; total: number }
  | { type: 'nodes-complete'; payload: DocumentPayload }
  | { type: 'image'; hash: string; bytes: Uint8Array; filename: string; width: number; height: number }
  | { type: 'images-complete'; count: number }
  | { type: 'extract-error'; error: string };

// ─── Server Responses ────────────────────────────────────────

export interface ExtractResponse {
  status: 'success' | 'error';
  filepath?: string;
  nodeCount?: number;
  error?: string;
}

export interface UploadResponse {
  status: 'success' | 'error';
  filepath?: string;
  skipped?: boolean;
  error?: string;
}
