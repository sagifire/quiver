import { promises as w, createReadStream as v } from "node:fs";
import C, { extname as S } from "node:path";
class x extends Error {
  constructor(t, e = "Http Error", s = t < 500, a = {}) {
    super(e), this.statusCode = t, this.expose = s, this.headers = a;
  }
}
class H {
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
      const a = [];
      let r = 0, i = !1;
      const o = (h) => {
        i || (i = !0, this.req.destroy(), s(h));
      }, l = () => {
        i || (i = !0, e(Buffer.concat(a)));
      };
      this.req.once("error", o), this.req.once("aborted", () => o(new x(499, "Client Closed Request", !0))), this.req.on("data", (h) => {
        if (r += h.length, r > t) return o(new x(413, "Content Too Large", !0));
        a.push(h);
      }), this.req.once("end", l);
    });
  }
  async bodyJson(t) {
    const e = await this.bodyRaw(t);
    try {
      return JSON.parse(e.toString("utf8"));
    } catch {
      throw new x(400, "Invalid JSON", !0);
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
    const { type: s, ...a } = t;
    return e.addRule(a), this;
  }
  addRules(t) {
    for (const e of t) this.addRule(e);
    return this;
  }
  makeCtx(t, e) {
    return this.ctxFactory?.factory ? this.ctxFactory.factory(t, e) : this.ctxFactory?.class ? new this.ctxFactory.class(t, e) : new H(t, e);
  }
  // Main server request handler
  async handler(t, e) {
    const s = this.makeCtx(t, e), a = "http://" + (t.headers.host || "localhost");
    s.url = new URL(t.url || "/", a);
    try {
      for (const r of this.globalPipes)
        await r(s);
      for (const r of this.order) {
        const o = this.reg[r].match(s);
        if (o)
          return await o(s);
      }
      e.statusCode = 404, e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: "Not Found" }));
    } catch (r) {
      const i = r?.statusCode ?? 500;
      if (e.statusCode = i, r?.headers) for (const [o, l] of Object.entries(r.headers)) e.setHeader(o, String(l));
      e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: r?.expose ? r.message : "Internal Server Error" }));
    }
  }
}
class M {
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
    const t = /* @__PURE__ */ new Map(), e = /* @__PURE__ */ new Set(), s = await w.realpath(this.root).catch(() => this.root), a = (i) => i === s || i.startsWith(s + C.sep), r = async (i, o, l = 0) => {
      if (this.opts.maxDepth && l > this.opts.maxDepth)
        return;
      let h;
      try {
        h = await w.readdir(i, { withFileTypes: !0 });
      } catch (p) {
        this.opts.logger?.warn?.(`readdir failed: ${i}`, p);
        return;
      }
      let m = await w.realpath(i).catch(() => i);
      if (a(m) && !e.has(m)) {
        e.add(m);
        for (const p of h) {
          const d = p.name;
          if (d.startsWith(".") && !(this.opts.allowWellKnown && d === ".well-known"))
            continue;
          const c = C.join(i, d), u = o ? o + "/" + d : d;
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
            if (!a(g))
              continue;
            let b;
            try {
              b = await w.stat(c);
            } catch (y) {
              this.opts.logger?.debug?.(`stat failed: ${c}`, y);
              continue;
            }
            if (b.isDirectory())
              await r(c, u, l + 1);
            else if (b.isFile()) {
              const y = `${this.base}/${u.split(C.sep).join("/")}`;
              t.set(y, c);
            }
            continue;
          }
          if (f.isDirectory())
            await r(c, u, l + 1);
          else if (f.isFile()) {
            const g = `${this.base}/${u.split(C.sep).join("/")}`;
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
function P(n, t) {
  return !n || n.length === 0 ? t : async (e) => {
    for (const s of n)
      await s(e);
    return t(e);
  };
}
class q {
  typeName = "PATH";
  keys = [];
  // "GET /health"   (upper method)
  execs = [];
  addRule(t) {
    const e = t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], s = P(t.pipes, t.handler);
    for (const a of e) {
      const r = `${a} ${t.path}`;
      let i = this.lowerBound(this.keys, r);
      this.keys.splice(i, 0, r), this.execs.splice(i, 0, s);
    }
  }
  match(t) {
    const s = `${(t.req.method || "GET").toUpperCase()} ${t.url.pathname.replace(/\/$/, "") || "/"}`, a = this.lowerBound(this.keys, s);
    return a < this.keys.length && this.keys[a] === s ? this.execs[a] : null;
  }
  lowerBound(t, e) {
    let s = 0, a = t.length;
    for (; s < a; ) {
      const r = s + a >>> 1;
      t[r] < e ? s = r + 1 : a = r;
    }
    return s;
  }
}
const k = {
  int: (n) => /^-?\d+$/.test(n),
  uuid: (n) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n),
  hex: (n) => /^[0-9a-f]+$/i.test(n),
  alpha: (n) => /^[A-Za-z]+$/.test(n)
};
function $(n) {
  if (n) {
    if (typeof n == "function")
      return n;
    if (n instanceof RegExp) {
      const t = n;
      return (e) => t.test(e);
    }
    return k[n];
  }
}
function R(n) {
  return !n || n === "/" ? "/" : n.endsWith("/") ? n.slice(0, -1) : n;
}
function E(n) {
  try {
    return decodeURIComponent(n);
  } catch {
    return null;
  }
}
function j(n, t) {
  const e = R(n);
  if (e === "/")
    return [];
  const s = e.slice(1).split("/"), a = [];
  for (let r = 0; r < s.length; r++) {
    const i = s[r];
    if (i.startsWith(":")) {
      const o = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\((.+)\))?$/.exec(i);
      if (!o)
        throw new Error(`Invalid param segment: ${i}`);
      const l = o[1];
      if (!l)
        throw new Error(`Invalid param name in segment: ${i}`);
      let h;
      o[2] ? h = $(new RegExp(`^(?:${o[2]})$`)) : t && t[l] && (h = $(t[l])), a.push({ t: "param", name: l, validate: h });
      continue;
    }
    if (i === "*" || i.startsWith("*")) {
      const o = i === "*" ? "wild" : i.slice(1);
      if (r !== s.length - 1)
        throw new Error("Wildcard must be the last segment");
      a.push({ t: "wildcard", name: o });
      continue;
    }
    a.push({ t: "static", val: i });
  }
  return a;
}
function O(n, t) {
  return !n || n.length === 0 ? t : async (e) => {
    for (const s of n)
      await s(e);
    return t(e);
  };
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
    if (this.wChild)
      throw new Error("Cannot add param at same level after wildcard");
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
class z {
  typeName = "PATH_PATTERN";
  root = new T();
  addRule(t) {
    const e = t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], s = j(t.pattern, t.constraints), a = O(t.pipes, t.handler);
    let r = this.root;
    for (let i = 0; i < s.length; i++) {
      const o = s[i];
      if (o.t === "static")
        r = r.getOrAddStatic(o.val);
      else if (o.t === "param")
        r = r.setParam(o.name, o.validate);
      else if (r = r.setWildcard(o.name), i !== s.length - 1)
        throw new Error("Wildcard must be the last segment");
    }
    r.setHandler(e, a);
  }
  match(t) {
    const e = R(t.url.pathname), s = t.req.method || "GET";
    if (e === "/") {
      const l = this.root.getHandler(s);
      return l ? (h) => l(h) : null;
    }
    const a = e.slice(1).split("/");
    let r = null;
    const i = (l, h) => {
      if (h === a.length)
        return l.getHandler(s);
      const m = a[h];
      if (m === void 0)
        return null;
      const p = E(m);
      if (p === null)
        return null;
      if (l.sChildren) {
        const d = l.sChildren.get(p);
        if (d) {
          const c = i(d, h + 1);
          if (c)
            return c;
        }
      }
      if (l.pChild) {
        const { name: d, validate: c, node: u } = l.pChild;
        if (!c || c(p)) {
          r || (r = /* @__PURE__ */ Object.create(null)), r[d] = p;
          const f = i(u, h + 1);
          if (f)
            return f;
          delete r[d];
        }
      }
      if (l.wChild) {
        let d = "";
        for (let u = h; u < a.length; u++) {
          const f = E(a[u]);
          if (f === null)
            return null;
          d += (u === h ? "" : "/") + f;
        }
        r || (r = /* @__PURE__ */ Object.create(null)), r[l.wChild.name] = d;
        const c = l.wChild.node.getHandler(s);
        if (c)
          return c;
        delete r[l.wChild.name];
      }
      return null;
    }, o = i(this.root, 0);
    return o ? (l) => (r && (l.params = r), o(l)) : null;
  }
}
const N = {
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
function A(n) {
  if (!n)
    return {};
  const t = {};
  for (const [e, s] of Object.entries(n)) {
    const a = e.startsWith(".") ? e.toLowerCase() : "." + e.toLowerCase();
    t[a] = s;
  }
  return t;
}
function W(n, t) {
  return t && (/^text\//.test(n) || /^application\/json\b/.test(n)) && !/;\s*charset=/i.test(n) ? `${n}; charset=${t}` : n;
}
class L {
  constructor(t) {
    this.cfg = t, this.resolveCT = t.resolveContentType, this.ct = { ...N, ...A(t.contentTypes) }, this.defaultCT = t.defaultContentType ?? "application/octet-stream", this.defaultTextCharset = t.defaultTextCharset ?? "utf-8";
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
      const a = await w.stat(e), r = a.size, i = s.req.method === "HEAD", o = S(e).toLowerCase(), l = this.resolveCT?.(o, e, a, s) ?? this.ct[o] ?? this.defaultCT;
      s.header("X-Content-Type-Options", "nosniff"), s.header("Accept-Ranges", "bytes"), s.header("Last-Modified", a.mtime.toUTCString()), s.header("Content-Type", W(l, this.defaultTextCharset));
      const h = `W/"${r}-${Math.trunc(a.mtimeMs)}"`;
      if (s.header("ETag", h), s.req.headers["if-none-match"] === h) {
        s.status(304), s.res.end();
        return;
      }
      const m = s.req.headers.range;
      if (m && m.startsWith("bytes=")) {
        let [d, c] = m.slice(6).split("-"), u = d ? parseInt(d, 10) : 0, f = c ? parseInt(c, 10) : r - 1;
        if (Number.isNaN(u) && (u = 0), Number.isNaN(f) && (f = r - 1), u > f || u >= r) {
          s.status(416).header("Content-Range", `bytes */${r}`), s.res.end();
          return;
        }
        if (s.status(206).header("Content-Range", `bytes ${u}-${f}/${r}`), s.header("Content-Length", String(f - u + 1)), i) {
          s.res.end();
          return;
        }
        const g = v(e, { start: u, end: f });
        g.on("error", () => s.res.destroy()), g.pipe(s.res);
        return;
      }
      if (s.status(200).header("Content-Length", String(r)), i) {
        s.res.end();
        return;
      }
      const p = v(e);
      p.on("error", () => s.res.destroy()), p.pipe(s.res);
    } : null;
  }
}
export {
  x as HttpException,
  q as PathRouteType,
  z as PatternRouteType,
  H as RequestContext,
  F as Router,
  M as StaticIndex,
  L as StaticRouteType
};
//# sourceMappingURL=index.js.map
