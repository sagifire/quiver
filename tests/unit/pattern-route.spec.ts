import { describe, it, expect } from 'vitest'
import { PatternRouteType } from '../../src/route-types/PatternRouteType'
import { RequestContext } from '../../src/core/http'
import { IncomingMessage, ServerResponse } from 'node:http'

// Допоміжна функція для створення контексту запиту
function createMockContext(pathname: string, method: string = 'GET'): RequestContext {
    const req = { method } as IncomingMessage
    const res = {} as ServerResponse
    const url = new URL(`http://localhost${pathname}`)

    const ctx = new RequestContext(req, res)
    ctx.url = url
    ctx.params = {}
    ctx.locals = {}
    ctx.limits = {
        bodySize: 16 * 1024,
        headerTimeoutMs: 30_000,
        requestTimeoutMs: 60_000
    }
    return ctx
}

describe('PatternRouteType', () => {
    // Перевірка парсингу
    describe('Парсинг патернів', () => {
        it('повинен парсити параметри шляху: /:id', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/:id', handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/123')
            const handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
            expect(ctx.params).toEqual({ id: '123' })
        })

        it('повинен парсити параметри шляху з RegExp: /:id([0-9]+)', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/:id([0-9]+)', handler: () => { handlerCalled = true } })

            let ctx = createMockContext('/123')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
            expect(ctx.params).toEqual({ id: '123' })

            handlerCalled = false
            ctx = createMockContext('/abc')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(handlerCalled).toBe(false)
        })

        it('повинен парсити wildcard: /*path', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/*path', handler: () => { handlerCalled = true } })

            let ctx = createMockContext('/some/long/path')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
            expect(ctx.params).toEqual({ path: 'some/long/path' })

            handlerCalled = false
            ctx = createMockContext('/')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
            expect(ctx.params).toEqual({ path: '' }) // Wildcard для кореневого шляху
        })

        it('повинен коректно обробляти wildcard для кореневого шляху, якщо немає інших правил', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/*rest', handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/')
            const handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
            expect(ctx.params).toEqual({ rest: '' })
        })
    }) // Закриття describe('Парсинг патернів', ...)

    it('повинен кидати помилку, якщо wildcard не останній сегмент', () => {
        const router = new PatternRouteType()
        expect(() => {
            router.addRule({ pattern: '/*path/segment', handler: () => { } })
        }).toThrow('Wildcard must be the last segment')
    })


    // Перевірка пріоритетів
    describe('Пріоритет маршрутів', () => {
        it('статичний шлях повинен перемагати параметр на одному рівні', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/users/:id', handler: () => { result = 'param' } })
            router.addRule({ pattern: '/users/me', handler: () => { result = 'static' } })

            let ctx = createMockContext('/users/me')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('static')

            result = ''
            ctx = createMockContext('/users/123')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('param')
            expect(ctx.params).toEqual({ id: '123' })
        })

        it('параметр повинен перемагати wildcard на одному рівні', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/files/*path', handler: () => { result = 'wildcard' } })
            router.addRule({ pattern: '/files/:name', handler: () => { result = 'param' } })

            let ctx = createMockContext('/files/document.txt')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('param')
            expect(ctx.params).toEqual({ name: 'document.txt' })

            result = ''
            ctx = createMockContext('/files/deep/path')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('wildcard')
            expect(ctx.params).toEqual({ path: 'deep/path' })
        })

        it('параметр повинен перемагати wildcard, навіть якщо wildcard додано раніше', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/test/*rest', handler: () => { result = 'wildcard' } })
            router.addRule({ pattern: '/test/:id', handler: () => { result = 'param' } })

            let ctx = createMockContext('/test/123')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('param')
            expect(ctx.params).toEqual({ id: '123' })

            result = ''
            ctx = createMockContext('/test/some/path')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('wildcard')
            expect(ctx.params).toEqual({ rest: 'some/path' })
        })

        it('wildcard повинен спрацьовувати, якщо параметр не проходить валідацію', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/data/:id([0-9]+)', handler: () => { result = 'param-int' } })
            router.addRule({ pattern: '/data/*rest', handler: () => { result = 'wildcard' } })

            let ctx = createMockContext('/data/123')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('param-int')
            expect(ctx.params).toEqual({ id: '123' })

            result = ''
            ctx = createMockContext('/data/abc') // 'abc' не проходить валідацію int
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('wildcard')
            expect(ctx.params).toEqual({ rest: 'abc' })
        })

        it('статичний шлях повинен перемагати wildcard на одному рівні', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/assets/*path', handler: () => { result = 'wildcard' } })
            router.addRule({ pattern: '/assets/image.png', handler: () => { result = 'static' } })

            let ctx = createMockContext('/assets/image.png')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('static')

            result = ''
            ctx = createMockContext('/assets/js/app.js')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('wildcard')
            expect(ctx.params).toEqual({ path: 'js/app.js' })
        })
    })

    // Валідація параметрів
    describe('Валідація параметрів', () => {
        it('повинен валідувати вбудовані типи: int', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/items/:id', constraints: { id: 'int' }, handler: () => { result = 'int' } })

            let ctx = createMockContext('/items/123')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('int')
            expect(ctx.params).toEqual({ id: '123' })

            result = ''
            ctx = createMockContext('/items/abc')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')
        })

        it('повинен валідувати вбудовані типи: uuid', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/api/users/:uuid', constraints: { uuid: 'uuid' }, handler: () => { result = 'uuid' } })

            let ctx = createMockContext('/api/users/123e4567-e89b-12d3-a456-426614174000')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('uuid')
            expect(ctx.params).toEqual({ uuid: '123e4567-e89b-12d3-a456-426614174000' })

            result = ''
            ctx = createMockContext('/api/users/invalid-uuid')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')
        })

        it('повинен валідувати RegExp, переданий у патерні', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/product/:code([A-Z]{3}\\d{4})', handler: () => { result = 'regex-inline' } })

            let ctx = createMockContext('/product/ABC1234')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('regex-inline')
            expect(ctx.params).toEqual({ code: 'ABC1234' })

            result = ''
            ctx = createMockContext('/product/abc1234')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')
        })

        it('повинен валідувати RegExp, переданий у constraints', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({ pattern: '/item/:sku', constraints: { sku: /^[a-z]{2}\d{5}$/i }, handler: () => { result = 'regex-constraint' } })

            let ctx = createMockContext('/item/ab12345')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('regex-constraint')
            expect(ctx.params).toEqual({ sku: 'ab12345' })

            result = ''
            ctx = createMockContext('/item/AB12345')
            handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('regex-constraint')
            expect(ctx.params).toEqual({ sku: 'AB12345' })

            result = ''
            ctx = createMockContext('/item/a12345')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')
        })

        it('повинен валідувати функцію, передану у constraints', async () => {
            const router = new PatternRouteType()
            let result = ''
            router.addRule({
                pattern: '/custom/:value',
                constraints: { value: (v: string) => v.length > 5 && v.includes('test') },
                handler: () => { result = 'func-constraint' }
            })

            let ctx = createMockContext('/custom/longteststring')
            let handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(result).toBe('func-constraint')
            expect(ctx.params).toEqual({ value: 'longteststring' })

            result = ''
            ctx = createMockContext('/custom/short')
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')

            result = ''
            ctx = createMockContext('/custom/abcdef') // Змінено на значення без 'test'
            handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(result).toBe('')
        })
    })

    // Перевірка помилок
    describe('Обробка помилок', () => {
        it('повинен кидати помилку, якщо wildcard не останній сегмент при додаванні правила', () => {
            const router = new PatternRouteType()
            expect(() => {
                router.addRule({ pattern: '/prefix/*path/suffix', handler: () => { } })
            }).toThrow('Wildcard must be the last segment')
        })

        it('повинен кидати помилку для некоректного сегмента параметра', () => {
            const router = new PatternRouteType()
            expect(() => {
                router.addRule({ pattern: '/:123invalid', handler: () => { } })
            }).toThrow('Invalid param segment: :123invalid')
        })

        it('повинен кидати помилку для порожнього імені параметра', () => {
            const router = new PatternRouteType()
            expect(() => {
                router.addRule({ pattern: '/:()', handler: () => { } })
            }).toThrow('Invalid param segment: :()') // Оновлено очікуване повідомлення про помилку
        })
    })

    // Додаткові сценарії
    describe('Додаткові сценарії', () => {
        it('повинен коректно обробляти кореневий шлях', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/', handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/')
            const handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
        })

        it('повинен обробляти HEAD запити, якщо є GET обробник', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/data', methods: ['GET'], handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/data', 'HEAD')
            const handler = router.match(ctx)
            expect(handler).toBeTypeOf('function')
            await handler!(ctx)
            expect(handlerCalled).toBe(true)
        })

        it('повинен повертати null, якщо метод не підтримується', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/data', methods: ['POST'], handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/data', 'GET')
            const handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(handlerCalled).toBe(false)
        })

        it('повинен повертати null для неіснуючого шляху', async () => {
            const router = new PatternRouteType()
            let handlerCalled = false
            router.addRule({ pattern: '/users', handler: () => { handlerCalled = true } })
            const ctx = createMockContext('/products')
            const handler = router.match(ctx)
            expect(handler).toBeNull()
            expect(handlerCalled).toBe(false)
        })
    })
})
