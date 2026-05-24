# Insights from `references/semantic-edit`

`semantic-edit` is useful implementation research for runtime selection, Preact source context, and Vite dev-server plumbing. It should inform, but not define, this project's architecture. Our plans remain centered on explicit PandaCSS instrumentation, stable edit IDs, and safe AST writeback.

## Useful lessons

### Preact vnode stack as fallback context

`semantic-edit` uses Preact's `options.diffed` hook to associate rendered DOM elements with a component stack via a `WeakMap<Element, stack>`. This can help when a selected DOM node does not directly carry authoritative edit metadata, or when the inspector needs to explain component ownership.

For this project, that technique should be treated as best-effort runtime context only:

- `data-panda-edit-id` remains the authoritative writeback link.
- Preact vnode stack data can improve display, debugging, fallback resolution, and ambiguity explanations.
- Preact internals should not become the persistence source of truth.

### Dev-only Vite plugin shape

`semantic-edit` reinforces the planned Vite plugin model:

- run only during dev server usage
- inject a browser runtime through a virtual module
- use `transformIndexHtml()` for early runtime injection
- keep server-side index or manifest state in memory
- update that state on `handleHotUpdate()`
- communicate with the browser over Vite WebSocket events

This supports the planned manifest lifecycle and suggests making runtime/server event names explicit for manifest updates, selection failures, stale entries, and writeback results.

### Runtime evidence payload

The reference collects browser-side evidence that is useful for inspection but not sufficient for persistence:

- computed style summary
- bounding box
- visible text
- redacted DOM attributes
- ancestor tags
- repeated-list/sibling context

These are good inputs for inspector UI and debugging. In particular, list context can warn that editing the selected source may affect every item rendered by the same component.

### Confidence and ambiguity are product concepts

`semantic-edit` ranks possible edit surfaces with confidence and blast-radius information. Our MVP should not copy its broad owner graph, but the UX idea is valuable: when source resolution is not obvious, the inspector should expose confidence and rationale instead of pretending certainty.

A narrow version for this project could include:

- target confidence such as `high`, `medium`, or `low`
- a short reason explaining why the target was selected
- blast radius such as `element`, `component`, `repeated-list`, or `unknown`
- explicit stale or ambiguous states that block writeback until resolved

### Incremental invalidation

The reference re-indexes changed files on HMR and notifies the browser. This aligns with the planned manifest lifecycle. The inspector should assume selected entries can become stale after source edits and should require revalidation before writing.

The planned save-target resolution order remains important:

1. exact file, range, and hash
2. nearby location with matching callee
3. matching object shape in the same file
4. ask the user if multiple matches exist
5. report stale manifest if no confident match exists

## What not to copy

`semantic-edit` is a general semantic-editing/LLM-context tool. This project is a deterministic style inspector and PandaCSS source editor. Avoid importing these parts into the MVP architecture:

- broad owner graph as the primary model
- generic edit intent classification
- LLM context packaging as the core workflow
- generic patch application based on ranked surfaces
- CSS module or class-name heuristics as persistence targets

Those ideas are interesting, but they would weaken the central guarantee: Panda source metadata and AST ranges are the writeback authority.

## Plan implications

The strongest plan updates suggested by this reference are:

1. Add optional Preact vnode stack recovery as a runtime fallback/debug aid.
2. Include runtime evidence fields for computed styles, redacted attributes, bounds, ancestors, and list context.
3. Make selection confidence, rationale, blast radius, stale state, and ambiguity visible in the inspector UI.
4. Define concrete Vite WebSocket events for manifest updates and writeback outcomes.
5. Revalidate selected manifest entries after HMR before allowing source writes.
