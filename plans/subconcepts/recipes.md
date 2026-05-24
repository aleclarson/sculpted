# Recipes

## Recipes

Panda recipes should be first-class editable targets, but can be deferred until after the `css()` MVP.

Source:

```tsx
<button className={button({ size: 'md', visual: 'solid' })} />
```

Save operation:

```json
{
  "editId": "src/components/Button.tsx:18:14#1",
  "kind": "panda-recipe",
  "edits": [
    { "op": "set", "path": ["size"], "value": "lg" }
  ]
}
```

Recipe edits must persist by changing the variant object, not by writing generated CSS.
