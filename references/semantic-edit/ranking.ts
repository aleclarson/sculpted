/**
 * Edit-surface ranking engine.
 *
 * 1. Classifies the user's instruction into an EditIntent using keyword heuristics.
 * 2. Traverses the owner graph neighbourhood of the selected component.
 * 3. Scores and sorts candidate EditSurfaces.
 *
 * Intentionally kept as a fast, local (non-LLM) step so there is zero latency
 * between the user pressing Enter and the bundle being assembled.
 */

import type { EditIntent, EditSurface, BlastRadius, OwnerGraph } from './types.js'
import { getStyleSurfaces, getAncestorFiles } from './graph.js'
import type { IndexResult } from './indexer.js'

// ─── Intent classification ────────────────────────────────────────────────────

interface IntentResult {
  intent: EditIntent
  confidence: number
}

const STYLE_RE = /\b(color|colou?r|background|bg|padding|margin|border|radius|rounded|font|size|shadow|opacity|flex|grid|gap|width|height|bold|italic|align|center|spacing|theme|dark|light|weight|underline|strike|decoration|outline|ring|focus|hover|transition|animation|rotate|scale|translate|blur|brightness)\b/i
const COPY_RE = /\b(text|label|title|copy|typo|wording|say|phrase|placeholder|heading|caption|description|message|button text|cta|content|string|writ)\b/i
const BEHAVIOR_RE = /\b(click|submit|disable|enable|show|hide|toggle|open|close|navigate|redirect|route|validate|trigger|fire|emit|dispatch|prevent|stop|focus|blur|scroll|drag|drop|swipe)\b/i
const STRUCTURE_RE = /\b(add|remove|insert|delete|wrap|unwrap|move|nest|render|show|hide|visible|icon|badge|tooltip|popup|modal|drawer|tab|accordion|list|item|card|row|column|section|component)\b/i
const LAYOUT_RE = /\b(position|place|left|right|top|bottom|center|align|justify|full.?width|full.?height|stack|row|column|horizontal|vertical|responsive|breakpoint|mobile|desktop)\b/i
const DATA_RE = /\b(data|api|fetch|load|server|database|query|mutation|endpoint|props|dynamic|static|real|mock|fake|store|state|context|loader|action|cache)\b/i

export function classifyIntent(instruction: string): IntentResult {
  const scores: Record<EditIntent, number> = {
    style: 0, copy: 0, behavior: 0, structure: 0, layout: 0, data: 0, unknown: 0,
  }

  if (STYLE_RE.test(instruction)) scores.style += 2
  if (COPY_RE.test(instruction)) scores.copy += 2
  if (BEHAVIOR_RE.test(instruction)) scores.behavior += 2
  if (STRUCTURE_RE.test(instruction)) scores.structure += 1
  if (LAYOUT_RE.test(instruction)) scores.layout += 2
  if (DATA_RE.test(instruction)) scores.data += 2

  // "make it X" — style heuristic
  if (/make it\s+(blue|red|green|bigger|smaller|bolder|lighter|darker|visible|hidden)/i.test(instruction)) {
    scores.style += 3
  }
  // "change the X" where X is a noun → copy
  if (/change the\s+\w+\s+(text|label|copy|title|wording)/i.test(instruction)) {
    scores.copy += 3
  }

  const entries = Object.entries(scores) as [EditIntent, number][]
  const best = entries.reduce((a, b) => b[1] > a[1] ? b : a)

  if (best[1] === 0) return { intent: 'unknown', confidence: 0.2 }

  const total = entries.reduce((s, [, v]) => s + v, 0)
  return { intent: best[0], confidence: Math.min(0.95, best[1] / total + 0.2) }
}

// ─── Blast radius estimation ──────────────────────────────────────────────────

function estimateComponentBlastRadius(
  nodeId: string,
  graph: OwnerGraph
): BlastRadius {
  // Count how many distinct parents instantiate this component
  const inIdxs = graph.inEdges[nodeId] ?? []
  const parentFiles = new Set<string>()
  for (const idx of inIdxs) {
    const edge = graph.edges[idx]
    if (edge.type === 'called_by') {
      const instNode = graph.nodes[edge.from]
      if (instNode) parentFiles.add(instNode.file)
    }
  }
  if (parentFiles.size === 0) return 'isolated'
  if (parentFiles.size === 1) return 'component'
  if (parentFiles.size <= 3) return 'page'
  return 'global'
}

