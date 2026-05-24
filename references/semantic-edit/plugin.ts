/**
 * Main Vite plugin.
 *
 * Wires together:
 *  - browser overlay (virtual module injection)
 *  - AST indexer (build + incremental)
 *  - owner graph
 *  - ranking engine
 *  - LLM context packager + Anthropic call
 *  - patch application
 *  - result broadcast back to browser
 */

import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { SemEditOptions, SelectionPayload, EditContextBundle } from './types.js'
import { indexProject, indexSingleFile } from './indexer.js'
import { buildOwnerGraph } from './graph.js'
import { rankSurfaces } from './ranking.js'
import { assembleBundle, buildFullPrompt } from './packager.js'
import { getBrowserRuntime, type Framework } from './browser-runtime.js'
import type { IndexResult } from './indexer.js'
import type { OwnerGraph } from './types.js'

// ─── Virtual module IDs ───────────────────────────────────────────────────────

const OVERLAY_MODULE_ID = '/@sem-edit/overlay'
const RESOLVED_OVERLAY_ID = '\0@sem-edit/overlay'

// ─── Plugin state (per server instance) ──────────────────────────────────────

interface PluginState {
  index: IndexResult | null
  graph: OwnerGraph | null
  /** selectionId → bundle (awaiting user instruction) */
  pendingBundles: Map<string, EditContextBundle>
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function semEditPlugin(options: SemEditOptions = {}): Plugin {
  const shortcut = options.overlay?.shortcut ?? (process.platform === 'darwin' ? 'meta+shift+e' : 'ctrl+shift+e')
  const include  = options.graph?.include ?? ['src/**']
  const exclude  = options.graph?.exclude ?? ['**/*.test.*', '**/*.spec.*', '**/*.stories.*']
  const mustNotTouchFiles = [
    'node_modules/**',
    ...(options.graph?.mustNotTouch ?? []),
  ]

  const state: PluginState = {
    index: null,
    graph: null,
    pendingBundles: new Map(),
  }

  let workspaceRoot = process.cwd()
  let server: ViteDevServer | null = null
  let framework: Framework = 'unknown'

  return {
    name: 'sem-edit',

    // Only active during dev server — noop in production builds
    apply: 'serve',

    configResolved(config) {
      workspaceRoot = config.root
      const names = config.plugins.map(p => p.name)
      if (names.some(n => n.includes('preact'))) framework = 'preact'
      else if (names.some(n => n.includes('react'))) framework = 'react'
    },

    async buildStart() {
      console.log('[sem-edit] Indexing project…')
      try {
        state.index = await indexProject(workspaceRoot, include, exclude)
        state.graph = buildOwnerGraph(state.index)
        console.log(
          `[sem-edit] Graph ready — ${Object.keys(state.graph.nodes).length} nodes, ` +
          `${state.graph.edges.length} edges (buildId: ${state.graph.buildId})`
        )
      } catch (e) {
        console.error('[sem-edit] Indexing failed:', e)
      }
    },

    async handleHotUpdate({ file }) {
      if (!state.index) return
      const relFile = path.relative(workspaceRoot, file).replace(/\\/g, '/')

      // Only re-index if the changed file is in the project source
      if (!isIndexableFile(relFile, include, exclude)) return

      await indexSingleFile(file, workspaceRoot, state.index)
      state.graph = buildOwnerGraph(state.index)

      server?.ws.send('sem-edit:graph-updated', { file: relFile })
    },

    configureServer(devServer) {
      server = devServer

      // REST endpoint — useful for debugging graph state
      devServer.middlewares.use('/__sem-edit/graph', (_req, res) => {
        if (!state.graph) {
          res.writeHead(503)
          res.end(JSON.stringify({ error: 'graph not ready' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(state.graph))
      })

      // ── WebSocket: selection event from browser ──────────────────────────
      devServer.ws.on('sem-edit:selection', async (payload: SelectionPayload, client) => {
        if (!state.graph || !state.index) {
          client.send('sem-edit:context', {
            selectionId: payload.selectionId,
            error: 'graph not ready — indexing may still be in progress',
            rankedSurfaces: [],
          })
          return
        }

        try {
          const topComponent = payload.componentStack[0]
          if (!topComponent) {
            client.send('sem-edit:context', {
              selectionId: payload.selectionId,
              error: 'could not resolve component from selection',
              rankedSurfaces: [],
            })
            return
          }

          const componentFile = topComponent.source?.fileName
            ? path.relative(workspaceRoot, topComponent.source.fileName).replace(/\\/g, '/')
            : ''
          const componentLine = topComponent.source?.lineNumber ?? 0

          // Rank surfaces with a placeholder instruction (user hasn't typed yet)
          // We use 'unknown' intent to get all surface types
          const surfaces = rankSurfaces(
            topComponent.name,
            componentFile,
            componentLine,
            '',
            state.graph,
            state.index,
            mustNotTouchFiles
          )

          // Store payload so we can enrich it when the instruction arrives
          state.pendingBundles.set(payload.selectionId, {
            schemaVersion: '1.0',
            selectionId: payload.selectionId,
            selection: {
              timestamp: payload.timestamp,
              userInstruction: '',
              classifiedIntent: 'unknown',
              intentConfidence: 0,
            },
            elementInfo: payload.elementInfo,
            sourceResolution: {
              componentName: topComponent.name,
              file: componentFile,
              line: componentLine,
              col: topComponent.source?.columnNumber ?? 0,
              componentStack: payload.componentStack,
              framework: framework === 'unknown' ? 'react' : framework,
            },
            ownerGraph: { nodes: [], edges: [] },
            rankedSurfaces: surfaces,
            editConstraints: {
              mustNotTouchFiles,
              mustNotTouchSymbols: [],
              preferSmallestSurface: true,
              requireJustificationIfEditingMultipleFiles: true,
              doNotEditGlobalStylesUnlessConfidenceAbove: 0.85,
            },
            verificationTarget: {
              elementSelector: buildSelector(payload.elementInfo),
              expectedChange: { type: 'style' },
            },
            fileSnippets: [],
          } satisfies EditContextBundle)

          client.send('sem-edit:context', {
            selectionId: payload.selectionId,
            componentStack: payload.componentStack,
            rankedSurfaces: surfaces,
          })
        } catch (e) {
          console.error('[sem-edit] Error processing selection:', e)
          client.send('sem-edit:context', {
            selectionId: payload.selectionId,
            error: String(e),
            rankedSurfaces: [],
          })
        }
      })

      // ── WebSocket: build-bundle request from browser ─────────────────────
      // Assembles the full EditContextBundle + system prompt and sends it back
      // so the user can copy it into their preferred LLM interface.
      devServer.ws.on(
        'sem-edit:build-bundle',
        async (data: { selectionId: string; instruction: string }, client) => {
          if (!state.graph || !state.index) return

          const { selectionId, instruction } = data
          const pending = state.pendingBundles.get(selectionId)
          if (!pending) {
            client.send('sem-edit:bundle', {
              selectionId,
              error: 'no pending selection — please re-select the element',
            })
            return
          }

          try {
            const { componentName, file: componentFile, line: componentLine } = pending.sourceResolution
            const surfaces = rankSurfaces(
              componentName,
              componentFile,
              componentLine,
              instruction,
              state.graph,
              state.index,
              mustNotTouchFiles
            )

            const bundle = assembleBundle(
              {
                selectionId,
                timestamp: pending.selection.timestamp,
                componentStack: pending.sourceResolution.componentStack,
                elementInfo: pending.elementInfo,
              },
              instruction,
              surfaces,
              state.graph,
              workspaceRoot,
              mustNotTouchFiles,
              framework
            )

            const fullPrompt = buildFullPrompt(bundle)

            client.send('sem-edit:bundle', { selectionId, bundle, fullPrompt })
            state.pendingBundles.delete(selectionId)
          } catch (e) {
            console.error('[sem-edit] bundle assembly error:', e)
            client.send('sem-edit:bundle', { selectionId, error: String(e) })
          }
        }
      )
    },

    // ── Virtual module: browser overlay ────────────────────────────────────

    resolveId(id) {
      if (id === OVERLAY_MODULE_ID) return RESOLVED_OVERLAY_ID
    },

    load(id) {
      if (id === RESOLVED_OVERLAY_ID) {
        return getBrowserRuntime(shortcut, framework)
      }
    },

    // ── HTML injection ──────────────────────────────────────────────────────
    // Inject into <head> so the overlay hooks run before the app's first render.

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import '${OVERLAY_MODULE_ID}'`,
          injectTo: 'head',
        },
      ]
    },
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isIndexableFile(relFile: string, include: string[], exclude: string[]): boolean {
  const included = include.some(p => {
    const base = p.replace(/\/\*\*.*$/, '')
    return relFile.startsWith(base)
  })
  if (!included) return false
  const excluded = exclude.some(p => {
    const suffix = p.replace(/^\*\*/, '')
    return relFile.endsWith(suffix) || relFile.includes(suffix)
  })
  return !excluded
}

function buildSelector(elementInfo: EditContextBundle['elementInfo']): string {
  const parts = [elementInfo.tagName.toLowerCase()]
  const cls = elementInfo.attributes['class']?.split(/\s+/).filter(Boolean)[0]
  if (cls) parts.push(`.${cls}`)
  const id = elementInfo.attributes['id']
  if (id) parts.push(`#${id}`)
  return parts.join('')
}
