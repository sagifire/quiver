import { promises as C, createReadStream as P } from "node:fs";
import S, { extname as j } from "node:path";
class R extends Error {
  constructor(t, e = "Http Error", n = t < 500, l = {}) {
    super(e), this.statusCode = t, this.expose = n, this.headers = l;
  }
}
class M {
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
    return new Promise((e, n) => {
      const l = [];
      let s = 0, r = !1;
      const a = (h) => {
        r || (r = !0, this.req.destroy(), n(h));
      }, o = () => {
        r || (r = !0, e(Buffer.concat(l)));
      };
      this.req.once("error", a), this.req.once("aborted", () => a(new R(499, "Client Closed Request", !0))), this.req.on("data", (h) => {
        if (s += h.length, s > t) return a(new R(413, "Content Too Large", !0));
        l.push(h);
      }), this.req.once("end", o);
    });
  }
  async bodyJson(t) {
    const e = await this.bodyRaw(t);
    try {
      return JSON.parse(e.toString("utf8"));
    } catch {
      throw new R(400, "Invalid JSON", !0);
    }
  }
}
class V {
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
    const e = t.type, n = this.reg[e];
    if (!n)
      throw new Error(`Route type "${String(e)}" is not registered`);
    const { type: l, ...s } = t;
    return n.addRule(s), this;
  }
  addRules(t) {
    for (const e of t)
      this.addRule(e);
    return this;
  }
  makeCtx(t, e) {
    return this.ctxFactory?.factory ? this.ctxFactory.factory(t, e) : this.ctxFactory?.class ? new this.ctxFactory.class(t, e) : new M(t, e);
  }
  async handler(t, e) {
    const n = this.makeCtx(t, e), l = "http://" + (t.headers.host || "localhost");
    n.url = new URL(t.url || "/", l);
    try {
      for (const s of this.globalPipes)
        await s(n);
      for (const s of this.order) {
        const a = this.reg[s].match(n);
        if (a)
          return await a(n);
      }
      e.statusCode = 404, e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: "Not Found" }));
    } catch (s) {
      const r = s?.statusCode ?? 500;
      if (e.statusCode = r, s?.headers)
        for (const [a, o] of Object.entries(s.headers))
          e.setHeader(a, String(o));
      e.setHeader("Content-Type", "application/json; charset=utf-8"), e.end(JSON.stringify({ error: s?.expose ? s.message : "Internal Server Error" }));
    }
  }
}
class Z {
  constructor(t) {
    this.opts = t, this.root = S.resolve(t.rootDir), this.base = t.urlBase === "/" ? "/" : t.urlBase.endsWith("/") ? t.urlBase.slice(0, -1) : t.urlBase, this.indexFiles = new Set(t.indexFiles ? t.indexFiles : ["index.html", "index.htm"]);
  }
  map = /* @__PURE__ */ new Map();
  // "/static/a/b.js" => "/abs/a/b.js"
  root;
  base;
  timer;
  indexFiles;
  async start() {
    await this.rebuild().catch(() => {
    }), this.opts.scanIntervalMs && (this.timer = setInterval(() => this.rebuild().catch(() => {
    }), this.opts.scanIntervalMs), this.timer.unref?.());
  }
  stop() {
    this.timer && clearInterval(this.timer);
  }
  // O(#files). Для великих дерев — інкрементал або шардінг по підкаталогах
  async rebuild() {
    const t = /* @__PURE__ */ new Map(), e = /* @__PURE__ */ new Set(), n = await C.realpath(this.root).catch(() => this.root), l = (a) => a === n || a.startsWith(n + S.sep), s = this.base === "/" ? "" : this.base, r = async (a, o, h = 0) => {
      if (this.opts.maxDepth && h > this.opts.maxDepth)
        return;
      let m;
      try {
        m = await C.readdir(a, { withFileTypes: !0 });
      } catch (f) {
        this.opts.logger?.warn?.(`readdir failed: ${a}`, f);
        return;
      }
      let p = await C.realpath(a).catch(() => a);
      if (l(p) && !e.has(p)) {
        e.add(p);
        for (const f of m) {
          const d = f.name;
          if (d.startsWith(".") && !(this.opts.allowWellKnown && d === ".well-known"))
            continue;
          const c = S.join(a, d), u = o ? o + "/" + d : d;
          let b;
          try {
            b = await C.lstat(c);
          } catch (w) {
            this.opts.logger?.debug?.(`lstat failed: ${c}`, w);
            continue;
          }
          if (b.isSymbolicLink()) {
            if (!this.opts.followSymlinks) continue;
            let w;
            try {
              w = await C.realpath(c);
            } catch (g) {
              this.opts.logger?.debug?.(`realpath failed: ${c}`, g);
              continue;
            }
            if (!l(w))
              continue;
            let y;
            try {
              y = await C.stat(c);
            } catch (g) {
              this.opts.logger?.debug?.(`stat failed: ${c}`, g);
              continue;
            }
            if (y.isDirectory())
              await r(c, u, h + 1);
            else if (y.isFile()) {
              const g = `${s}/${u.split(S.sep).join("/")}`;
              t.set(g, c);
            }
            continue;
          }
          if (b.isDirectory())
            await r(c, u, h + 1);
          else if (b.isFile()) {
            const w = `${s}/${u.split(S.sep).join("/")}`;
            t.set(w, c);
          }
          for (const w of this.indexFiles) {
            const y = s + o + "/" + w;
            if (t.has(y)) {
              t.set(s + o, t.get(y));
              break;
            }
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
    let e = t.pathname;
    if (e.endsWith("/") && (e = e.slice(0, -1)), !e || !e.startsWith("/") || e.split("/").includes(".."))
      return;
    if (this.base !== "/") {
      if (!(e === this.base || e.startsWith(this.base + "/")))
        return;
    }
    const n = this.lookup(e);
    if (n && n.startsWith(this.root))
      return n;
  }
}
function N(i, t) {
  return !i || i.length === 0 ? t : async (e) => {
    for (const n of i)
      await n(e);
    return t(e);
  };
}
function k(i) {
  return !i || i === "/" ? "/" : i.endsWith("/") ? i.slice(0, -1) : i;
}
const D = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
class _ {
  typeName = "PATH";
  // Бінарний пошук по "METHOD␠PATH"
  keys = [];
  execs = [];
  // Для 405: індекс шлях → множина дозволених методів
  pathMethods = /* @__PURE__ */ new Map();
  addRule(t) {
    const e = k(t.path), n = (t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).map((r) => r.toUpperCase()), l = N(t.pipes, t.handler);
    for (const r of n) {
      const a = `${r} ${e}`, o = this.lowerBound(this.keys, a);
      this.keys.splice(o, 0, a), this.execs.splice(o, 0, l);
    }
    let s = this.pathMethods.get(e);
    s || (s = /* @__PURE__ */ new Set(), this.pathMethods.set(e, s));
    for (const r of n)
      s.add(r);
  }
  match(t) {
    const e = (t.req.method || "GET").toUpperCase(), n = k(t.url.pathname), l = `${e} ${n}`;
    let s = this.lowerBound(this.keys, l);
    if (s < this.keys.length && this.keys[s] === l)
      return this.execs[s];
    if (e === "HEAD") {
      const a = `GET ${n}`;
      if (s = this.lowerBound(this.keys, a), s < this.keys.length && this.keys[s] === a) {
        const o = this.execs[s];
        return async (h) => {
          const m = h.res.end;
          h.res.end = (p) => h.res, await o(h), h.res.end = m, h.res.statusCode = h.res.statusCode === 200 ? 200 : h.res.statusCode, h.res.end();
        };
      }
    }
    const r = this.pathMethods.get(n);
    if (r && r.size > 0) {
      const a = new Set(r);
      r.has("GET") && a.add("HEAD");
      const o = D.filter((m) => a.has(m)), h = o.length ? o.join(", ") : Array.from(a).join(", ");
      return () => {
        throw new R(405, "Method Not Allowed", !0, { Allow: h });
      };
    }
    return null;
  }
  lowerBound(t, e) {
    let n = 0, l = t.length;
    for (; n < l; ) {
      const s = n + l >>> 1;
      t[s] < e ? n = s + 1 : l = s;
    }
    return n;
  }
}
const z = {
  int: (i) => /^-?\d+$/.test(i),
  uuid: (i) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(i),
  hex: (i) => /^[0-9a-f]+$/i.test(i),
  alpha: (i) => /^[A-Za-z]+$/.test(i)
};
function F(i) {
  if (i) {
    if (typeof i == "function")
      return i;
    if (i instanceof RegExp) {
      const t = i;
      return (e) => t.test(e);
    }
    return z[i];
  }
}
function O(i) {
  return !i || i === "/" ? "/" : i.endsWith("/") ? i.slice(0, -1) : i;
}
function A(i) {
  try {
    return decodeURIComponent(i);
  } catch {
    return null;
  }
}
function W(i, t) {
  const e = O(i);
  if (e === "/")
    return [];
  const n = e.slice(1).split("/"), l = [];
  for (let s = 0; s < n.length; s++) {
    const r = n[s];
    if (r.startsWith(":")) {
      const a = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\((.+)\))?$/.exec(r);
      if (!a)
        throw new Error(`Invalid param segment: ${r}`);
      const o = a[1];
      if (!o)
        throw new Error(`Invalid param name in segment: ${r}`);
      let h;
      a[2] ? h = F(new RegExp(`^(?:${a[2]})$`)) : t && t[o] && (h = F(t[o])), l.push({ t: "param", name: o, validate: h });
      continue;
    }
    if (r === "*" || r.startsWith("*")) {
      const a = r === "*" ? "wild" : r.slice(1);
      if (s !== n.length - 1)
        throw new Error("Wildcard must be the last segment");
      l.push({ t: "wildcard", name: a });
      continue;
    }
    l.push({ t: "static", val: r });
  }
  return l;
}
class x {
  sChildren = null;
  pChild = null;
  wChild = null;
  handlers = null;
  getOrAddStatic(t) {
    this.sChildren || (this.sChildren = /* @__PURE__ */ new Map());
    let e = this.sChildren.get(t);
    return e || (e = new x(), this.sChildren.set(t, e)), e;
  }
  setParam(t, e) {
    return this.pChild || (this.pChild = { name: t, validate: e, node: new x() }), this.pChild.node;
  }
  setWildcard(t) {
    return this.wChild || (this.wChild = { name: t, node: new x() }), this.wChild.node;
  }
  setHandler(t, e) {
    this.handlers || (this.handlers = /* @__PURE__ */ new Map());
    for (const n of t) {
      if (this.handlers.has(n))
        throw new Error(`Duplicate handler for method ${n}`);
      this.handlers.set(n, e);
    }
  }
  getHandler(t) {
    return this.handlers ? (this.handlers.get(t) || (t === "HEAD" ? this.handlers.get("GET") : void 0)) ?? null : null;
  }
}
class K {
  typeName = "PATTERN";
  root = new x();
  addRule(t) {
    const e = t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], n = W(t.pattern, t.constraints), l = N(t.pipes, t.handler);
    let s = this.root;
    for (let r = 0; r < n.length; r++) {
      const a = n[r];
      if (a.t === "static")
        s = s.getOrAddStatic(a.val);
      else if (a.t === "param")
        s = s.setParam(a.name, a.validate);
      else if (s = s.setWildcard(a.name), r !== n.length - 1)
        throw new Error("Wildcard must be the last segment");
    }
    s.setHandler(e, l);
  }
  match(t) {
    const e = O(t.url.pathname), n = t.req.method || "GET";
    if (e === "/") {
      let o = this.root.getHandler(n);
      return o || (this.root.wChild && (o = this.root.wChild.node.getHandler(n), o) ? (h) => (h.params = { [this.root.wChild.name]: "" }, o(h)) : null);
    }
    const l = e.slice(1).split("/");
    let s = null;
    const r = (o, h) => {
      if (h === l.length)
        return o.getHandler(n);
      const m = l[h];
      if (m === void 0)
        return null;
      const p = A(m);
      if (p === null)
        return null;
      if (o.sChildren) {
        const f = o.sChildren.get(p);
        if (f) {
          const d = r(f, h + 1);
          if (d)
            return d;
        }
      }
      if (o.pChild) {
        const { name: f, validate: d, node: c } = o.pChild;
        if (!d || d(p)) {
          s || (s = /* @__PURE__ */ Object.create(null)), s[f] = p;
          const u = r(c, h + 1);
          if (u)
            return u;
          delete s[f];
        }
      }
      if (o.wChild) {
        let f = "";
        for (let c = h; c < l.length; c++) {
          const u = A(l[c]);
          if (u === null)
            return null;
          f += (c === h ? "" : "/") + u;
        }
        s || (s = /* @__PURE__ */ Object.create(null)), s[o.wChild.name] = f;
        const d = o.wChild.node.getHandler(n);
        if (d)
          return d;
        delete s[o.wChild.name];
      }
      return null;
    }, a = r(this.root, 0);
    return a ? (o) => (s && (o.params = s), a(o)) : null;
  }
}
const q = {
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
function I(i) {
  if (!i)
    return {};
  const t = {};
  for (const [e, n] of Object.entries(i)) {
    const l = e.startsWith(".") ? e.toLowerCase() : "." + e.toLowerCase();
    t[l] = n;
  }
  return t;
}
function L(i, t) {
  return t && (/^text\//.test(i) || /^application\/json\b/.test(i)) && !/;\s*charset=/i.test(i) ? `${i}; charset=${t}` : i;
}
function U(i) {
  const t = /* @__PURE__ */ new Map();
  if (!i)
    return t;
  const e = i.split(",");
  for (const n of e) {
    const l = n.trim();
    if (!l)
      continue;
    const s = l.split(";"), r = s[0]?.trim()?.toLowerCase();
    if (!r)
      continue;
    let a = 1;
    for (let o = 1; o < s.length; o++) {
      const [h, m] = s[o].split("=").map((p) => p.trim());
      if (h && h.toLowerCase() === "q") {
        const p = Number(m);
        Number.isNaN(p) || (a = p);
      }
    }
    t.set(r, a);
  }
  return t;
}
async function B(i, t, e) {
  for (const n of t) {
    const l = e.get(n);
    if (l === 0 || l === void 0 && e.size > 0)
      continue;
    const s = `${i}.${n === "br" ? "br" : "gz"}`;
    try {
      if ((await C.stat(s)).isFile())
        return { path: s, encoding: n };
    } catch {
    }
  }
  return null;
}
class X {
  constructor(t) {
    this.cfg = t, this.resolveCT = t.resolveContentType, this.ct = { ...q, ...I(t.contentTypes) }, this.defaultCT = t.defaultContentType ?? "application/octet-stream", this.defaultTextCharset = t.defaultTextCharset ?? "utf-8";
    const e = t.precompressed ?? {};
    this.pre = {
      enabled: e.enabled ?? !1,
      prefer: e.prefer ?? ["br", "gzip"],
      useSiblingFiles: e.useSiblingFiles ?? !0,
      resolver: e.resolver,
      // опційний
      allowRangesForCompressed: e.allowRangesForCompressed ?? !1,
      alwaysSetVary: e.alwaysSetVary ?? !0
    };
  }
  typeName = "STATIC";
  ct;
  resolveCT;
  defaultCT;
  defaultTextCharset;
  pre;
  addRule(t) {
  }
  match(t) {
    if (t.req.method !== "GET" && t.req.method !== "HEAD")
      return null;
    const n = String(t.req.url ?? "").split("?")[0].split("#")[0];
    let l = n;
    try {
      l = decodeURIComponent(n);
    } catch {
    }
    if (l.split("/").includes(".."))
      return null;
    const s = this.cfg.index.resolveUrl(t.url);
    return s ? async (r) => {
      const a = await C.stat(s), o = a.size, h = r.req.method === "HEAD", m = j(s).toLowerCase(), p = this.resolveCT?.(m, s, a, r) ?? this.ct[m] ?? this.defaultCT;
      r.header("X-Content-Type-Options", "nosniff"), r.header("Last-Modified", a.mtime.toUTCString()), r.header("Content-Type", L(p, this.defaultTextCharset));
      let f = s, d = a, c = null;
      if (this.pre.enabled) {
        const g = U(r.req.headers["accept-encoding"]);
        this.pre.alwaysSetVary && r.header("Vary", "Accept-Encoding");
        let T = null;
        this.pre.resolver ? T = await this.pre.resolver(s, r.req.headers["accept-encoding"]) : this.pre.useSiblingFiles && g.size > 0 && (T = await B(s, this.pre.prefer, g)), T && (f = T.path, c = T.encoding, d = await C.stat(f), r.header("Content-Encoding", c));
      }
      const u = d.size, b = c ? `W/"${u}-${Math.trunc(d.mtimeMs)}-${c}"` : `W/"${o}-${Math.trunc(a.mtimeMs)}"`;
      r.header("ETag", b);
      const w = r.req.headers["if-none-match"];
      if (w && w === b) {
        r.status(304), r.res.end();
        return;
      }
      if (!c || this.pre.allowRangesForCompressed) {
        r.header("Accept-Ranges", "bytes");
        const g = r.req.headers.range;
        if (g && g.startsWith("bytes=")) {
          let [T, $] = g.slice(6).split("-"), E = T ? parseInt(T, 10) : 0, v = $ ? parseInt($, 10) : u - 1;
          if (Number.isNaN(E) && (E = 0), Number.isNaN(v) && (v = u - 1), E > v || E >= u) {
            r.status(416).header("Content-Range", `bytes */${u}`), r.res.end();
            return;
          }
          if (r.status(206).header("Content-Range", `bytes ${E}-${v}/${u}`), r.header("Content-Length", String(v - E + 1)), h) {
            r.res.end();
            return;
          }
          const H = P(f, { start: E, end: v });
          H.on("error", () => r.res.destroy()), H.pipe(r.res);
          return;
        }
      } else
        r.header("Accept-Ranges", "none");
      if (r.status(200).header("Content-Length", String(u)), h) {
        r.res.end();
        return;
      }
      const y = P(f);
      y.on("error", () => r.res.destroy()), y.pipe(r.res);
    } : null;
  }
}
export {
  R as HttpException,
  _ as PathRouteType,
  K as PatternRouteType,
  M as RequestContext,
  V as Router,
  Z as StaticIndex,
  X as StaticRouteType
};
//# sourceMappingURL=index.js.map
