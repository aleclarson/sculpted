# Runtime Inspection

## Runtime Responsibilities

The runtime agent should handle browser-native inspection and preview inside the page using standard DOM APIs:

```txt
pointer events
Document.elementFromPoint
Element.getBoundingClientRect
Element.attributes
Window.getComputedStyle
HTMLStyleElement / CSSOM
```

Element selection should use an inspect mode that captures pointer movement and clicks:

```ts
function startInspecting(onSelect: (element: Element) => void) {
  const onPointerMove = (event: PointerEvent) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element) highlightElement(element);
  };

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element) onSelect(element);
  };

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('click', onClick, true);

  return () => {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('click', onClick, true);
    clearHighlight();
  };
}
```

The inspector reads DOM metadata from attributes, then fetches computed styles as evidence:

```ts
const editId = element.getAttribute('data-panda-edit-id');
const source = element.getAttribute('data-panda-source');
const component = element.getAttribute('data-preact-component');
const computed = getComputedStyle(element);
```

Panel order should be:

1. Editable Panda source
2. Panda recipe / variant source
3. Generated CSS preview
4. Computed CSS
5. DOM attributes
