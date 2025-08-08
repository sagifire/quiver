# Quiver – lightweight HTTP router and utilities for Node.js

Quiver is a small, fast, and type-friendly toolkit for building HTTP services. It focuses on predictable routing, clear control flow, and safe request/response helpers while staying framework-agnostic. You wire Quiver to Node’s native HTTP server and opt in only to what you need.

Key strengths:
- Minimal core with explicit composition: register route types, add rules, and chain lightweight pipes (middleware).
- Strong typing (TypeScript-first) with discriminated unions across route types.
- Fast routing strategies: exact path lookups and trie-based pattern routing.
- Safe helpers for request bodies and responses, plus structured HttpException errors.
- First-class static file serving with ETag, range requests, and precompressed assets.

Contents:
- Installation
- Quick start
- Route types
- Pipes (middleware)
- RequestContext essentials
- Error handling
- Serving static files
- Extending RequestContext
- Defining a custom route type
- TypeScript tips
- Performance notes
- Troubleshooting

## Installation

- npm install @sagifire/quiver

Quiver is designed to work with Node.js' built-in `http` server and with both TypeScript and JavaScript projects.

## Quick start

A minimal server using exact-path routes:

```ts
import http from 'node:http'
import {
  Router,
  PathRouteType,
  RequestContext
} from '@sagifire/quiver'

// create router and register path-based route type
const router = new Router()
  .useType(new PathRouteType())

// add a simple route rule
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
```

## API overview

Top-level exports:
- RequestContext — per-request helper and typed container for req/res, params, locals and helpers.
- Router — coordinates route types and global pipes, produces an HTTP handler.
- PathRouteType, PatternRouteType, StaticRouteType — built-in route types.
- StaticIndex — file index used by StaticRouteType.
- HttpException — structured errors with status, headers and "expose" flag.
- Types: Handler, Pipe, Method, IRouteType, RouteRuleBase, and rule interfaces for the route types.

Router highlights:
- router.useType(typeInstance) — register a route type instance (order matters).
- router.useGlobalPipes(...pipes) — run pipes for every request before route matching.
- router.addRule(rule) / addRules([...]) — add discriminated rules; rule.type chooses route type.

Route types are instances that implement IRouteType:
- typeName: string
- addRule(rule)
- match(ctx) => Handler | null

Router.handler performs:
1. create RequestContext (built-in or provided factory/class)
2. run global pipes sequentially
3. iterate registered route types (in registration order) and call match(ctx)
4. if a match is found, run its handler; otherwise return 404 JSON
5. top-level try/catch converts thrown HttpException into JSON responses (honors expose and headers)

## Route types

Quiver provides three main route types out of the box.

### PATH (PathRouteType)
- Exact method + normalized path matching.
- Internally stores keys `"METHOD PATH"` in a sorted array and uses binary search for lookup.
- Methods default to all standard HTTP methods if omitted.
- HEAD requests fall back to GET: if a GET handler exists and HEAD does not, the GET handler runs but the body is suppressed for HEAD responses (headers still set).
- If the path exists but the method is not allowed, the router will throw an HttpException(405) with an `Allow` header listing the permitted methods (GET implies HEAD allowed in `Allow`).
- Usage:

```ts
router.useType(new PathRouteType())

router.addRule({
  type: 'PATH',
  path: '/users',
  methods: ['GET'],
  handler: async (ctx) => {
    ctx.json([{ id: 1, name: 'Alice' }])
  }
})
```

Notes: paths are normalized (trailing slash removed, root represented as "/").

### PATTERN (PatternRouteType)
- Trie-based routing supporting:
  - static segments: `users`
  - named params: `:id` (with optional inline regex or external constraints)
  - wildcard final segment: `*` or `*rest` (must be the last segment)
- Constraints API: built-in validators (`int`, `uuid`, `hex`, `alpha`) or `RegExp` or a custom predicate `(v: string) => boolean`.
- Example patterns:
  - `/users/:id` — captures `id`
  - `/files/*path` — captures the remainder into `path`
  - `/items/:sku([A-Z0-9_-]+)` — inline regex
- Matching:
  - exact static child first, then param child (if validator passes), then wildcard.
  - HEAD uses GET fallback (handled by handler lookup).
- Usage:

```ts
router.useType(new PatternRouteType())

router.addRule({
  type: 'PATTERN',
  pattern: '/users/:id',
  methods: ['GET'],
  handler: (ctx) => {
    const id = (ctx as any).params.id
    ctx.json({ id })
  }
})

router.addRule({
  type: 'PATTERN',
  pattern: '/files/*path',
  handler: (ctx) => {
    const p = (ctx as any).params.path
    ctx.text(`You asked for ${p}`)
  }
})
```

