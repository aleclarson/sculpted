// ─── Owner Graph ─────────────────────────────────────────────────────────────

export type NodeType =
  | 'component_instance'
  | 'component_def'
  | 'style_class'
  | 'style_file'
  | 'text_literal'
  | 'event_handler'

export type EdgeType =
  | 'instantiates'
  | 'called_by'
  | 'imports_style'
  | 'applies_class'
  | 'owns_text'
  | 'handles_event'

export interface GraphNode {
  id: string           // stable: "src/Foo.tsx#Foo" or "src/Foo.module.css#btn"
  type: NodeType
  file: string         // workspace-relative path
  symbol?: string      // exported/local name
  line?: number
  col?: number
  exportKind?: 'default' | 'named' | 'none'
}

export interface GraphEdge {
  from: string
  to: string
  type: EdgeType
  confidence: number   // 0–1; some edges are inferred
}

export interface OwnerGraph {
  version: '1'
  buildId: string
  nodes: Record<string, GraphNode>
  edges: GraphEdge[]
  /** nodeId → outgoing edgeIndices */
  outEdges: Record<string, number[]>
  /** nodeId → incoming edgeIndices */
  inEdges: Record<string, number[]>
}

// ─── Browser-side selection payload ──────────────────────────────────────────

export interface SourceInfo {
  fileName: string
  lineNumber: number
  columnNumber: number
}

export interface ComponentStackEntry {
  name: string
  source: SourceInfo | null
}

/** Sent from browser to dev server when user clicks an element */
export interface SelectionPayload {
  selectionId: string
  timestamp: number
  componentStack: ComponentStackEntry[]
  elementInfo: {
    tagName: string
    visibleText: string
    attributes: Record<string, string>
    computedStyleSummary: ComputedStyleSummary
    boundingBox: { x: number; y: number; width: number; height: number }
    ancestorTags: string[]
    listContext: { isListItem: boolean; indexInList: number; totalItems: number } | null
  }
}

export interface ComputedStyleSummary {
  color: string
  backgroundColor: string
  fontSize: string
  fontWeight: string
  display: string
  position: string
  padding: string
  margin: string
  borderRadius: string
}

// ─── Edit surface ranking ─────────────────────────────────────────────────────

export type EditIntent =
  | 'style'
  | 'copy'
  | 'behavior'
  | 'structure'
  | 'layout'
  | 'data'
  | 'unknown'

export type BlastRadius = 'isolated' | 'component' | 'page' | 'global'

export interface EditSurface {
  type: 'component' | 'style' | 'copy' | 'behavior' | 'layout' | 'data'
  file: string
  symbol?: string
  line?: number
  confidence: number
  reason: string
  blastRadius: BlastRadius
  snippetHint?: string
}

// ─── LLM context bundle ───────────────────────────────────────────────────────

export interface FileSnippet {
  file: string
  symbol?: string
  lines: [number, number]
  content: string
}

export interface EditConstraints {
  mustNotTouchFiles: string[]
  mustNotTouchSymbols: string[]
  preferSmallestSurface: true
  requireJustificationIfEditingMultipleFiles: true
  doNotEditGlobalStylesUnlessConfidenceAbove: number
}

export interface VerificationTarget {
  elementSelector: string
  expectedChange: {
    type: 'style' | 'text' | 'attribute' | 'presence'
    property?: string
    before?: string
  }
}

export interface EditContextBundle {
  schemaVersion: '1.0'
  selectionId: string
  selection: {
    timestamp: number
    userInstruction: string
    classifiedIntent: EditIntent
    intentConfidence: number
  }
  elementInfo: SelectionPayload['elementInfo']
  sourceResolution: {
    componentName: string
    file: string
    line: number
    col: number
    componentStack: ComponentStackEntry[]
    framework: 'preact' | 'react' | 'vue' | 'svelte' | 'solid'
  }
  ownerGraph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
  }
  rankedSurfaces: EditSurface[]
  editConstraints: EditConstraints
  verificationTarget: VerificationTarget
  fileSnippets: FileSnippet[]
}

// ─── Plugin options ───────────────────────────────────────────────────────────

export interface SemEditOptions {
  overlay?: {
    /** Keyboard shortcut to toggle overlay. Defaults to 'ctrl+shift+e' */
    shortcut?: string
  }
  graph?: {
    /** Glob patterns to index. Defaults to ['src/**'] */
    include?: string[]
    /** Glob patterns to exclude. Defaults to common test/story patterns */
    exclude?: string[]
    /** Files the LLM must never touch. Merged with built-in defaults. */
    mustNotTouch?: string[]
  }
}
