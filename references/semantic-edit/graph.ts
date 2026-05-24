/**
 * Owner graph builder and query layer.
 *
 * Converts raw IndexResult data into a traversable OwnerGraph where nodes are
 * stable by their "file#symbol" id and edges carry confidence scores.
 */

import path from 'node:path'
import type { OwnerGraph, GraphNode, GraphEdge, NodeType } from './types.js'
import type { IndexResult, ComponentDef } from './indexer.js'

// ─── Build ────────────────────────────────────────────────────────────────────

export function buildOwnerGraph(index: IndexResult): OwnerGraph {
  const nodes: Record<string, GraphNode> = {}
  const edges: GraphEdge[] = []

  function addNode(node: GraphNode): void {
    nodes[node.id] = node
  }

  function addEdge(edge: GraphEdge): void {
    edges.push(edge)
  }

  // ── Component definition nodes ────────────────────────────────────────────
  for (const defs of index.componentDefs.values()) {
    for (const def of defs) {
      addNode({
        id: def.id,
        type: 'component_def',
        file: def.file,
        symbol: def.name,
        line: def.line,
        col: def.col,
        exportKind: def.exportKind,
      })
    }
  }

  // ── Component instantiation edges (called_by / instantiates) ─────────────
  for (const [file, insts] of index.instantiations) {
    // Find which component definition owns this file (the "parent")
    const parentDefs = index.componentDefs.get(file) ?? []

    for (const inst of insts) {
      if (!inst.componentName) continue  // DOM-element classNames recorded inline

      // Find the child component def node
      const childDefId = resolveComponentDefId(inst.componentName, index)
      if (!childDefId) continue

      // The parent is the component at the top of the file (simplification)
      const parentDef = parentDefs[0]
      if (parentDef) {
        const instNodeId = `${file}#${inst.componentName}@${inst.line}:${inst.col}`
        addNode({
          id: instNodeId,
          type: 'component_instance',
          file,
          symbol: inst.componentName,
          line: inst.line,
          col: inst.col,
        })
        addEdge({ from: parentDef.id, to: instNodeId, type: 'instantiates', confidence: 1.0 })
        addEdge({ from: instNodeId, to: childDefId, type: 'called_by', confidence: 1.0 })
      }
    }
  }

  // ── Style import edges ────────────────────────────────────────────────────
  for (const si of index.styleImports) {
    // Get or create a style_file node
    const styleFileId = `${si.toFile}#file`
    if (!nodes[styleFileId]) {
      addNode({ id: styleFileId, type: 'style_file', file: si.toFile })
    }

    // Link all component defs in the importing file to the style file
    const defs = index.componentDefs.get(si.fromFile) ?? []
    for (const def of defs) {
      addEdge({ from: def.id, to: styleFileId, type: 'imports_style', confidence: 1.0 })
    }
  }

  // ── Class name edges (component_def → style_class) ────────────────────────
  for (const [file, insts] of index.instantiations) {
    const defs = index.componentDefs.get(file) ?? []
    const ownerDef = defs[0]

    for (const inst of insts) {
      for (const cls of inst.classNames) {
        // Try to find the style file that defines this class
        const styleFile = findStyleFileForClass(cls, file, index)
        if (styleFile) {
          const classNodeId = `${styleFile}#${cls}`
          if (!nodes[classNodeId]) {
            addNode({ id: classNodeId, type: 'style_class', file: styleFile, symbol: cls })
          }
          if (ownerDef) {
            addEdge({ from: ownerDef.id, to: classNodeId, type: 'applies_class', confidence: 0.9 })
          }
        }
      }
    }
  }

  // ── Text literal nodes ────────────────────────────────────────────────────
  for (const tl of index.textLiterals) {
    if (tl.value.length < 2) continue  // skip whitespace-only
    addNode({ id: tl.id, type: 'text_literal', file: tl.file, line: tl.line, col: tl.col })
    if (tl.ownerComponent) {
      const defId = resolveComponentDefId(tl.ownerComponent, index, tl.file)
      if (defId) {
        addEdge({ from: defId, to: tl.id, type: 'owns_text', confidence: 1.0 })
      }
    }
  }

  // ── Event handler edges ───────────────────────────────────────────────────
  for (const eh of index.eventHandlers) {
    if (!eh.handlerName || !eh.ownerComponent) continue
    const defId = resolveComponentDefId(eh.ownerComponent, index, eh.file)
    if (!defId) continue
    const handlerId = `${eh.file}#${eh.handlerName}`
    if (!nodes[handlerId]) {
      addNode({ id: handlerId, type: 'event_handler', file: eh.file, symbol: eh.handlerName, line: eh.line })
    }
    addEdge({ from: defId, to: handlerId, type: 'handles_event', confidence: 0.95 })
  }

  // ── Build adjacency index ─────────────────────────────────────────────────
  const outEdges: Record<string, number[]> = {}
  const inEdges: Record<string, number[]> = {}

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    ;(outEdges[e.from] ??= []).push(i)
    ;(inEdges[e.to] ??= []).push(i)
  }

  return { version: '1', buildId: index.buildId, nodes, edges, outEdges, inEdges }
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface NeighborhoodResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Returns all nodes and edges within `hops` steps of the given node.
 * Used to build the pruned owner graph sent to the LLM.
 */