### STATIC (StaticRouteType) and StaticIndex
- StaticRouteType serves filesystem assets via a StaticIndex instance which maps URL paths to absolute file paths.
- Features:
  - Content-Type resolution via built-in map, `contentTypes` override, or `resolveContentType` callback.
  - `X-Content-Type-Options: nosniff`, `Last-Modified`, `ETag`.
  - Conditional GET via If-None-Match → 304.
  - Range requests support (`Accept-Ranges: bytes`) and 206 partial content; configurable for precompressed assets.
  - Precompressed support (Brotli/gzip): choose sibling files (`file.js.br`, `file.js.gz`) or a custom resolver to serve precompressed files and set `Content-Encoding`.
  - Config options:
    - precompressed: enable, prefer order, useSiblingFiles, resolver, allowRangesForCompressed, alwaysSetVary
    - defaultContentType, defaultTextCharset, contentTypes map
- StaticIndex:
  - Builds a map from URL path (based on `urlBase`) to absolute files under `rootDir`.
  - Options: `scanIntervalMs` (periodic rebuild), `followSymlinks`, `maxFiles`, `maxDepth`, `allowWellKnown`, logger hooks.
  - Use `index.start()` to start optional periodic rebuilding.
- Usage:

```ts
import { StaticIndex, StaticRouteType } from '@sagifire/quiver'

const index = new StaticIndex({
  rootDir: './public',
  urlBase: '/static',
  scanIntervalMs: 10_000,
  followSymlinks: false
})
index.start()

const staticType = new StaticRouteType({ index, precompressed: { enabled: true } })
router.useType(staticType)

// add a STATIC rule so Router#addRule accepts a STATIC rule (rule body can be empty for most cases)
router.addRule({ type: 'STATIC', methods: ['GET', 'HEAD'], handler: async () => {} })
```

Remarks: StaticRouteType.match checks the request URL with `index.resolveUrl(ctx.url)`. If no file maps, it returns null so the Router can continue to other route types or return 404.

## Pipes (middleware) and composition

- A Pipe is a function `(ctx) => void | Promise<void>` that runs before a handler. Pipes are composable; they can mutate ctx, set headers, authenticate, etc.
- Compose: when you add a rule, `compose(pipes, handler)` (internal helper) returns a handler that runs pipes sequentially then calls the handler.
- Global pipes: `router.useGlobalPipes(pipe1, pipe2)` run for every request before route matching (useful for logging, request timeouts, CORS, etc).
- Example:

```ts
const authPipe = async (ctx: RequestContext) => {
  const t = ctx.req.headers['authorization']
  if (!t) throw new HttpException(401, 'Unauthorized', true)
  ctx.locals.user = { id: 'u1' }
}

router.useGlobalPipes(authPipe)

router.addRule({
  type: 'PATH',
  path: '/me',
  handler: (ctx) => ctx.json({ user: ctx.locals.user })
})
```

## RequestContext essentials

RequestContext wraps the Node req/res and provides helpers and per-request storage:

Properties:
- req: IncomingMessage
- res: ServerResponse
- url: URL (filled by Router.handler)
- params: Record<string,string> (filled by PatternRouteType)
- locals: Record<string, unknown> (for app-specific data)
- limits: { bodySize, headerTimeoutMs, requestTimeoutMs } — configurable defaults are set on construction.

Response helpers:
- status(code: number) — set status code, fluent.
- header(k, v) — set header, fluent.
- json(obj) — sets Content-Type if missing and ends response with JSON.
- text(s) — sets Content-Type if missing and ends response with plain text.

Request body helpers:
- bodyRaw(limit?) => Promise<Buffer>
  - reads request body with size limit and abort-safe handlers; throws HttpException(413) on oversize and HttpException(499) on client abort.
- bodyJson<T>() => Promise<T>
  - parses JSON and throws HttpException(400) on invalid JSON.

These helpers are safe to use in pipes and handlers.

## Error handling (HttpException)

- Use `throw new HttpException(status, message, expose?, headers?)` to return structured errors from pipes or handlers.
  - `status` (number) — HTTP status code
  - `message` (string) — error message
  - `expose` (boolean, default: status < 500) — whether the message should be included in the JSON response body
  - `headers` (Record<string,string>) — additional headers to set on the response
- Router.handler will catch thrown exceptions, read `statusCode`, set headers, set `Content-Type: application/json`, and return `{ error: e.expose ? e.message : 'Internal Server Error' }` as JSON.

Example:

```ts
import { HttpException } from '@sagifire/quiver'

throw new HttpException(403, 'Forbidden', true)
```

## Extending RequestContext

Router supports custom context creation via constructor opts:

