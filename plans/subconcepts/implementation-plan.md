# Implementation Plan

## Implementation Plan

### Phase 1: Proof of concept

- Build a Vite plugin that detects `css({ ... })` in TSX.
- Inject `data-panda-edit-id` into JSX elements.
- Emit an in-memory manifest served at `/@panda-inspector/manifest`.
- Build runtime element selection with pointer listeners and `document.elementFromPoint`.
- Show the manifest entry for the selected node.

Success: clicking an element in the app shows the source file and Panda object.

### Phase 2: Preview

- Read computed styles with `getComputedStyle`.
- Build a basic Panda prop-to-CSS preview resolver for common props.
- Inject a runtime-owned preview stylesheet.
- Add clear preview and revert.

Success: changing `px` or `bg` in the inspector produces an instant visual update.

### Phase 3: Persistence

- Build an AST patcher for static object literals.
- Generate a diff.
- Write source on confirmation.
- Let Vite/Panda refresh.
- Clear preview after successful save.

Success: changing `px: '4'` to `px: '5'` in the inspector updates the TSX file correctly.

### Phase 4: Robustness

- Add range validation and stale manifest recovery.
- Add nested responsive object editing.
- Add token picker from Panda config.
- Add support for `cx(css(...), ...)`.
- Add production stripping tests.

Success: the tool works reliably in realistic components.

### Phase 5: Recipes and Advanced Source Forms

- Detect recipe imports and calls.
- Display variant controls.
- Patch recipe variant object literals.
- Support selected multi-source class names.

Success: editing `button({ size: 'md' })` to `button({ size: 'lg' })` works end to end.
