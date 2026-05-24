# Source Writeback Rules

The CSS editor panel must write changes back to source code safely and predictably.

## Priorities

- Favor correctness, reversibility, debuggability, and preservation of user-authored source over cleverness.
- Preserve formatting, comments, ordering, and unrelated code whenever possible.
- Avoid destructive rewrites.
- Make writeback behavior explicit and testable.
- Account for edge cases such as shorthand properties, missing declarations, duplicate properties, responsive/state variants, generated styles, unsupported syntax, and source locations that cannot be mapped safely.
- When a change cannot be written back confidently, surface that limitation instead of guessing.

## Architecture boundaries

Keep interfaces clear between:

- editor panel UI,
- style model/state,
- source analysis,
- source mutation/writeback,
- validation/error reporting.

Do not mix UI behavior with source mutation logic unless the plan explicitly says to.

## Implementation expectations

- Keep writeback logic deterministic and easy to test.
- Prefer adding tests or testable seams around source writeback behavior.
- Include comments where they clarify non-obvious behavior, purpose, rationale, or safety constraints.
