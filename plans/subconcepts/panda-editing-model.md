# Panda Editing Model

## Panda-Aware Editing Model

The editable model is Panda source:

```ts
css({
  px: '4',
  py: '2',
  bg: 'blue.600',
  color: 'white',
})
```

Generated CSS is useful evidence but not the persistence target:

```css
padding-inline: var(--spacing-4);
background: var(--colors-blue-600);
```

The inspector should parse or import Panda configuration and build indexes for tokens, semantic tokens, breakpoints, conditions, recipes, utilities, shorthand aliases, and valid property names.

Responsive values should be modeled directly:

```ts
css({
  px: { base: '3', md: '6' },
  bg: { _light: 'white', _dark: 'gray.900' },
})
```

An edit operation can target a nested path:

```json
{
  "op": "set",
  "path": ["px", "md"],
  "value": "8"
}
```
