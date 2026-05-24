# Risks and Open Questions

## Risk Assessment

- Generated CSS does not map cleanly to Panda source. Mitigate by generating source mapping during Vite transform.
- Manifest becomes stale after file edits. Mitigate with source hashes, range validation, and Vite HMR manifest refresh.
- Dynamic expressions cannot be safely edited. Mitigate with read-only display and explicit replace-with-static-value actions.
- Preview diverges from final Panda output. Mitigate by treating preview as temporary and using Panda rebuild as final truth.
- Production accidentally exposes source paths. Mitigate by defaulting disabled in production and stripping inspector attributes.
- Recipe support is more complex than `css()` support. Mitigate by making `css()` the MVP and designing recipes as a separate manifest source kind.

## Open Questions

1. Where should the inspector UI live: inside the app, in a second window, or in a separate local web UI?
2. Should saves require explicit confirmation every time, or can users enable auto-save?
3. Which formatter is standard for the codebase: Prettier, Biome, or something else?
4. Should the patcher integrate with git to create checkpoints or automatic undo commits?
5. How much Panda token resolution should be implemented in v1 preview?
6. Should recipe support be included in MVP if the app already uses recipes heavily?
7. Should the package expose lower-level primitives for custom inspector UIs?
