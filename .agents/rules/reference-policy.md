# Reference Policy

Use `references/` as educational material only. References may demonstrate useful techniques, edge cases, APIs, UI behaviors, parsing strategies, writeback flows, or integration patterns, but they are not the target architecture.

## Core rules

- Treat `plans/` as the source of truth.
- Treat `references/` as inspiration and implementation research, not as code to copy.
- Do not let reference code dictate the shape of our implementation.
- Do not wholesale port reference architecture, file structure, naming conventions, abstractions, or control flow unless the plan files independently call for the same shape.
- Learn from references at the level of techniques, edge cases, sequencing, data flow, API usage, and tradeoffs.
- Prefer idiomatic implementation for this project over fidelity to the reference.
- Preserve the intent and constraints expressed in the plan files even when reference code solves a similar problem differently.

## Working from references

- First identify what lesson the reference is meant to provide.
- Extract the underlying idea, not the implementation surface.
- Re-express that idea in terms of our planned architecture.
- Avoid copying non-trivial code, unique structure, comments, test fixtures, or naming from references.
- If a reference contains useful behavior, implement equivalent behavior in our own style.
- If a reference contains irrelevant or incompatible choices, ignore them.
- If a reference conflicts with a plan file, follow the plan file and note the conflict.

## Dependencies from references

- If reference code uses a library, check whether the plan files mention a similar or preferred library.
- If the plan files mention a similar library, use the library from the plan files instead of the reference’s library.
- If the plan files do not mention a similar library, do not silently add the reference library.
- Instead, explicitly propose adding that library, including:
  - what problem it solves,
  - why it is useful,
  - whether a native or already-present project alternative exists,
  - what tradeoffs it introduces.
- Do not introduce new dependencies unless they are clearly justified.
