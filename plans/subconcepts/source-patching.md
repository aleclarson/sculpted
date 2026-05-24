# Source Patching

## Source Patching

The AST patcher is the most important correctness boundary. It must:

- Parse TS/TSX source into an AST.
- Locate the intended call expression.
- Verify the target matches the manifest entry.
- Apply edits to object expressions.
- Preserve comments and formatting where possible.
- Run the project formatter if configured.
- Return a diff before writing unless confirmation is explicitly bypassed.
- Report ambiguity instead of guessing.

It must not use fragile string replacement such as `source.replace("px: '4'", "px: '5'")`.

Recommended edit protocol:

```ts
type StyleEditRequest = {
  editId: string;
  kind: 'panda-css' | 'panda-recipe';
  edits: StyleEdit[];
  options?: {
    write?: boolean;
    format?: boolean;
    expectedSourceHash?: string;
  };
};

type StyleEdit =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'delete'; path: string[] }
  | { op: 'rename'; from: string[]; to: string[] }
  | { op: 'replace-object'; value: Record<string, unknown> };
```

Recommended response:

```ts
type StyleEditResponse = {
  ok: boolean;
  editId: string;
  file: string;
  diff?: string;
  nextSource?: string;
  written?: boolean;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```
