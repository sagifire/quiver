// PatternRouteType.ts
import { IRouteType, Handler, RequestContext, RouteRuleBase, Pipe, Method } from '../core/http.js'
import { compose } from '../core/compose.js'

export interface PatternRule<Ctx extends RequestContext = RequestContext>
    extends RouteRuleBase<Ctx>
{
    type: 'PATTERN'
    pattern: string
    methods?: Method[]
    constraints?: Record<string, 'int'|'uuid'|'hex'|'alpha'|RegExp|((v: string) => boolean)>
}

/* ---------------- internals ---------------- */

type Validator = (v: string) => boolean

const BuiltinValidators: Record<string, Validator> = {
    int:   v => /^-?\d+$/.test(v),
    uuid:  v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
    hex:   v => /^[0-9a-f]+$/i.test(v),
    alpha: v => /^[A-Za-z]+$/.test(v),
}

function toValidator(
    spec: 'int'|'uuid'|'hex'|'alpha'|RegExp|((v: string) => boolean)|undefined
): Validator|undefined {
    if (!spec) {
        return undefined
    }
    if (typeof spec === 'function') {
        return spec
    }
    if (spec instanceof RegExp) {
        const r = spec
        return v => r.test(v)
    }
    return BuiltinValidators[spec]
}

type Token =
    | { t: 'static', val: string }
    | { t: 'param', name: string, validate?: Validator }
    | { t: 'wildcard', name: string } // останній сегмент

function normalizePath(p: string) {
    if (!p || p === '/') {
        return '/'
    }
    return p.endsWith('/') ? p.slice(0, -1) : p
}

function decodeSafe(s: string): string|null {
    try {
        return decodeURIComponent(s)
    } catch {
        return null
    }
}

function parsePattern(pattern: string, constraints?: PatternRule['constraints']): Token[] {
    const clean = normalizePath(pattern)
    if (clean === '/') {
        return []
    }
    const parts = clean.slice(1).split('/')

    const tokens: Token[] = []
    for (let i = 0; i < parts.length; i++) {
        const seg = parts[i]!
        if (seg.startsWith(':')) {
            const m = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\((.+)\))?$/.exec(seg)
            if (!m) {
                throw new Error(`Invalid param segment: ${seg}`)
            }
            const name = m[1]
            if (!name) {
                throw new Error(`Invalid param name in segment: ${seg}`)
            }
            let validate: Validator|undefined
            if (m[2]) {
                validate = toValidator(new RegExp(`^(?:${m[2]})$`))
            } else if (constraints && constraints[name]) {
                validate = toValidator(constraints[name])
            }
            tokens.push({ t: 'param', name, validate })
            continue
        }
        if (seg === '*' || seg.startsWith('*')) {
            const name = seg === '*' ? 'wild' : seg.slice(1)
            if (i !== parts.length - 1) {
                throw new Error('Wildcard must be the last segment')
            }
            tokens.push({ t: 'wildcard', name })
            continue
        }
        tokens.push({ t: 'static', val: seg })
    }
    return tokens
}

type Exec<Ctx extends RequestContext> = Handler<Ctx>

class Node<Ctx extends RequestContext> {
    sChildren: Map<string, Node<Ctx>>|null = null
    pChild: { name: string, validate?: Validator, node: Node<Ctx> }|null = null
    wChild: { name: string, node: Node<Ctx> }|null = null
    handlers: Map<Method, Exec<Ctx>>|null = null

    getOrAddStatic(seg: string) {
        if (!this.sChildren) {
            this.sChildren = new Map()
        }
        let n = this.sChildren.get(seg)
        if (!n) {
            n = new Node<Ctx>()
            this.sChildren.set(seg, n)
        }
        return n
    }

    setParam(name: string, validate?: Validator) {
        // Обмеження на додавання param після wildcard видалено, оскільки пріоритет визначається під час матчингу.
        if (!this.pChild) {
            this.pChild = { name, validate, node: new Node<Ctx>() }
        }
        return this.pChild.node
    }

    setWildcard(name: string) {
        if (!this.wChild) {
            this.wChild = { name, node: new Node<Ctx>() }
        }
        return this.wChild.node
    }

