# Manual Vite + Preact + Panda CSS test app

Minimal app for manually verifying Sculpted features while the package is being built.

MVP constraints represented here:

- Vite + Preact + Panda CSS.
- Panda styles are authored only with `css()` calls.
- No `cva()`, recipes, patterns, JSX style props, or other advanced Panda features.
- Design-token usage is limited to color tokens. Non-color properties use raw CSS values.

## Run

```sh
pnpm install
pnpm dev
```

Panda codegen runs via the `prepare` script. If needed, run it manually:

```sh
pnpm panda codegen
```
