# Quiver

Lightweight, fast, and type-friendly HTTP router and utilities for Node.js.

Quiver is a small, focused toolkit for building HTTP services. It is framework-agnostic, TypeScript-first, and designed for predictable routing, clear control flow, and safe request/response helpers. Wire Quiver to Node’s native `http` server and opt into only the parts you need.

## Features

- Minimal core with explicit composition and middleware (pipes)
- TypeScript-first API with clear types for routes and handlers
- Fast PATH routing (exact lookups) and PATTERN routing (trie-based)
- Static file serving with ETag, range requests, and precompressed support
- Safe RequestContext helpers: `.json()`, `.text()`, `.bodyJson()`, `.status()`, etc.
- Structured errors via `HttpException`

## Installation

npm:
```
npm install @sagifire/quiver
```

yarn:
```
yarn add @sagifire/quiver
```

## Quick start

```ts
import http from 'node:http'
import { Router, PathRouteType, RequestContext } from '@sagifire/quiver'

const router = new Router()
  .useType(new PathRouteType())

router.addRule({
  type: 'PATH',
  path: '/hello',
  methods: ['GET'],
  handler: (ctx: RequestContext) => {
    ctx.json({ hello: 'world' })
  }
})

const server = http.createServer((req, res) => router.handler(req, res))
server.listen(3000)
console.log('Listening on http://localhost:3000')
```

## API overview

Top-level exports (high level):
- `Router` — registers route types, global pipes, and produces an HTTP handler.
- `RequestContext` — per-request helper that wraps `req`/`res` and exposes helpers and storage.
- `PathRouteType`, `PatternRouteType`, `StaticRouteType` — built-in route types.
- `StaticIndex` — file index for StaticRouteType.
- `HttpException` — structured HTTP errors.

Router behavior:
1. Builds a `RequestContext` for each request.
2. Runs global pipes before route matching.
3. Iterates registered route type instances (in registration order) and tries to match.
4. Runs matched handler or returns 404 JSON. Thrown `HttpException`s are converted to JSON responses (honors `expose`).

Refer to the developer guide for full usage, examples and advanced options.

## Testing and coverage

Run tests:
```
npm test
# or
npm run test:cov
```

The project uses Vitest and V8/c8 coverage. Coverage reports are generated locally or in CI — do not commit generated coverage outputs into git. Use CI artifacts or external services (Codecov, Coveralls) for persistent coverage tracking.

## Development scripts

- `npm run dev` — start dev server (Vite)
- `npm run build` — build distributable bundles
- `npm test` — run tests
- `npm run test:cov` — run tests with coverage

## Contributing

- Open issues for bugs or feature requests.
- Fork the repository, create a branch, add tests and a clear PR description.
- Keep changes typed (TypeScript) and add tests for behavior changes.

## License

MIT — see the `LICENSE` file.

## Documentation

Full developer documentation and examples: ./documentation/guide_en.md