    setHandler(methods: Method[], exec: Exec<Ctx>) {
        if (!this.handlers) {
            this.handlers = new Map()
        }
        for (const m of methods) {
            if (this.handlers.has(m)) {
                throw new Error(`Duplicate handler for method ${m}`)
            }
            this.handlers.set(m, exec)
        }
    }

    getHandler(method: Method): Exec<Ctx>|null {
        if (!this.handlers) {
            return null
        }
        const h = this.handlers.get(method) || (method === 'HEAD' ? this.handlers.get('GET') : undefined)
        return h ?? null
    }
}

/* ---------------- exported route type ---------------- */

export class PatternRouteType<Ctx extends RequestContext = RequestContext>
    implements IRouteType<Ctx, PatternRule<Ctx>>
{
    readonly typeName = 'PATTERN'
    private root = new Node<Ctx>()

    addRule(rule: PatternRule<Ctx>) {
        const methods: Method[] = rule.methods?.length
            ? rule.methods
            : ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

        const tokens = parsePattern(rule.pattern, rule.constraints)
        const exec = compose(rule.pipes as readonly Pipe<Ctx>[]|undefined, rule.handler as Handler<Ctx>)

        let node = this.root
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i]!
            if (t.t === 'static') {
                node = node.getOrAddStatic(t.val)
            } else if (t.t === 'param') {
                node = node.setParam(t.name, t.validate)
            } else {
                node = node.setWildcard(t.name)
                if (i !== tokens.length - 1) {
                    throw new Error('Wildcard must be the last segment')
                }
            }
        }
        node.setHandler(methods, exec)
    }

    match(ctx: Ctx): Handler<Ctx>|null {
        const pathname = normalizePath(ctx.url.pathname)
        const method = (ctx.req.method as Method) || 'GET'

        if (pathname === '/') {
            // Спочатку перевіряємо статичний обробник для кореневого шляху
            let h = this.root.getHandler(method)
            if (h) {
                return h
            }
            // Якщо статичного обробника немає, перевіряємо wildcard для кореневого шляху (наприклад, /*path)
            if (this.root.wChild) {
                h = this.root.wChild.node.getHandler(method)
                if (h) {
                    // Для кореневого шляху параметр wildcard має бути порожнім рядком
                    return (c: Ctx) => {
                        (c as any).params = { [this.root.wChild!.name]: '' }
                        return h!(c)
                    }
                }
            }
            return null
        }

        const parts = pathname.slice(1).split('/')

        let params: Record<string, string>|null = null

        const go = (node: Node<Ctx>, idx: number): Exec<Ctx>|null => {
            if (idx === parts.length) {
                return node.getHandler(method)
            }

            const segRaw = parts[idx]
            if (segRaw === undefined) {
                return null
            }

            const segDec = decodeSafe(segRaw)
            if (segDec === null) {
                return null
            }

            if (node.sChildren) {
                const next = node.sChildren.get(segDec)
                if (next) {
                    const h = go(next, idx + 1)
                    if (h) {
                        return h
                    }
                }
            }

            if (node.pChild) {
                const { name, validate, node: pnode } = node.pChild
                if (!validate || validate(segDec)) {
                    if (!params) {
                        params = Object.create(null)
                    }
                    params![name] = segDec
                    const h = go(pnode, idx + 1)
                    if (h) {
                        return h
                    }
                    delete params![name]
                }
            }

            if (node.wChild) {
                let acc = ''
                for (let i = idx; i < parts.length; i++) {
                    const d = decodeSafe(parts[i]!)
                    if (d === null) {
                        return null
                    }
                    acc += (i === idx ? '' : '/') + d
                }
                if (!params) {
                    params = Object.create(null)
                }
                params![node.wChild.name] = acc
                const h = node.wChild.node.getHandler(method)
                if (h) {
                    return h
                }
                delete params![node.wChild.name]
            }

            return null
        }

        const found = go(this.root, 0)
        if (!found) {
            return null
        }

        return (c: Ctx) => {
            if (params) {
                ;(c as any).params = params
            }
            return found(c)
        }
    }
}
