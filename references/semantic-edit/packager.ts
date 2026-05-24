import fs from 'node:fs'
import path from 'node:path'
import type {
  SelectionPayload,
  EditContextBundle,
  EditSurface,
  FileSnippet,
  OwnerGraph,
} from './types.js'
import type { Framework } from './browser-runtime.js'
import { getNeighborhood, findComponentNode } from './graph.js'
import { classifyIntent } from './ranking.js'

// ─── Snippet loader ───────────────────────────────────────────────────────────

const SNIPPET_CONTEXT_LINES = 5
const SNIPPET_MAX_LINES = 50

function loadSnippet(
  workspaceRoot: string,
  surface: EditSurface
): FileSnippet | null {
  const absPath = path.join(workspaceRoot, surface.file)
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf-8')
  } catch {
    return null
  }

  const lines = content.split('\n')
  const totalLines = lines.length

  let lineStart = Math.max(1, (surface.line ?? 1) - SNIPPET_CONTEXT_LINES)
  let lineEnd = Math.min(totalLines, lineStart + SNIPPET_MAX_LINES - 1)

  // If there's no line hint, return beginning of file
  if (!surface.line) {
    lineStart = 1
    lineEnd = Math.min(totalLines, SNIPPET_MAX_LINES)
  }

  const snippetLines = lines.slice(lineStart - 1, lineEnd)
  return {
    file: surface.file,
    symbol: surface.symbol,
    lines: [lineStart, lineEnd],
    content: snippetLines.join('\n'),
  }
}

// ─── Bundle assembly ──────────────────────────────────────────────────────────

export function assembleBundle(
  payload: SelectionPayload,
  instruction: string,
  surfaces: EditSurface[],
  graph: OwnerGraph,
  workspaceRoot: string,
  mustNotTouchFiles: string[],
  framework: Framework = 'unknown'
): EditContextBundle {
  const { intent, confidence: intentConf } = classifyIntent(instruction)

  // Source resolution from the component stack top
  const topComponent = payload.componentStack[0]
  const source = topComponent?.source

  // Find the component's neighbourhood in the graph
  const componentNodeId = source
    ? `${path.relative(workspaceRoot, source.fileName).replace(/\\/g, '/')}#${topComponent.name}`
    : ''
  const componentNode = graph.nodes[componentNodeId] ??
    findComponentNode(graph, topComponent?.name ?? '', source?.fileName)

  const neighbourhood = componentNode
    ? getNeighborhood(graph, componentNode.id, 2)
    : { nodes: [], edges: [] }

  // Load file snippets for top 3 surfaces
  const snippets: FileSnippet[] = []
  for (const surface of surfaces.slice(0, 3)) {
    const snippet = loadSnippet(workspaceRoot, surface)
    if (snippet) snippets.push(snippet)
  }

  // Build a CSS-selector approximation for verification
  const el = payload.elementInfo
  const selectorParts: string[] = [el.tagName.toLowerCase()]
  const cls = el.attributes['class']?.split(/\s+/).filter(Boolean)[0]
  if (cls) selectorParts.push(`.${cls}`)
  const elementSelector = selectorParts.join('')

  // Determine what to verify
  const verifyProp =
    intent === 'style'    ? 'style' :
    intent === 'copy'     ? 'text'  :
    intent === 'behavior' ? 'attribute' :
    'style'

  const relComponentFile = source
    ? path.relative(workspaceRoot, source.fileName).replace(/\\/g, '/')
    : surfaces[0]?.file ?? ''

  return {
    schemaVersion: '1.0',
    selectionId: payload.selectionId,
    selection: {
      timestamp: payload.timestamp,
      userInstruction: instruction,
      classifiedIntent: intent,
      intentConfidence: intentConf,
    },
    elementInfo: payload.elementInfo,
    sourceResolution: {
      componentName: topComponent?.name ?? 'Unknown',
      file: relComponentFile,
      line: source?.lineNumber ?? 0,
      col: source?.columnNumber ?? 0,
      componentStack: payload.componentStack,
      framework: framework === 'unknown' ? 'react' : framework,
    },
    ownerGraph: neighbourhood,
    rankedSurfaces: surfaces,
    editConstraints: {
      mustNotTouchFiles: [
        'node_modules/**',
        ...mustNotTouchFiles,
      ],
      mustNotTouchSymbols: [],
      preferSmallestSurface: true,
      requireJustificationIfEditingMultipleFiles: true,
      doNotEditGlobalStylesUnlessConfidenceAbove: 0.85,
    },
    verificationTarget: {
      elementSelector,
      expectedChange: {
        type: verifyProp as 'style' | 'text' | 'attribute' | 'presence',
        before: intent === 'style'
          ? summarizeStyleForVerification(el.computedStyleSummary, instruction)
          : el.visibleText.slice(0, 80),
      },
    },
    fileSnippets: snippets,
  }
}

function summarizeStyleForVerification(
  summary: EditContextBundle['elementInfo']['computedStyleSummary'],
  instruction: string
): string {
  // Guess which style property the instruction is about
  const lower = instruction.toLowerCase()
  if (/font.?weight|bold/.test(lower)) return `font-weight: ${summary.fontWeight}`
  if (/color/.test(lower)) return `color: ${summary.color}`
  if (/background/.test(lower)) return `background-color: ${summary.backgroundColor}`
  if (/font.?size|text.?size/.test(lower)) return `font-size: ${summary.fontSize}`
  if (/padding/.test(lower)) return `padding: ${summary.padding}`
  if (/margin/.test(lower)) return `margin: ${summary.margin}`
  if (/border.?radius|rounded/.test(lower)) return `border-radius: ${summary.borderRadius}`
  return JSON.stringify(summary)
}

// ─── Full prompt builder ─────────────────────────────────────────────────────

/** Builds the complete text the user can paste into any LLM interface. */
export function buildFullPrompt(bundle: EditContextBundle): string {
  return `${SYSTEM_PROMPT}\n\nHere is the EditContextBundle:\n\n${JSON.stringify(bundle, null, 2)}`
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a precise, minimal code editor embedded in a developer tool called sem-edit.

You receive a JSON payload (EditContextBundle) describing:
- A UI element the developer selected in their running app
- The source code location that owns it
- A ranked list of candidate edit surfaces (files + symbols)
- The developer's natural-language edit instruction

Your job is to produce the smallest correct code change that achieves the instruction.

RULES:
1. Only edit files listed in rankedSurfaces. If you need to edit a file NOT listed,
   you MUST explain why before editing it.
2. NEVER edit files matching patterns in editConstraints.mustNotTouchFiles.
3. Make the SMALLEST change that achieves the instruction. No refactors, no style
   cleanups beyond what was asked.
4. Output valid JSON only — no markdown fences, no prose outside the JSON object.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "patches": [
    {
      "file": "src/components/Foo.tsx",
      "hunks": [
        {
          "lineStart": 12,
          "lineEnd": 14,
          "newContent": "  <button className={styles.btn}>\\n    Get Started\\n  </button>"
        }
      ]
    }
  ],
  "explanation": "Added font-weight: 700 to .btn-label in PricingButton.module.css",
  "verificationExpectation": "font-weight of the button element should now be 700"
}

Line numbers are 1-indexed. newContent replaces lines lineStart through lineEnd inclusive.
Preserve indentation exactly as in the fileSnippets.`
