import { IRouteType, RouteRuleBase, Pipe, RequestContext, Handler } from '../core/http.js'
import { HttpException } from '../core/HttpException.js'
import { compose } from '../core/compose.js'

export interface PathRule<Ctx extends RequestContext = RequestContext>
    extends RouteRuleBase<Ctx>
{
    path: string
    methods?: ('GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS')[]
}

function normalizePath(p: string) {
    if (!p || p === '/') {
        return '/'
    }
    return p.endsWith('/') ? p.slice(0, -1) : p
}

const METHOD_ORDER: ReadonlyArray<string> = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

export class PathRouteType<Ctx extends RequestContext = RequestContext>
    implements IRouteType<Ctx, PathRule<Ctx>>
{
    readonly typeName = 'PATH' as const

    // Бінарний пошук по "METHOD␠PATH"
    private keys: string[] = []
    private execs: Handler<Ctx>[] = []

    // Для 405: індекс шлях → множина дозволених методів
    private pathMethods = new Map<string, Set<string>>()

    addRule(rule: PathRule<Ctx>) {
        const path = normalizePath(rule.path)
        const methods = (rule.methods?.length ? rule.methods : ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
            .map(m => m.toUpperCase())

        const exe = compose(rule.pipes, rule.handler)

        for (const m of methods) {
            const key = `${m} ${path}`
            const i = this.lowerBound(this.keys, key)
            this.keys.splice(i, 0, key)
            this.execs.splice(i, 0, exe)
        }

        let set = this.pathMethods.get(path)
        if (!set) {
            set = new Set<string>()
            this.pathMethods.set(path, set)
        }
        for (const m of methods) {
            set.add(m)
        }
    }

    match(ctx: Ctx): Handler<Ctx>|null {
        const method = (ctx.req.method || 'GET').toUpperCase()
        const path = normalizePath(ctx.url.pathname)
        const key = `${method} ${path}`

        // 1) Точний збіг: METHOD + PATH
        let i = this.lowerBound(this.keys, key)
        if (i < this.keys.length && this.keys[i] === key) {
            return this.execs[i]!
        }

        // 2) HEAD → fallback на GET, якщо HEAD не знайдено, але GET існує
        if (method === 'HEAD') {
            const getKey = `GET ${path}`
            i = this.lowerBound(this.keys, getKey)
            if (i < this.keys.length && this.keys[i] === getKey) {
                const getHandler = this.execs[i]!;
                return async (ctx: Ctx) => {
                    // Зберігаємо оригінальний res.end
                    const originalResEnd = ctx.res.end;
                    // Тимчасово перевизначаємо res.end, щоб придушити тіло для HEAD запитів
                    ctx.res.end = (chunk?: any) => {
                        // Нічого не робимо з chunk, просто повертаємо res
                        return ctx.res;
                    };

                    await getHandler(ctx); // Виконуємо GET обробник для побічних ефектів (наприклад, встановлення заголовків)

                    // Відновлюємо оригінальний res.end
                    ctx.res.end = originalResEnd;

                    // Явно встановлюємо статус та завершуємо відповідь для HEAD
                    // Зберігаємо статус, якщо він був встановлений обробником, інакше 200
                    ctx.res.statusCode = ctx.res.statusCode === 200 ? 200 : ctx.res.statusCode;
                    ctx.res.end(); // Відправляємо порожнє тіло
                };
            }
        }

        // 3) Розрізнення 404 vs 405
        const allowed = this.pathMethods.get(path)
        if (allowed && allowed.size > 0) {
            // RFC: якщо GET дозволено, HEAD теж вважається дозволеним → додамо у Allow
            const allowList = new Set<string>(allowed)
            if (allowed.has('GET')) {
                allowList.add('HEAD')
            }
            const ordered = METHOD_ORDER.filter(m => allowList.has(m))
            const allowHeader = ordered.length ? ordered.join(', ') : Array.from(allowList).join(', ')
            return () => {
                throw new HttpException(405, 'Method Not Allowed', true, { 'Allow': allowHeader })
            }
        }

        // Інакше — шляху немає зовсім → 404 (Router відпрацює свій notFound)
        return null
    }

    private lowerBound(arr: string[], key: string): number {
        let l = 0
        let r = arr.length
        while (l < r) {
            const mid = (l + r >>> 1)
            if (arr[mid]! < key) {
                l = mid + 1
            } else {
                r = mid
            }
        }
        return l
    }
}
