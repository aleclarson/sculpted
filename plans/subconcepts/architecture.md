# Architecture

## Proposed Module Layout

Modularize around trust boundaries and replaceability, not UI screens.

```txt
preact-panda-inspector/
  vite/
  runtime/
  patcher/
  panda/
  preview/
  ui/
  shared/
```

### Module responsibilities

- `shared/`: pure types, manifest contracts, edit request/response types, error codes, ID helpers, and protocol version constants. No Vite, filesystem, DOM, or Panda runtime dependencies.
- `vite/`: TS/TSX transforms, Panda import discovery, editable call-site discovery, JSX metadata injection, manifest creation, virtual manifest endpoint, runtime injection, and HMR manifest events.
- `runtime/`: tiny browser-side dev agent exposing `window.__PANDA_INSPECTOR__`, manifest fetch/cache, element metadata, element selection, highlights, computed style reads, preview style management, and version compatibility. It must not write files.
- `panda/`: Panda semantic model, including config loading, token indexes, semantic tokens, breakpoints, conditions, utilities, shorthands, and recipe metadata.
- `preview/`: temporary CSS generation from pending Panda edits, including approximate prop-to-CSS resolution, later accurate Panda-generated resolution, responsive and pseudo-condition output, and scoping to `[data-panda-edit-id="..."]`. It never writes source.
- `patcher/`: filesystem and AST persistence boundary, including manifest lookup, path validation, source parsing, target re-location, stale manifest detection, object literal editing, recipe variant editing, diff generation, formatting, and safe writes. This should be the only module that writes source files.
- `ui/`: selected element panel, Panda source editor, token picker, responsive condition editor, generated/computed CSS panels, diff preview, and save/revert workflow.

### Central domain model

Use a source target model so the system does not assume one DOM node has exactly one editable style object.

```ts
type SourceTarget =
  | PandaCssSourceTarget
  | PandaRecipeSourceTarget
  | DynamicSourceTarget
  | ExternalSourceTarget;
```

Runtime selection identifies a DOM node, DOM metadata points to one or more source targets, the UI edits a source target, preview renders temporary CSS for it, and the patcher persists edits to it.

### Dependency direction

```txt
shared
  ↑
  ├── vite
  ├── runtime
  ├── panda
  ├── preview
  ├── patcher
  └── ui
```

More specifically:

```txt
vite     -> shared
runtime  -> shared
panda    -> shared
preview  -> shared, panda
patcher  -> shared, panda?
ui       -> shared, panda, preview client, patcher client, runtime client
```

Avoid dependencies from `patcher` to `ui`, `runtime` to `patcher`, or `vite` to `ui`.

## Architecture

```txt
Vite instrumentation
  Creates source-to-DOM mapping.

Runtime agent
  Handles selection, highlights, metadata, computed style reads, and live preview in the page.

Inspector UI
  Presents editable Panda source, style evidence, preview controls, and diffs.

AST patcher
  Persists approved changes to Preact/Panda source code.
```

The recommended package layout is:

```txt
packages/
  preact-panda-inspector/
    src/
      vite/
        plugin.ts
        transformTsx.ts
        manifest.ts
        injectRuntime.ts
      runtime/
        agent.ts
        preactHooks.ts
        domMetadata.ts
        selection.ts
        overlay.ts
        stylePreview.ts
      patcher/
        parse.ts
        locate.ts
        editCssObject.ts
        editRecipeCall.ts
        format.ts
        write.ts
      panda/
        configLoader.ts
        tokenIndex.ts
        propMetadata.ts
        recipeIndex.ts
      ui/
        InspectorApp.tsx
        StylePanel.tsx
        TokenPicker.tsx
        DiffPanel.tsx
      shared/
        types.ts
        protocol.ts
        ids.ts
```

Potential public entry points:

```ts
@pkg/preact-panda-inspector/vite
@pkg/preact-panda-inspector/runtime
@pkg/preact-panda-inspector/patcher
@pkg/preact-panda-inspector/ui
```
