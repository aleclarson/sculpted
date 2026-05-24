# Webstudio Style Panel Reference Insights

`references/webstudio-style-panel/` is useful as product and implementation research for CSS-level editing UX. It should not dictate this project's architecture. The reference is built around Webstudio's own instance model, style sources, sync store, CSS engine, and React/nanostores stack, while this project remains centered on Vite instrumentation, a runtime agent, an inspector UI, and an AST source patcher for PandaCSS.

## Source contributors are first-class

Webstudio's panel is organized around style sources rather than a flat computed-CSS table. A selected element may receive styles from local sources, reusable token sources, tag/component preset styles, inherited sources, state/pseudo selectors, and locked/read-only sources.

For this project, the equivalent concept is a source contributor: a selected DOM node may map to several `css(...)`, `cx(...)`, recipe, conditional, prop-provided, or external class contributors. The inspector should make contributors explicit and require the user or edit flow to target a specific editable contributor instead of pretending that one DOM node has one source object.

## Preview and persistence should stay separate

Webstudio has a clear split between ephemeral preview updates and committed model updates. This strongly supports the planned runtime-only live preview layer.

For this project:

- input hover, scrubbing, dragging, and typing can update preview styles;
- clearing/reverting preview should only remove runtime overlays;
- saving should send a structured edit request to the source patcher;
- generated CSS or preview CSS must never become the persistence target.

## CSS inputs need intermediate states

The reference CSS value input accepts transient invalid or incomplete values while editing, then only commits valid parsed values. It also includes practical tolerances such as trimming semicolons, inferring units, evaluating simple math-like input, accepting comma decimal typos, trying kebab-case, and recovering colors missing `#`.

For this project, the UI should allow intermediate local input states. Source writeback should only occur once a value can be represented confidently in the Panda source model. Ambiguous computed-CSS-to-token conversion should be surfaced explicitly instead of guessed.

## Property-specific editors matter

Webstudio has dedicated editors for layout, flex/grid child behavior, spacing, typography, backgrounds, borders, shadows, filters, transforms, transitions, and advanced/raw CSS. Compound properties are not treated as plain text only; examples include splitting `background-size`, editing repeated background/shadow layers, and extracting transform sub-functions.

For this project, the MVP can start with generic Panda object editing, but the plan should leave room for focused editors for high-value and compound properties such as spacing, size, color/background, typography, layout/flex/grid, border radius, shadows, and transforms.

## Computed CSS is useful context, not source truth

Webstudio uses computed context to decide which controls are meaningful, such as showing flex-child controls only when the parent is flex, grid-child controls only when the parent is grid, list controls only for list-like tags, and hiding transform controls for non-transformable display types.

For this project, computed CSS should guide relevance, warnings, inheritance display, and previews. Panda source metadata remains the authority for what can be edited and persisted.

## Repeated and layered CSS is a hard edge case

The reference contains substantial handling for repeated/layered values such as backgrounds and shadows, including cascaded/computed mismatches, hidden layers, CSS variables, and synchronized index-based edits across related properties.

For this project, repeated and compound values should be treated as explicit edge cases. The existing edit-path shape can support nested paths over time, but the MVP should report unsupported compound edits unless the source shape is straightforward and safely patchable.

## Read-only and unsupported states should be visible

Webstudio makes locked sources read-only and prevents writes to them. This matches this project's safety requirements.

The inspector should visibly distinguish generated, external, dynamic, stale, locked, production-disabled, unavailable, and unsupported source targets. When an edit cannot be written back confidently, the UI should explain the limitation rather than guessing.

## Raw CSS can be an escape hatch later

Webstudio includes a CSS fragment editor that parses declarations and values. A similar future feature could let users type raw CSS, then convert it into candidate structured Panda edits. Even then, persistence should still flow through source-aware structured edits and the AST patcher, not generated CSS mutation.

## Planning implications

- Keep source contributors/source targets as a first-class inspector concept.
- Preserve the strict separation between preview and save.
- Support intermediate invalid input locally in controls.
- Use computed CSS for context and applicability, not persistence.
- Treat repeated, layered, and compound CSS values as known hard cases.
- Surface unsupported or ambiguous source states clearly.
- Start with static Panda object literal paths, while leaving room for richer property-specific editors later.
