# s&box Analytics — Agent Context

This project is building **s&box Game Analytics**, a real-time analytics platform purpose-built for s&box game developers. It provides player behavior insights, session tracking, and performance monitoring without the bloat of general-purpose analytics tools.

> **Positioning**: "Analytics built for s&box developers — not marketers."

## Product Briefs

When working on this codebase, refer to the following documents for context:

- **Product Vision** (`docs/agents/vision.md`) — What this product is, who it's for, and how it differs from general analytics.
- **Product Features** (`docs/agents/features.md`) — Capabilities of the platform, analytics features, and the Event Ingestion API contract.
- **Development Reference** (`docs/agents/development.md`) — Architecture diagram, tech stack, key trade-offs, and risks.
- **Marketing & Positioning** (`docs/agents/marketing.md`) — Channels, launch sequence, and messaging.
- **Pricing & Economics** (`docs/agents/pricing.md`) — Tiered pricing, infrastructure costs, and revenue targets.
- **Success Metrics** (`docs/agents/metrics.md`) — Product and business health indicators.
- **Project Scope** (`docs/agents/scope.md`) — What's in scope and what's explicitly out of scope.

## High-Level Architecture

```
s&box Game (C# SDK) → Ingest API (Hono/Bun) → Redpanda → ClickHouse (Kafka engine → MergeTree)
                              ↳ Postgres (API key lookup, cached in Redis)

Dashboard (React + TanStack Router + shadcn/ui + Recharts)
   ↕
Hono + oRPC API Backend (Better Auth, Prisma, Polar) → Postgres + ClickHouse
```

---

## Environment Variables

Whenever you add, rename, or remove an environment variable, you **must** update `.env.example` at the repo root in the same change. Every app/package `.env.example` is a symlink to this single file, and each app's env schema (`packages/env/src/server.ts`, `packages/env/src/web.ts`) validates against it — drift here breaks local setup and CI for everyone.

- Add the variable under the matching section (or create a new section), with a short comment explaining what it is and how to obtain a value.
- Use a clearly-fake placeholder (`replace-me`, `replace-me-with-32-plus-random-chars`, etc.) — never commit real secrets.
- Update the corresponding zod schema in `packages/env` so the variable is actually validated.

---

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `bun x ultracite fix` before committing to ensure compliance.
