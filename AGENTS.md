# Agent Instructions

You are an expert engineering agent helping implement a new “CSS editor panel” that edits CSS-like styling in a UI and writes those changes back to the project’s source code.

## Must remember

- Treat `plans/` as the source of truth for architecture, product behavior, constraints, implementation strategy, and preferred libraries or patterns.
- Treat `plans/insights/` as curated, project-owned learnings distilled from `references/`; read the relevant insight files before inspecting raw reference code.
- Treat `references/` as inspiration and implementation research, not as code to copy.
- Preserve the intent and constraints expressed in the plan files and insight files even when reference code solves a similar problem differently.
- The CSS editor panel must write changes back to source code safely and predictably.
- Favor correctness, reversibility, debuggability, and preservation of user-authored source over cleverness.
- Preserve formatting, comments, ordering, and unrelated code whenever possible.
- Avoid destructive rewrites.
- When a change cannot be written back confidently, surface that limitation instead of guessing.
- Do not introduce new dependencies unless they are clearly justified.
- Keep changes focused and incremental.
- Prefer adding tests or testable seams around source writeback behavior.
- Follow the existing project’s conventions, project-preferred libraries, types, patterns, lint rules, and file organization.

## Code style rules

Optimize code for locality, onboarding, and long-term maintainability. A future agent or developer should be able to understand and change behavior by reading the fewest files possible.

### Prefer locality

- Optimize for locality of change and comprehension.
- Related behavior should live close together. Most changes should require reading one cohesive area of the codebase, not searching through many tiny helpers, utility files, framework hooks, or distant configuration.
- Prefer code organization that lets a reader answer:
  - What entity or product concept owns this behavior?
  - Where is the relevant state?
  - Where is the relevant logic?
  - What are the important invariants?
  - What needs to change if this behavior changes?
- Avoid structures that force readers to jump across the codebase to understand one feature.

### Modularize at the entity/concept level

- Modularize aggressively around durable domain entities, product concepts, and stable architectural boundaries.
- Good module boundaries are things like:
  - domain entities
  - product concepts
  - major UI concepts
  - persistent resources
  - external integrations
  - protocol/API boundaries
  - workflows with durable meaning
- Within those modules, keep related behavior colocated.
- Do not modularize aggressively around incidental implementation details. Avoid splitting code into many tiny files, helpers, hooks, or abstractions just because they can be named.
- A module should usually represent a meaningful concept, not merely a small operation.
- Be skeptical of standalone files like `formatThing.ts`, `getThingLabel.ts`, `handleThingClick.ts`, `useThingState.ts`, `thingHelpers.ts`, and `utils.ts`.
- These are acceptable only when they clearly reduce maintenance burden, represent a real entity boundary, or are reused in a way that would otherwise create risky duplication.

### Inline logic by default

- Aggressively inline logic unless extraction clearly reduces a meaningful maintenance burden.
- Do not extract functions, hooks, classes, helpers, or modules merely because a block of code can be named. The existence of a possible name is not a sufficient reason to create an abstraction.
- Prefer readable local flow over unnecessary indirection.
- Extraction should pay for itself. Extract only when there is a clear reason, such as:
  - eliminating duplicated logic that is likely to diverge
  - isolating complex logic that materially distracts from the caller
  - enabling focused tests for correctness-sensitive behavior
  - establishing a durable entity, domain, or product boundary
  - separating a real lifecycle, persistence, protocol, or integration boundary
  - making critical invariants easier to enforce
  - reducing a proven maintenance burden
- Otherwise, keep implementation details local and explicit.
- Inlining does not mean writing tangled code. It means avoiding premature abstraction and preserving locality until the maintenance cost of keeping logic inline outweighs the cost of indirection.

### Avoid micro-abstractions

- Avoid micro-abstractions that make code look tidy while making behavior harder to trace.
- Small abstractions are harmful when they:
  - hide simple logic behind a name
  - require readers to jump to another file for one or two lines of behavior
  - fragment one cohesive operation across many helpers
  - make call sites read like a table of contents instead of actual behavior
  - create generic utilities before there are multiple real use cases
  - obscure control flow, data flow, or error handling
