# Security and Build Boundaries

## Security and Build Boundaries

This functionality must be development-only by default.

The Vite plugin should:

- Default to disabled for production builds.
- Strip all `data-panda-*` metadata in production.
- Not inject the runtime agent in production.
- Not expose manifest endpoints in production.
- Not expose filesystem write RPC in production.

The code patcher should:

- Require an explicit project root.
- Refuse writes outside project root.
- Normalize and validate file paths.
- Optionally require a local auth token when exposed over HTTP.
- Never accept arbitrary shell commands.
- Call formatter through a configured safe command or library API.

The browser should send only an `editId`; the server-side patcher should resolve that id through a trusted manifest.
