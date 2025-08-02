import { promises as b, createReadStream as g } from "node:fs";
import w, { extname as T } from "node:path";
class p extends Error {
  constructor(t, s = "Http Error", e = t < 500, n = {}) {
    super(s), this.statusCode = t, this.expose = e, this.headers = n;
  }
}
class x {
  constructor(t, s) {
    this.req = t, this.res = s;
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
  header(t, s) {
    return this.res.setHeader(t, s), this;
  }
  json(t) {
    this.res.hasHeader("Content-Type") || this.res.setHeader("Content-Type", "application/json; charset=utf-8"), this.res.end(JSON.stringify(t));
  }
  text(t) {
    this.res.hasHeader("Content-Type") || this.res.setHeader("Content-Type", "text/plain; charset=utf-8"), this.res.end(t);
  }
  // Request body with limit and abort-safe
  async bodyRaw(t = this.limits.bodySize) {
    return new Promise((s, e) => {
      const n = [];
      let r = 0, o = !1;
      const a = (i) => {
        o || (o = !0, this.req.destroy(), e(i));
      }, c = () => {
        o || (o = !0, s(Buffer.concat(n)));
      };
      this.req.once("error", a), this.req.once("aborted", () => a(new p(499, "Client Closed Request", !0))), this.req.on("data", (i) => {
        if (r += i.length, r > t) return a(new p(413, "Content Too Large", !0));
        n.push(i);
      }), this.req.once("end", c);
    });
  }
  async bodyJson(t) {
    const s = await this.bodyRaw(t);
    try {
      return JSON.parse(s.toString("utf8"));
    } catch {
      throw new p(400, "Invalid JSON", !0);
    }
  }
}
class N {
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
    const s = this.reg[t.type];
    if (!s) throw new Error(`Route type "${t.type}" is not registered`);
    const { type: e, ...n } = t;
    return s.addRule(n), this;
  }
  addRules(t) {
    for (const s of t) this.addRule(s);
    return this;
  }
  makeCtx(t, s) {
    return this.ctxFactory?.factory ? this.ctxFactory.factory(t, s) : this.ctxFactory?.class ? new this.ctxFactory.class(t, s) : new x(t, s);
  }
  // Main server request handler
  async handler(t, s) {
    const e = this.makeCtx(t, s), n = "http://" + (t.headers.host || "localhost");
    e.url = new URL(t.url || "/", n);
    try {
      for (const r of this.globalPipes)
        await r(e);
      for (const r of this.order) {
        const a = this.reg[r].match(e);
        if (a)
          return await a(e);
      }
      s.statusCode = 404, s.setHeader("Content-Type", "application/json; charset=utf-8"), s.end(JSON.stringify({ error: "Not Found" }));
    } catch (r) {
      const o = r?.statusCode ?? 500;
      if (s.statusCode = o, r?.headers) for (const [a, c] of Object.entries(r.headers)) s.setHeader(a, String(c));
      s.setHeader("Content-Type", "application/json; charset=utf-8"), s.end(JSON.stringify({ error: r?.expose ? r.message : "Internal Server Error" }));
    }
  }
}
class j {
  constructor(t) {
    this.opts = t, this.root = w.resolve(t.rootDir), this.base = t.urlBase.endsWith("/") ? t.urlBase.slice(0, -1) : t.urlBase;
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
    const t = /* @__PURE__ */ new Map(), s = async (e, n) => {
      const r = await b.readdir(e, { withFileTypes: !0 });
      for (const o of r) {
        const a = o.name;
        if (a.startsWith("."))
          continue;
        const c = w.join(e, a), i = n ? n + "/" + a : a;
        if (o.isDirectory())
          await s(c, i);
        else if (o.isFile()) {
          const d = this.base + "/" + i.replace(/\\/g, "/");
          t.set(d, c);
        }
      }
    };
    await s(this.root, ""), this.map = t;
  }
  lookup(t) {
    return this.map.get(t);
  }
  resolveUrl(t) {
    const s = t.pathname;
    if (!(s === this.base || s.startsWith(this.base + "/")))
      return;
    const e = this.lookup(s);
    if (e && e.startsWith(this.root))
      return e;
  }
}
function C(h, t) {
  return !h || h.length === 0 ? t : async (s) => {
    for (const e of h)
      await e(s);
    return t(s);
  };
}
class k {
  typeName = "PATH";
  keys = [];
  // "GET /health"   (upper method)
  execs = [];
  addRule(t) {
    const s = t.methods?.length ? t.methods : ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], e = C(t.pipes, t.handler);
    for (const n of s) {
      const r = `${n} ${t.path}`;
      let o = this.lowerBound(this.keys, r);
      this.keys.splice(o, 0, r), this.execs.splice(o, 0, e);
    }
  }
  match(t) {
    const e = `${(t.req.method || "GET").toUpperCase()} ${t.url.pathname.replace(/\/$/, "") || "/"}`, n = this.lowerBound(this.keys, e);
    return n < this.keys.length && this.keys[n] === e ? this.execs[n] : null;
  }
  lowerBound(t, s) {
    let e = 0, n = t.length;
    for (; e < n; ) {
      const r = e + n >>> 1;
      t[r] < s ? e = r + 1 : n = r;
    }
    return e;
  }
}
const R = {
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
class H {
  constructor(t) {
    this.cfg = t;
  }
  typeName = "STATIC";
  addRule(t) {
  }
  match(t) {
    if (t.req.method !== "GET" && t.req.method !== "HEAD")
      return null;
    const s = this.cfg.index.resolveUrl(t.url);
    return s ? async (e) => {
      const n = await b.stat(s), r = n.size, o = e.req.method === "HEAD", a = T(s).toLowerCase();
      e.header("X-Content-Type-Options", "nosniff"), e.header("Accept-Ranges", "bytes"), e.header("Last-Modified", n.mtime.toUTCString()), e.header("Content-Type", R[a] || "application/octet-stream");
      const c = `W/"${r}-${Math.trunc(n.mtimeMs)}"`;
      if (e.header("ETag", c), e.req.headers["if-none-match"] === c) {
        e.status(304), e.res.end();
        return;
      }
      const i = e.req.headers.range;
      if (i && i.startsWith("bytes=")) {
        let [f, m] = i.slice(6).split("-"), u = f ? parseInt(f, 10) : 0, l = m ? parseInt(m, 10) : r - 1;
        if (Number.isNaN(u) && (u = 0), Number.isNaN(l) && (l = r - 1), u > l || u >= r) {
          e.status(416).header("Content-Range", `bytes */${r}`), e.res.end();
          return;
        }
        if (e.status(206).header("Content-Range", `bytes ${u}-${l}/${r}`), e.header("Content-Length", String(l - u + 1)), o) {
          e.res.end();
          return;
        }
        const y = g(s, { start: u, end: l });
        y.on("error", () => e.res.destroy()), y.pipe(e.res);
        return;
      }
      if (e.status(200).header("Content-Length", String(r)), o) {
        e.res.end();
        return;
      }
      const d = g(s);
      d.on("error", () => e.res.destroy()), d.pipe(e.res);
    } : null;
  }
}
export {
  p as HttpException,
  k as PathRouteType,
  x as RequestContext,
  N as Router,
  j as StaticIndex,
  H as StaticRouteType
};
//# sourceMappingURL=index.js.map
