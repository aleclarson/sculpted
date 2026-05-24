# MVP Scope

The MVP is the smallest production-quality version of the persistent style inspector that proves the core product promise: a developer can select an element in a running Preact app, understand the PandaCSS source-backed styles that affect it, experiment safely, and intentionally persist supported edits back to source code.

This scope is intentionally narrow. It should feel reliable within its supported lane rather than expansive but unpredictable. The MVP should establish the architectural boundaries, safety model, and user trust needed for later support of recipes, dynamic expressions, richer controls, and broader styling systems.

## Product Shape

The MVP should be an in-app developer tool for Vite-powered Preact applications using PandaCSS. It is not a standalone browser extension, a replacement for browser devtools, or a general CSS editor. Its value comes from combining runtime inspection with source-aware metadata generated during development builds.

At a conceptual level, the MVP experience should include:

1. Selecting an element in the running app.
2. Seeing style information that is meaningful to a PandaCSS author.
3. Editing supported Panda style values in a temporary preview state.
4. Reviewing the source change before it is saved.
5. Persisting the accepted change back to the original source file.

The user should understand when they are editing source-backed Panda style data and when they are merely viewing runtime CSS information. The tool should avoid implying that every computed style is editable or safely traceable to source.

## Supported Project Environment

The MVP should target the project environment with the clearest path to correctness:

- Vite as the development server and instrumentation boundary.
- Preact with TSX source files as the component authoring model.
- PandaCSS `css()` calls as the initial styling source model.
- Development builds only, with production stripping or exclusion as a core safety property.

This environment is narrow by design. Vite provides the dev-server integration and source transformation layer. Preact TSX gives a concrete runtime/component target. Panda `css()` object literals provide a source form that can be analyzed and patched with much higher confidence than arbitrary style construction.

## Supported Style Model

The MVP should focus on static Panda `css({ ... })` object literals. This includes ordinary style properties and nested responsive or condition objects when they are directly represented in the object literal.

Conceptually, the supported model is: styles that are visibly present in source, structurally local to a `css()` call, and representable as source edits without evaluating application logic.

The MVP should support this because it is the smallest model that still demonstrates the central source-persistence loop. It also gives the system a clear definition of what can be edited confidently: literal style data owned by a specific source location.

## Runtime Inspection and Selection

The MVP should allow in-app element selection and show useful runtime style context for the selected element. Runtime inspection is responsible for helping the developer identify what they are looking at and understand the current rendered result.

Computed styles are valuable context, but they should not become the persistence source of truth. The MVP should treat computed CSS as runtime evidence and source metadata as the authority for edits. This distinction is central to avoiding misleading or destructive writeback behavior.

## Preview Model

The MVP should support live preview before persistence. Preview exists to make experimentation low-risk: a developer can try a value, see the result immediately, and then either discard it or choose to save it.

The preview layer should be conceptually separate from source mutation. A previewed change is not the same as an accepted edit. This separation protects user-authored source, makes the interaction reversible, and keeps the system honest about when filesystem writes occur.

## Persistence Model

The MVP should persist approved edits back to the original TS/TSX source using source-aware patching. The output should be small, reviewable diffs that preserve unrelated code, formatting, comments, and ordering whenever possible.

Persistence is the defining feature of the product, so the MVP should emphasize trust over breadth. If a style cannot be mapped to a supported source construct with high confidence, the tool should decline to write it rather than guess.

## Review and Safety

The MVP should include a diff-before-save step. The developer should be able to understand what file and source region will change before the tool writes to disk.

Safety should also include a strict development-only boundary. Filesystem write capabilities, source paths, and instrumentation metadata are dev-time concerns and should not leak into production builds.

## Explicit Deferrals

The MVP should defer features that would expand the conceptual surface area before the core loop is proven:

- Variable style object resolution.
- Full recipe editing.
- Compound variants.
- Computed-CSS-to-token conversion.
- Visual drag controls.
- Multi-file refactors.
- Preact developer-tool internals.
- Non-Panda CSS support.

These are important future directions, but each introduces ambiguity that could weaken the MVP’s reliability. The first version should instead make the supported path excellent and make unsupported paths clear.

## Success Criteria

The MVP succeeds if it demonstrates a trustworthy end-to-end workflow for source-backed style editing:

- A developer can select an element and identify its editable Panda source styles.
- Supported edits can be previewed without modifying source.
- Accepted edits can be reviewed as diffs before saving.
- Saved changes produce focused source diffs.
- Unsupported style patterns are presented as limitations rather than rewritten unsafely.
- Production builds do not include dev-only inspection or writeback capabilities.

The result should be a foundation that validates the product concept and creates confidence for expanding the styling model later.
