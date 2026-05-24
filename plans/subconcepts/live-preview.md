# Live Preview

## Live Preview

Preview should create a runtime-owned stylesheet scoped to the selected edit id:

```ts
const style = document.createElement('style');
style.dataset.pandaInspectorPreview = 'true';
style.textContent = `
  [data-panda-edit-id="src/components/Button.tsx:18:14#0"] {
    padding-inline: var(--spacing-5);
    background: var(--colors-purple-600);
  }
`;
document.head.append(style);
```

The preview stylesheet should be inspector-owned, removed on selection change, removed after save or cancel, and rebuilt as the user changes fields. Preview may be approximate; persistence must be exact.

A hybrid preview engine is recommended:

- Use an approximate resolver immediately for common Panda props and tokens.
- Later replace with accurate generated preview from Panda internals or generated helpers when available.
