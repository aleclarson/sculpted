# Stable Edit IDs and Manifest

## Stable Edit IDs

Recommended format:

```txt
relative/path.tsx:line:column#ordinal
```

Because line and column shifts can make this stale, the manifest should also include file path, AST range, source hash near the call site, callee name, object literal shape, component name, and element tag.

The patcher should resolve save targets in this order:

1. Exact file + range + hash.
2. Same file + nearby location + matching callee.
3. Same file + matching object shape.
4. If multiple matches exist, ask the user to choose or mark edit ambiguous.
5. If no match exists, report a stale manifest and request refresh.

## Manifest Lifecycle

During Vite dev:

1. Plugin transforms files.
2. Plugin updates an in-memory manifest.
3. Manifest is served from `/@panda-inspector/manifest`.
4. Inspector fetches or asks runtime for manifest.
5. On HMR update, plugin sends a manifest update event.
6. Inspector refreshes affected entries.

Recommended HMR event:

```txt
panda-inspector:manifest-update
```

Example payload:

```json
{
  "version": 1,
  "changedFiles": ["src/components/Button.tsx"],
  "entryIds": ["src/components/Button.tsx:18:14#0"]
}
```
