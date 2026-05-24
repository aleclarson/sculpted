# Runtime Agent

## Runtime Agent

The runtime agent should be small. It exposes manifest and selected-element metadata, optionally maps DOM nodes to Preact component owners, and provides version compatibility information. It must not write files.

Example API:

```ts
type InspectorRuntime = {
  version: string;
  manifestVersion: number;
  getManifest(): Promise<InspectorManifest>;
  getEntry(id: string): InspectorManifestEntry | undefined;
  getElementInfo(selectorOrId: string): ElementInfo | undefined;
};
```

Installed globally in dev:

```ts
window.__PANDA_INSPECTOR__ = createInspectorRuntime();
```