```ts
class MyCtx extends RequestContext {
  user?: { id: string }
}

const router = new Router({ context: { class: MyCtx } })

// or using factory
const router2 = new Router({
  context: { factory: (req, res) => new MyCtx(req, res) }
})
```

Handlers and pipes can be typed to your `MyCtx` type for better ergonomics.

## Defining a custom route type

Implement the `IRouteType` interface:

```ts
import { IRouteType, RequestContext, RouteRuleBase, Handler } from '@sagifire/quiver'

interface MyRule extends RouteRuleBase {
  type: 'MYTYPE'
  // custom rule fields...
}

class MyRouteType implements IRouteType<RequestContext, MyRule> {
  readonly typeName = 'MYTYPE'
  addRule(rule: MyRule) {
    // register rule
  }
  match(ctx: RequestContext): Handler | null {
    // return handler if matches, otherwise null
    return null
  }
}

router.useType(new MyRouteType())
router.addRule({ type: 'MYTYPE', handler: () => {}, /* ... */ })
```

Important: register your route type instance with `router.useType` before adding rules of that type; the router enforces that a rule's `type` has been registered.

## TypeScript tips

- Router's generics help create a discriminated rule union: after `useType` the `addRule` method gets narrowed types for each route rule. Prefer to call `useType` early so `addRule` is fully typed.
- Handlers and Pipes accept a generic `Ctx extends RequestContext` so you can use a custom context type across your app.
- Use explicit method lists on rules when you need to constrain allowed HTTP methods. Omitting `methods` defaults to the full standard list.

## Performance notes

- PATH routing uses a sorted array + binary search for O(log N) route lookup per method+path — very fast for large numbers of exact routes.
- PATTERN routing uses a trie (prefix tree) which is efficient for hierarchical routes; matching favors static segments → params → wildcard.
- StaticIndex maps URL paths to absolute file paths using an in-memory Map for O(1) lookup (after index build). For very large trees consider limiting `maxFiles`, incremental indexing or sharding.
- Pipes are run sequentially; keep heavy synchronous work outside the critical path or run it asynchronously.

## Troubleshooting and common pitfalls

- 404 vs 405:
  - PATH: if a path exists but the method isn't registered, you will get a 405 with `Allow`.
  - If no route type matched the URL, Router returns 404 JSON.
- HEAD requests:
  - PATH has explicit fallback: missing HEAD but present GET will run GET handler with body suppressed.
  - PATTERN relies on handler lookup mapping HEAD → GET in handler storage.
- Precompressed choice:
  - Precompressed files are picked based on Accept-Encoding parsing and `prefer` ordering. If a token has q=0 it's considered unacceptable.
  - Use `resolver` if you need custom selection logic (CDN, different extensions, etc).
- ETag / conditional requests:
  - ETag is a weak ETag (`W/"size-mtime[-enc]"`) and If-None-Match exact comparison yields 304.
  - If serving precompressed assets, ETag includes encoding when compressed.
- Wildcard rules:
  - Wildcard (`*` or `*name`) must be the last segment in a pattern; parse/registration throws otherwise.
- URL decoding:
  - Pattern matching decodes path segments safely; if decoding fails, the route does not match.
- StaticIndex and symlinks:
  - When `followSymlinks` is false, symlinks are not followed. When true, the index will follow links but ensures the real target is inside the root.

## Examples

Full server with pattern routes, global pipe and static assets:

```ts
import http from 'node:http'
import {
  Router,
  PatternRouteType,
  PathRouteType,
  StaticRouteType,
  StaticIndex,
  RequestContext,
  HttpException
} from '@sagifire/quiver'

const router = new Router()
  .useType(new PathRouteType())
  .useType(new PatternRouteType())

const index = new StaticIndex({ rootDir: './public', urlBase: '/static', scanIntervalMs: 5000 })
index.start()
router.useType(new StaticRouteType({ index, precompressed: { enabled: true } }))

// simple logging pipe
router.useGlobalPipes(async (ctx: RequestContext) => {
  console.log(`${ctx.req.method} ${ctx.url.pathname}`)
})

// add pattern
router.addRule({
  type: 'PATTERN',
  pattern: '/users/:id(int)',
  handler: (ctx) => {
    const id = (ctx as any).params.id
    ctx.json({ id })
  }
})

// add path
router.addRule({
  type: 'PATH',
  path: '/ping',
  handler: (ctx) => ctx.text('pong')
})

const server = http.createServer((req, res) => router.handler(req, res))
server.listen(3000)
```

## Final notes

Quiver is intentionally small and composable. It focuses on predictable behavior, simple primitives, and clear operational semantics for routing, static serving, and request handling. Use it as a building block (or inspiration) for microservices and custom HTTP stacks.

If you need further developer documentation (diagrams, more examples, or extension recipes), add a request to the repository's documentation tasks.