export function getNeighborhood(
  graph: OwnerGraph,
  startNodeId: string,
  hops: number = 2
): NeighborhoodResult {
  const visitedNodes = new Set<string>()
  const visitedEdges = new Set<number>()

  function walk(nodeId: string, remaining: number): void {
    if (visitedNodes.has(nodeId) || remaining < 0) return
    visitedNodes.add(nodeId)

    const outIdxs = graph.outEdges[nodeId] ?? []
    const inIdxs = graph.inEdges[nodeId] ?? []

    for (const idx of [...outIdxs, ...inIdxs]) {
      visitedEdges.add(idx)
      const edge = graph.edges[idx]
      const other = edge.from === nodeId ? edge.to : edge.from
      walk(other, remaining - 1)
    }
  }

  walk(startNodeId, hops)

  return {
    nodes: [...visitedNodes].map(id => graph.nodes[id]).filter(Boolean),
    edges: [...visitedEdges].map(i => graph.edges[i]),
  }
}

/**
 * Find the best matching component_def node for a given component name,
 * optionally biased toward a specific file.
 */
export function findComponentNode(
  graph: OwnerGraph,
  componentName: string,
  preferFile?: string
): GraphNode | undefined {
  const candidates = Object.values(graph.nodes).filter(
    n => n.type === 'component_def' && n.symbol === componentName
  )
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]

  // Prefer the one closest to the preferred file
  if (preferFile) {
    const sameFile = candidates.find(c => c.file === preferFile)
    if (sameFile) return sameFile

    const dir = path.dirname(preferFile)
    const sameDir = candidates.find(c => path.dirname(c.file) === dir)
    if (sameDir) return sameDir
  }

  return candidates[0]
}

/**
 * Find all style nodes (style_file + style_class) reachable from a component.
 */
export function getStyleSurfaces(graph: OwnerGraph, componentNodeId: string): GraphNode[] {
  const styleTypes: NodeType[] = ['style_file', 'style_class']
  const outIdxs = graph.outEdges[componentNodeId] ?? []
  const result: GraphNode[] = []

  for (const idx of outIdxs) {
    const edge = graph.edges[idx]
    if (edge.type === 'imports_style' || edge.type === 'applies_class') {
      const node = graph.nodes[edge.to]
      if (node && styleTypes.includes(node.type)) result.push(node)
    }
  }
  return result
}

/**
 * Walk the import graph upward to find ancestor files.
 * Used for layout/route ownership.
 */
export function getAncestorFiles(
  importGraph: Map<string, Set<string>>,
  startFile: string,
  maxHops: number = 4
): string[] {
  // Reverse the import graph: file → files that import it
  const reverseMap = new Map<string, Set<string>>()
  for (const [from, tos] of importGraph) {
    for (const to of tos) {
      let s = reverseMap.get(to)
      if (!s) { s = new Set(); reverseMap.set(to, s) }
      s.add(from)
    }
  }

  const visited = new Set<string>()
  const queue: Array<{ file: string; hop: number }> = [{ file: startFile, hop: 0 }]
  const ancestors: string[] = []

  while (queue.length) {
    const { file, hop } = queue.shift()!
    if (visited.has(file) || hop > maxHops) continue
    visited.add(file)
    if (hop > 0) ancestors.push(file)
    for (const parent of reverseMap.get(file) ?? []) {
      queue.push({ file: parent, hop: hop + 1 })
    }
  }

  return ancestors
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveComponentDefId(
  name: string,
  index: IndexResult,
  preferFile?: string
): string | undefined {
  // Try the preferred file first
  if (preferFile) {
    const defs = index.componentDefs.get(preferFile) ?? []
    const found = defs.find(d => d.name === name)
    if (found) return found.id
  }

  // Search all files
  for (const defs of index.componentDefs.values()) {
    const found = defs.find((d: ComponentDef) => d.name === name)
    if (found) return found.id
  }
  return undefined
}

function findStyleFileForClass(
  _className: string,
  fromFile: string,
  index: IndexResult
): string | null {
  // Look for a style file imported by fromFile whose name suggests it owns this class
  const dir = path.dirname(fromFile)

  for (const si of index.styleImports) {
    if (si.fromFile !== fromFile) continue
    // For CSS modules, the class name must exist in the file — we do a simple
    // name-based heuristic here (a real implementation would read the CSS file)
    const componentBasename = path.basename(fromFile, path.extname(fromFile))
    if (
      si.toFile.includes(componentBasename) ||
      path.dirname(si.toFile) === dir
    ) {
      return si.toFile
    }
  }
  return null
}
