import { promises as w, createReadStream as v } from "node:fs";
import C, { extname as S } from "node:path";
class b extends Error {
  constructor(t, e = "Http Error", s = t < 500, h = {}) {
    super(e), this.statusCode = t, this.expose = s, this.headers = h;
  }
}
class P {
  constructor(t, e) {
    this.req = t, this.res = e;
  }
  url;
  // fill in router
  params = /* @__PURE__ */ Object.create(null);
  locals = /* @__PURE__ */ Object.create(null);
  // Configurable limits
  limits = {
    bodySize: 16 * 1024,
    headerTimeoutMs: 3e4,
    requestTimeoutMs: 6e4
  };
  // response API 
  status(t) {
    return this.res.statusCode = t, this;
  }
  header(t, e) {
    return this.res.setHeader(t, e), this;
  }
  json(t) {
    this.res.hasHeader("Content-Type") || this.res.setHeader("Content-Type", "application/json; charset=utf-8"), this.res.end(JSON.stringify(t));
  }
  text(t) {
    this.res.hasHeader("Content-Type") || this.res.setHeader("Content-Type", "text/plain; charset=utf-8"), this.res.end(t);
  }
  // Request body with limit and abort-safe
  async bodyRaw(t = this.limits.bodySize) {
    return new Promise((e, s) => {
      const h = [];
      let r = 0, i = !1;
      const a = (l) => {
        i || (i = !0, this.req.destroy(), s(l));
      }, o = () => {
        i || (i = !0, e(Buffer.concat(h)));
      };
      this.req.once("error", a), this.req.once("aborted", () => a(new b(499, "Client Closed Request", !0))), this.req.on("data", (l) => {
        if (r += l.length, r > t) return a(new b(413, "Content Too Large", !0));
        h.push(l);
      }), this.req.once("end", o);
    });
  }
  async bodyJson(t) {
    const e = await this.bodyRaw(t);
    try {
      return JSON.parse(e.toString("utf8"));
    } catch {
      throw new b(400, "Invalid JSON", !0);
    }
  }
}
class F {
  reg;
  order = [];
  ctxFactory;
  globalPipes = [];
  constructor(t) {
    this.reg = {}, this.ctxFactory = t?.context;
  }
  useType(t) {
    return this.reg[t.typeName] = t, this.order.push(t.typeName), this;
  }
  useGlobalPipes(...t) {
    return this.globalPipes.push(...t), this;
  }
  addRule(t) {
    const e = this.reg[t.type];
    if (!e) throw new Error(`Route type "${t.type}" is not registered`);
    const { type: s, ...h } = t;
    return e.addRule(h), this;
  }
  addRules(t) {
    for (const e of t) this.addRule(e);
    return this;
  }
  makeCtx(t, e) {
    return this.ctxFactory?.factory ? this.ctxFactory.factory(t, e) : this.ctxFactory?.class ? new this.ctxFactory.class(t, e) : new P(t, e);
  }
  // Main server request handler
  async handler(t, e) {
    const s = this.makeCtx(t, e), h = "http://" + (t.headers.host || "localhost");
    s.url = new URL(t.url || "/", h);
    try {
      for (const r of this.globalPipes)
        await r(s);
      for (const r of this.order) {
        const a = this.reg[r].match(s);
        if (a)
          return await a(s);
      }
      e.statusCode = 404, e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: "Not Found" }));
    } catch (r) {
      const i = r?.statusCode ?? 500;
      if (e.statusCode = i, r?.headers) for (const [a, o] of Object.entries(r.headers)) e.setHeader(a, String(o));
      e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: r?.expose ? r.message : "Internal Server Error" }));
    }
  }
}
class L {
  constructor(t) {
    this.opts = t, this.root = C.resolve(t.rootDir), this.base = t.urlBase.endsWith("/") ? t.urlBase.slice(0, -1) : t.urlBase;
  }
  map = /* @__PURE__ */ new Map();
  // "/static/a/b.js" => "/abs/a/b.js"
  root;
  base;
  timer;
  start() {
    this.rebuild().catch(() => {
    }), this.opts.scanIntervalMs && (this.timer = setInterval(() => this.rebuild().catch(() => {
    }), this.opts.scanIntervalMs).unref());
  }
  stop() {
    this.timer && clearInterval(this.timer);
  }
  // O(#files). Для великих дерев — інкрементал або шардінг по підкаталогах
  async rebuild() {
    const t = /* @__PURE__ */ new Map(), e = /* @__PURE__ */ new Set(), s = await w.realpath(this.root).catch(() => this.root), h = (i) => i === s || i.startsWith(s + C.sep), r = async (i, a, o = 0) => {
      if (this.opts.maxDepth && o > this.opts.maxDepth)
        return;
      let l;
      try {
        l = await w.readdir(i, { withFileTypes: !0 });
      } catch (m) {
        this.opts.logger?.warn?.(`readdir failed: ${i}`, m);
        return;
      }
      let p = await w.realpath(i).catch(() => i);
      if (h(p) && !e.has(p)) {
        e.add(p);
        for (const m of l) {
          const u = m.name;
          if (u.startsWith(".") && !(this.opts.allowWellKnown && u === ".well-known"))
            continue;
          const c = C.join(i, u), d = a ? a + "/" + u : u;
          let f;
          try {
            f = await w.lstat(c);
          } catch (g) {
            this.opts.logger?.debug?.(`lstat failed: ${c}`, g);
            continue;
          }
          if (f.isSymbolicLink()) {
            if (!this.opts.followSymlinks) continue;
            let g;
            try {
              g = await w.realpath(c);
            } catch (y) {
              this.opts.logger?.debug?.(`realpath failed: ${c}`, y);
              continue;
            }
            if (!h(g))
              continue;
            let E;
            try {
              E = await w.stat(c);
            } catch (y) {
              this.opts.logger?.debug?.(`stat failed: ${c}`, y);
              continue;
            }
            if (E.isDirectory())
              await r(c, d, o + 1);
            else if (E.isFile()) {
              const y = `${this.base}/${d.split(C.sep).join("/")}`;
              t.set(y, c);
            }
            continue;
          }
          if (f.isDirectory())
            await r(c, d, o + 1);
          else if (f.isFile()) {
            const g = `${this.base}/${d.split(C.sep).join("/")}`;
            t.set(g, c);
          }
        }
      }
    };
    await r(this.root, ""), this.opts.maxFiles && t.size > this.opts.maxFiles && this.opts.logger?.warn?.(`file index truncated: ${t.size} > ${this.opts.maxFiles}`), this.map = t;
  }
  lookup(t) {
    return this.map.get(t);
  }
  resolveUrl(t) {
    const e = t.pathname;
    if (!(e === this.base || e.startsWith(this.base + "/")))
      return;
    const s = this.lookup(e);
    if (s && s.startsWith(this.root))
      return s;
  }
}
function k(n, t) {
  return !n || n.length === 0 ? t : async (e) => {
    for (const s of n)
      await s(e);
    return t(e);
  };
}
function $(n) {
  return !n || n === "/" ? "/" : n.endsWith("/") ? n.slice(0, -1) : n;
}
const O = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
class q {
  typeName = "PATH";
  // Бінарний пошук по "METHOD␠PATH"
  keys = [];
  execs = [];
  // Для 405: індекс шлях → множина дозволених методів
  pathMethods = /* @__PURE__ */ new Map();
  addRule(t) {
    const e = $(t.path), s = (t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).map((i) => i.toUpperCase()), h = k(t.pipes, t.handler);
    for (const i of s) {
      const a = `${i} ${e}`, o = this.lowerBound(this.keys, a);
      this.keys.splice(o, 0, a), this.execs.splice(o, 0, h);
    }
    let r = this.pathMethods.get(e);
    r || (r = /* @__PURE__ */ new Set(), this.pathMethods.set(e, r));
    for (const i of s)
      r.add(i);
  }
  match(t) {
    const e = (t.req.method || "GET").toUpperCase(), s = $(t.url.pathname), h = `${e} ${s}`;
    let r = this.lowerBound(this.keys, h);
    if (r < this.keys.length && this.keys[r] === h)
      return this.execs[r];
    if (e === "HEAD") {
      const a = `GET ${s}`;
      if (r = this.lowerBound(this.keys, a), r < this.keys.length && this.keys[r] === a) {
        const o = this.execs[r];
        return async (l) => {
          const p = l.res.end;
          l.res.end = (m) => l.res, await o(l), l.res.end = p, l.res.statusCode = l.res.statusCode === 200 ? 200 : l.res.statusCode, l.res.end();
        };
      }
    }
    const i = this.pathMethods.get(s);
    if (i && i.size > 0) {
      const a = new Set(i);
      i.has("GET") && a.add("HEAD");
      const o = O.filter((p) => a.has(p)), l = o.length ? o.join(", ") : Array.from(a).join(", ");
      return () => {
        throw new b(405, "Method Not Allowed", !0, { Allow: l });
      };
    }
    return null;
  }
  lowerBound(t, e) {
    let s = 0, h = t.length;
    for (; s < h; ) {
      const r = s + h >>> 1;
      t[r] < e ? s = r + 1 : h = r;
    }
    return s;
  }
}
function j(n, t) {
  return !n || n.length === 0 ? t : async (e) => {
    for (const s of n)
      await s(e);
    return t(e);
  };
}
const A = {
  int: (n) => /^-?\d+$/.test(n),
  uuid: (n) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n),
  hex: (n) => /^[0-9a-f]+$/i.test(n),
  alpha: (n) => /^[A-Za-z]+$/.test(n)
};
function R(n) {
  if (n) {
    if (typeof n == "function")
      return n;
    if (n instanceof RegExp) {
      const t = n;
      return (e) => t.test(e);
    }
    return A[n];
  }
}
function x(n) {
  return !n || n === "/" ? "/" : n.endsWith("/") ? n.slice(0, -1) : n;
}
function H(n) {
  try {
    return decodeURIComponent(n);
  } catch {
    return null;
  }
}
function D(n, t) {
  const e = x(n);
  if (e === "/")
    return [];
  const s = e.slice(1).split("/"), h = [];
  for (let r = 0; r < s.length; r++) {
    const i = s[r];
    if (i.startsWith(":")) {
      const a = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\((.+)\))?$/.exec(i);
      if (!a)
        throw new Error(`Invalid param segment: ${i}`);
      const o = a[1];
      if (!o)
        throw new Error(`Invalid param name in segment: ${i}`);
      let l;
      a[2] ? l = R(new RegExp(`^(?:${a[2]})$`)) : t && t[o] && (l = R(t[o])), h.push({ t: "param", name: o, validate: l });
      continue;
    }
    if (i === "*" || i.startsWith("*")) {
      const a = i === "*" ? "wild" : i.slice(1);
      if (r !== s.length - 1)
        throw new Error("Wildcard must be the last segment");
      h.push({ t: "wildcard", name: a });
      continue;
    }
    h.push({ t: "static", val: i });
  }
  return h;
}
class T {
  sChildren = null;
  pChild = null;
  wChild = null;
  handlers = null;
  getOrAddStatic(t) {
    this.sChildren || (this.sChildren = /* @__PURE__ */ new Map());
    let e = this.sChildren.get(t);
    return e || (e = new T(), this.sChildren.set(t, e)), e;
  }
  setParam(t, e) {
    return this.pChild || (this.pChild = { name: t, validate: e, node: new T() }), this.pChild.node;
  }
  setWildcard(t) {
    return this.wChild || (this.wChild = { name: t, node: new T() }), this.wChild.node;
  }
  setHandler(t, e) {
    this.handlers || (this.handlers = /* @__PURE__ */ new Map());
    for (const s of t) {
      if (this.handlers.has(s))
        throw new Error(`Duplicate handler for method ${s}`);
      this.handlers.set(s, e);
    }
  }
  getHandler(t) {
    return this.handlers ? (this.handlers.get(t) || (t === "HEAD" ? this.handlers.get("GET") : void 0)) ?? null : null;
  }
}
class B {
  typeName = "PATH_PATTERN";
  root = new T();
  addRule(t) {
    const e = t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], s = D(t.pattern, t.constraints), h = j(t.pipes, t.handler);
    let r = this.root;
    for (let i = 0; i < s.length; i++) {
      const a = s[i];
      if (a.t === "static")
        r = r.getOrAddStatic(a.val);
      else if (a.t === "param")
        r = r.setParam(a.name, a.validate);
      else if (r = r.setWildcard(a.name), i !== s.length - 1)
        throw new Error("Wildcard must be the last segment");
    }
    r.setHandler(e, h);
  }
  match(t) {
    const e = x(t.url.pathname), s = t.req.method || "GET";
    if (e === "/") {
      let o = this.root.getHandler(s);
      return o || (this.root.wChild && (o = this.root.wChild.node.getHandler(s), o) ? (l) => (l.params = { [this.root.wChild.name]: "" }, o(l)) : null);
    }
    const h = e.slice(1).split("/");
    let r = null;
    const i = (o, l) => {
      if (l === h.length)
        return o.getHandler(s);
      const p = h[l];
      if (p === void 0)
        return null;
      const m = H(p);
      if (m === null)
        return null;
      if (o.sChildren) {
        const u = o.sChildren.get(m);
        if (u) {
          const c = i(u, l + 1);
          if (c)
            return c;
        }
      }
      if (o.pChild) {
        const { name: u, validate: c, node: d } = o.pChild;
        if (!c || c(m)) {
          r || (r = /* @__PURE__ */ Object.create(null)), r[u] = m;
          const f = i(d, l + 1);
          if (f)
            return f;
          delete r[u];
        }
      }
      if (o.wChild) {
        let u = "";
        for (let d = l; d < h.length; d++) {
          const f = H(h[d]);
          if (f === null)
            return null;
          u += (d === l ? "" : "/") + f;
        }
        r || (r = /* @__PURE__ */ Object.create(null)), r[o.wChild.name] = u;
        const c = o.wChild.node.getHandler(s);
        if (c)
          return c;
        delete r[o.wChild.name];
      }
      return null;
    }, a = i(this.root, 0);
    return a ? (o) => (r && (o.params = r), a(o)) : null;
  }
}
const M = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};
function N(n) {
  if (!n)
    return {};
  const t = {};
  for (const [e, s] of Object.entries(n)) {
    const h = e.startsWith(".") ? e.toLowerCase() : "." + e.toLowerCase();
    t[h] = s;
  }
  return t;
}
function W(n, t) {
  return t && (/^text\//.test(n) || /^application\/json\b/.test(n)) && !/;\s*charset=/i.test(n) ? `${n}; charset=${t}` : n;
}
class G {
  constructor(t) {
    this.cfg = t, this.resolveCT = t.resolveContentType, this.ct = { ...M, ...N(t.contentTypes) }, this.defaultCT = t.defaultContentType ?? "application/octet-stream", this.defaultTextCharset = t.defaultTextCharset ?? "utf-8";
  }
  typeName = "STATIC";
  ct;
  resolveCT;
  defaultCT;
  defaultTextCharset;
  addRule(t) {
  }
  match(t) {
    if (t.req.method !== "GET" && t.req.method !== "HEAD")
      return null;
    const e = this.cfg.index.resolveUrl(t.url);
    return e ? async (s) => {
      const h = await w.stat(e), r = h.size, i = s.req.method === "HEAD", a = S(e).toLowerCase(), o = this.resolveCT?.(a, e, h, s) ?? this.ct[a] ?? this.defaultCT;
      s.header("X-Content-Type-Options", "nosniff"), s.header("Accept-Ranges", "bytes"), s.header("Last-Modified", h.mtime.toUTCString()), s.header("Content-Type", W(o, this.defaultTextCharset));
      const l = `W/"${r}-${Math.trunc(h.mtimeMs)}"`;
      if (s.header("ETag", l), s.req.headers["if-none-match"] === l) {
        s.status(304), s.res.end();
        return;
      }
      const p = s.req.headers.range;
      if (p && p.startsWith("bytes=")) {
        let [u, c] = p.slice(6).split("-"), d = u ? parseInt(u, 10) : 0, f = c ? parseInt(c, 10) : r - 1;
        if (Number.isNaN(d) && (d = 0), Number.isNaN(f) && (f = r - 1), d > f || d >= r) {
          s.status(416).header("Content-Range", `bytes */${r}`), s.res.end();
          return;
        }
        if (s.status(206).header("Content-Range", `bytes ${d}-${f}/${r}`), s.header("Content-Length", String(f - d + 1)), i) {
          s.res.end();
          return;
        }
        const g = v(e, { start: d, end: f });
        g.on("error", () => s.res.destroy()), g.pipe(s.res);
        return;
      }
      if (s.status(200).header("Content-Length", String(r)), i) {
        s.res.end();
        return;
      }
      const m = v(e);
      m.on("error", () => s.res.destroy()), m.pipe(s.res);
    } : null;
  }
}
export {
  b as HttpException,
  q as PathRouteType,
  B as PatternRouteType,
  P as RequestContext,
  F as Router,
  L as StaticIndex,
  G as StaticRouteType
};
//# sourceMappingURL=index.js.map
