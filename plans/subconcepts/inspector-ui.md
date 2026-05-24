# Inspector UI

## Inspector UI

The inspector may be embedded in the desktop app, shown in a separate window, or run as a companion local web UI.

Recommended layout:

```txt
Toolbar
  [Inspect element] [Refresh manifest] [Clear preview] [Prefs]

App / selected target          Inspector
  Runtime hover + selection      Element
  highlight appears in target    button
                                 Button
                                 src/components/Button.tsx

                               Editable Panda source
                                 px       4
                                 py       2
                                 bg       blue.600
                                 color    white

                               Generated CSS
                               Computed CSS
                               Diff
                               [Preview] [Save] [Revert]
```

Selection states to distinguish:

- No node selected.
- Node selected with no Panda metadata.
- Node selected with one Panda source target.
- Node selected with multiple Panda source targets.
- Node selected with stale metadata.
- Node selected with a dynamic expression.

The inspector must not pretend that one selected DOM node has exactly one editable source. For `cx(reset, css({ px: '4' }), isActive && css({ bg: 'blue.600' }), props.className)`, it should show multiple sources and clearly mark external or conditional sources.