function estimateStyleBlastRadius(styleNodeId: string, graph: OwnerGraph): BlastRadius {
  const inIdxs = graph.inEdges[styleNodeId] ?? []
  const users = new Set<string>()
  for (const idx of inIdxs) {
    users.add(graph.edges[idx].from)
  }
  if (users.size <= 1) return 'isolated'
  if (users.size <= 4) return 'component'
  return 'global'
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

export function rankSurfaces(
  componentName: string,
  componentFile: string,
  componentLine: number,
  instruction: string,
  graph: OwnerGraph,
  index: IndexResult,
  mustNotTouchFiles: string[]
): EditSurface[] {
  const { intent } = classifyIntent(instruction)

  // Find the component's node in the graph
  const componentNodeId = `${componentFile}#${componentName}`
  const componentNode = graph.nodes[componentNodeId]

  const surfaces: EditSurface[] = []

  const blocked = (file: string) =>
    mustNotTouchFiles.some(pattern => matchesGlob(file, pattern))

  // ── 1. Direct component file ───────────────────────────────────────────────
  if (!blocked(componentFile)) {
    const blastRadius = componentNode
      ? estimateComponentBlastRadius(componentNodeId, graph)
      : 'component'

    const intentBoost =
      intent === 'structure' ? 0.2 :
      intent === 'copy'      ? 0.1 :
      intent === 'behavior'  ? 0.15 :
      0

    surfaces.push({
      type: 'component',
      file: componentFile,
      symbol: componentName,
      line: componentLine,
      confidence: clamp(0.75 + intentBoost),
      reason: 'direct source of the selected element',
      blastRadius,
    })
  }

  // ── 2. Style surfaces ──────────────────────────────────────────────────────
  if (componentNode && (intent === 'style' || intent === 'layout' || intent === 'unknown')) {
    const styleNodes = getStyleSurfaces(graph, componentNodeId)
    for (const sn of styleNodes) {
      if (blocked(sn.file)) continue
      const br = estimateStyleBlastRadius(sn.id, graph)
      const baseConf = intent === 'style' ? 0.9 : intent === 'layout' ? 0.7 : 0.45
      const penalized = br === 'global' ? baseConf * 0.6 : baseConf
      surfaces.push({
        type: 'style',
        file: sn.file,
        symbol: sn.symbol,
        line: sn.line,
        confidence: clamp(penalized),
        reason: sn.type === 'style_class'
          ? `component applies .${sn.symbol} from this file`
          : `component imports this stylesheet`,
        blastRadius: br,
      })
    }
  }

  // ── 3. Copy surface — elevate for copy intent ──────────────────────────────
  if (intent === 'copy' || intent === 'unknown') {
    if (componentNode) {
      const outIdxs = graph.outEdges[componentNodeId] ?? []
      for (const idx of outIdxs) {
        const edge = graph.edges[idx]
        if (edge.type !== 'owns_text') continue
        const textNode = graph.nodes[edge.to]
        if (!textNode || blocked(textNode.file)) continue
        surfaces.push({
          type: 'copy',
          file: textNode.file,
          line: textNode.line,
          confidence: intent === 'copy' ? clamp(0.88 * edge.confidence) : 0.35,
          reason: 'text literal owned by this component',
          blastRadius: 'isolated',
        })
      }
    }
  }

  // ── 4. Layout / parent component ──────────────────────────────────────────
  if (intent === 'layout' || intent === 'structure') {
    if (componentNode) {
      const inIdxs = graph.inEdges[componentNodeId] ?? []
      const parentFiles = new Set<string>()
      for (const idx of inIdxs) {
        const edge = graph.edges[idx]
        if (edge.type !== 'called_by') continue
        const instNode = graph.nodes[edge.from]
        if (instNode && !blocked(instNode.file)) parentFiles.add(instNode.file)
      }
      for (const pf of parentFiles) {
        surfaces.push({
          type: 'layout',
          file: pf,
          confidence: intent === 'layout' ? 0.70 : 0.45,
          reason: 'parent component controls placement of the selected element',
          blastRadius: 'component',
        })
      }
    }
  }

  // ── 5. Route/page ancestor ────────────────────────────────────────────────
  if (intent === 'layout' || intent === 'structure' || intent === 'data') {
    const ancestors = getAncestorFiles(index.importGraph, componentFile, 3)
    for (const ancestor of ancestors) {
      if (blocked(ancestor)) continue
      if (isRouteFile(ancestor)) {
        surfaces.push({
          type: 'layout',
          file: ancestor,
          confidence: 0.4,
          reason: 'route/page file that renders this component',
          blastRadius: 'page',
        })
        break  // only add the nearest route
      }
    }
  }

  // ── Deduplicate by file+symbol, keep highest confidence ───────────────────
  const deduped = deduplicateSurfaces(surfaces)

  // ── Sort: confidence desc, global blast-radius penalized ──────────────────
  deduped.sort((a, b) => b.confidence - a.confidence)

  return deduped.slice(0, 6)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v))
}

function deduplicateSurfaces(surfaces: EditSurface[]): EditSurface[] {
  const seen = new Map<string, EditSurface>()
  for (const s of surfaces) {
    const key = `${s.file}#${s.symbol ?? ''}`
    const existing = seen.get(key)
    if (!existing || s.confidence > existing.confidence) {
      seen.set(key, s)
    }
  }
  return [...seen.values()]
}

function isRouteFile(file: string): boolean {
  return (
    /\/(pages|routes|app)\//.test(file) ||
    /\/(page|route|layout)\.(tsx?|jsx?)$/.test(file)
  )
}

function matchesGlob(file: string, pattern: string): boolean {
  // Simple prefix/suffix matching — not a full glob engine.
  // Handles common cases: "node_modules/**", "src/design-system/**", "*.test.*"
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return file.startsWith(prefix)
  }
  if (pattern.startsWith('**')) {
    const suffix = pattern.slice(2)
    return file.endsWith(suffix)
  }
  return file.includes(pattern.replace(/\*/g, ''))
}