- A little duplication is often preferable to the wrong abstraction.
- Prefer duplication when the repeated code is small, local, and may evolve differently. Abstract only when the duplication represents the same durable concept or creates meaningful maintenance risk.

### Prefer “pure code”

- Prefer “pure code”: behavior should be explicit, local, and inspectable from normal source files.
- Avoid hidden coupling and hidden behavior. A reader should not need to understand a custom framework, search unrelated files, or know secret naming conventions to determine what code runs.
- Prefer plain functions, explicit imports, direct calls, ordinary data structures, visible control flow, explicit dependencies, local state where practical, and platform/language features over custom magic.
- Avoid global registration, reflection, decorators that hide behavior, monkey-patching, implicit dependency injection, ambient mutable state, global singletons, hidden framework lifecycle coupling, behavior determined by naming conventions, stringly-dispatched behavior, distant configuration that changes local behavior, and code generation that obscures source-level behavior.
- This does not require strict functional programming, but pure functions and explicit inputs/outputs are often good for locality.
- The goal is code whose behavior can be understood by reading the code near the change.

### Comment aggressively for purpose, rationale, and critical paths

- Optimize comments for onboarding.
- Add comments aggressively when the purpose, rationale, invariant, tradeoff, edge case, or failure mode is not obvious at a quick glance.
- Comments should explain why the code exists and what it is protecting. They should not merely paraphrase the syntax.
- Use comments to answer questions like:
  - Why does this exist?
  - Why is this shaped this way?
  - What invariant must be preserved?
  - What edge case is being handled?
  - What failure mode is being prevented?
  - Why is this safe?
  - Why not use the simpler obvious alternative?
  - What external behavior, protocol, or product requirement depends on this?
  - What would break if this changed?
- Critical paths deserve especially thorough comments. This includes code related to persistence, migrations, concurrency, synchronization, security, permissions, billing, data loss prevention, correctness-sensitive domain logic, retries, caching, state machines, external protocols, API compatibility, destructive operations, error recovery, and cross-process or cross-service coordination.
- Prefer comments that preserve hard-earned context. If understanding a line requires knowing history, tradeoffs, invariants, or product intent, write that context down near the code.

### Do not rely on names as documentation

- Entity names are not a documentation tool.
- Do not rely on function names, class names, variable names, file names, or type names to carry non-obvious purpose or rationale.
- Prefer minimal, readable names. Use comments to document meaning, intent, and context.
- Avoid extremely long names that try to encode all behavior, edge cases, or rationale. A long name is not a substitute for a useful comment.
- Names should identify things. Comments should explain non-obvious purpose.

### Optimize for future changes

- Code should be shaped so future changes are easy to make safely.
- Before introducing a new abstraction, ask:
  - Will this reduce the number of places a future change must inspect?
  - Does this represent a durable entity or product concept?
  - Does this eliminate risky duplication?
  - Does this make a critical invariant easier to preserve?
  - Does this make behavior easier to test or reason about?
  - Is the indirection worth the loss of locality?
- If the answer is unclear, prefer locality and inline code.

## Manual verification

- `examples/manual-vite-preact-pandacss/` is the minimal Vite + Preact + Panda CSS app for manually verifying CSS editor panel behavior and source writeback while this package is being built. It intentionally uses only Panda `css()` calls, with color tokens only and exact raw values for non-color properties.

## Required linked rules

Read these rule files when they are relevant to the task:

- `.agents/rules/reference-policy.md` — required before using files in `references/` or applying lessons from `plans/insights/`.
- `.agents/rules/source-writeback.md` — required before implementing source analysis, source mutation, persistence, validation, or writeback behavior.

## When uncertain

- Prefer the plan files, including `plans/insights/`, over raw references.
- Prefer minimal, safe implementation over broad architectural invention.
- Call out ambiguity clearly.
- Make a reasonable best-effort implementation if enough context exists.
- Ask for clarification only when proceeding would likely cause incorrect architecture, unsafe source edits, or unnecessary dependency changes.
