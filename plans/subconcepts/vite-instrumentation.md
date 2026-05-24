# Vite Instrumentation

## Vite Integration

The app installs one Vite plugin:

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { preactPandaInspector } from '@pkg/preact-panda-inspector/vite';

export default defineConfig({
  plugins: [
    preactPandaInspector({
      enabled: process.env.NODE_ENV !== 'production',
      projectRoot: process.cwd(),
      pandaConfig: './panda.config.ts',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules/**', 'styled-system/**'],
      panda: {
        cssImportSources: [
          '../styled-system/css',
          '@/styled-system/css',
          'styled-system/css',
        ],
        recipeImportSources: [
          '../styled-system/recipes',
          '@/styled-system/recipes',
          'styled-system/recipes',
        ],
      },
      manifest: {
        outFile: '.panda-inspector/manifest.json',
      },
      runtime: {
        inject: true,
      },
    }),
    preact(),
  ],
});
```

Vite is the correct instrumentation layer because it can parse TS/TSX, preserve source file identity, produce source ranges, insert development-only JSX attributes, emit a sidecar manifest, inject a runtime agent, and integrate with dev server reload and HMR. Reconstructing this later from generated CSS, class names, or sourcemaps would be less reliable and less Panda-aware.

## Vite Plugin Responsibilities

The plugin should:

1. Discover Panda imports, including aliases for `css`, `cx`, and recipes.
2. Find editable call sites such as `className={css({ ... })}`, `class={css({ ... })}`, `className={cx(css({ ... }), otherClass)}`, and later recipe calls.
3. Inject DOM metadata attributes.
4. Emit manifest entries for editable source targets.
5. Inject a dev-only runtime agent.

Recommended metadata attributes:

```txt
data-panda-edit-id
  Stable id used to look up a manifest entry.

data-panda-source
  Human-readable source location for display.

data-preact-component
  Best-effort component owner name.
```

Example instrumented output:

```tsx
<button
  data-panda-edit-id="src/components/Button.tsx:18:14#0"
  data-panda-source="src/components/Button.tsx:18:14"
  data-preact-component="Button"
  className={css({
    px: '4',
    py: '2',
    bg: 'blue.600',
    color: 'white',
  })}
>
  Save
</button>
```

Example manifest entry:

```json
{
  "version": 1,
  "projectRoot": "/absolute/path/to/project",
  "entries": {
    "src/components/Button.tsx:18:14#0": {
      "id": "src/components/Button.tsx:18:14#0",
      "file": "src/components/Button.tsx",
      "absoluteFile": "/absolute/path/to/project/src/components/Button.tsx",
      "kind": "panda-css",
      "component": "Button",
      "element": "button",
      "attribute": "className",
      "callee": "css",
      "range": { "start": 412, "end": 508 },
      "loc": {
        "start": { "line": 18, "column": 14 },
        "end": { "line": 23, "column": 5 }
      },
      "styleObject": {
        "px": "4",
        "py": "2",
        "bg": "blue.600",
        "color": "white"
      },
      "dynamic": false,
      "confidence": "high"
    }
  }
}
```

## Preact-Specific Considerations

Preact component ownership is useful but not authoritative. The Vite transform can infer component names in common cases:

```tsx
export function Button() {
  return <button className={css({ px: '4' })} />;
}
```

```tsx
const Button = () => {
  return <button className={css({ px: '4' })} />;
};
```

For hard cases such as anonymous default exports or object-literal component methods, display the file and source location instead of overclaiming component identity.
