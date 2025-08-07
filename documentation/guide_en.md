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

## Installation

- npm install @sagifire/quiver

The library can be used with native Node.js HTTP server and TypeScript or JavaScript.

## Quick start

A simple server with exact paths and patterns:
