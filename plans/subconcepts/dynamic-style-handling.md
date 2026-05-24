# Dynamic Style Handling

## Dynamic Style Handling

Supported in MVP:

```tsx
css({
  bg: 'blue.600',
})
```

```tsx
css({
  bg: { base: 'white', _dark: 'gray.900' },
})
```

Limited or unsupported initially:

```tsx
css({
  bg: danger ? 'red.600' : 'gray.600',
})
```

```tsx
css({
  px: '4',
  ...props.styles,
})
```

```tsx
const cardStyles = { px: '4' };
css(cardStyles);
```

Dynamic expressions should be displayed read-only with options such as open in editor or replace with a fixed value. Spread objects can allow partial editing of static properties while marking spread content as dynamic. Variable references require symbol resolution and should be deferred.
