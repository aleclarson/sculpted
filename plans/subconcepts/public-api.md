# Public API

## Public API Sketch

### Vite plugin

```ts
type InspectorVitePluginOptions = {
  enabled?: boolean;
  projectRoot?: string;
  pandaConfig?: string;
  include?: string[];
  exclude?: string[];
  panda?: {
    cssImportSources?: string[];
    recipeImportSources?: string[];
    cssFunctionNames?: string[];
    cxFunctionNames?: string[];
  };
  manifest?: {
    outFile?: string;
    virtualEndpoint?: string;
  };
  runtime?: {
    inject?: boolean;
    globalName?: string;
  };
  attributes?: {
    editId?: string;
    source?: string;
    component?: string;
  };
  patcher?: {
    formatter?: 'prettier' | 'biome' | 'none' | { command: string; args: string[] };
  };
};

export function preactPandaInspector(
  options?: InspectorVitePluginOptions,
): import('vite').Plugin;
```

### Runtime inspector

```ts
type RuntimeInspectorOptions = {
  globalName?: string;
  manifestEndpoint?: string;
};

class PandaRuntimeInspector {
  constructor(options?: RuntimeInspectorOptions);
  loadManifest(): Promise<void>;
  startInspecting(): void;
  stopInspecting(): void;
  selectElement(element: Element): Promise<SelectedElementInfo>;
  getComputedStyles(element: Element): CSSStyleDeclaration;
  applyPreview(preview: PreviewStyleSheet): void;
  clearPreview(): void;
}
```

### Patcher

```ts
type PatcherOptions = {
  projectRoot: string;
  manifestPath?: string;
  formatter?: FormatterConfig;
};

class PandaCodePatcher {
  constructor(options: PatcherOptions);
  previewEdit(request: StyleEditRequest): Promise<StyleEditResponse>;
  applyEdit(request: StyleEditRequest): Promise<StyleEditResponse>;
}
```
