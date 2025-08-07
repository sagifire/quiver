// Тестування типобезпеки для Router#addRule / addRules (compile-time)
// Позитивні кейси: PATH, PATTERN, STATIC
// Негативні кейси: неіснуючий type, відсутнє обов'язкове поле (pattern для PATTERN)

import { expect, test } from 'vitest'

import { Router } from '../../src/core/Router'
import { RequestContext } from '../../src/core/http'
import { PathRouteType } from '../../src/route-types/PathRouteType'
import { PatternRouteType } from '../../src/route-types/PatternRouteType'
import { StaticRouteType } from '../../src/route-types/StaticRouteType'
import type { PathRule } from '../../src/route-types/PathRouteType'
import type { PatternRule } from '../../src/route-types/PatternRouteType'
import type { DiscriminatedRuleUnion } from '../../src/core/Router'
import { StaticIndex } from '../../src/services/StaticIndex'

// -- Позитивні кейси (компілятор не має скаржитись) --
test('Типобезпека addRule — позитивні кейси', () => {
  const router = new Router()
    .useType(new PathRouteType())
    .useType(new PatternRouteType())
    .useType(new StaticRouteType({
      index: new StaticIndex({ rootDir: './tests/fixtures/static', urlBase: '/static' })
    } as any))

  // PATH — обов'язкове поле `path` + handler
  router.addRule({
    type: 'PATH',
    path: '/ok',
    methods: ['GET' as const],
    handler: (ctx: RequestContext) => { ctx.text('ok') }
  })

  // PATTERN — обов'язкове поле `pattern`
  router.addRule({
    type: 'PATTERN',
    pattern: '/users/:id',
    methods: ['GET' as const],
    handler: (ctx: RequestContext) => { ctx.text('p') }
  })

  // STATIC — може бути без додаткових полів (handler присутній)
  router.addRule({
    type: 'STATIC',
    handler: (ctx: RequestContext) => { ctx.text('s') }
  })

  expect(true).toBe(true) // чисто runtime-заглушка — сутність перевіряється на етапі компіляції
})

 // -- Негативні кейси (очікуємо помилки компілятора) --
test('Типобезпека addRule — негативні кейси (compile-time)', () => {
  // 1) Додавання правила типу PATTERN без реєстрації PatternRouteType
  // Очікуємо помилку: присвоєння об'єкта з type: 'PATTERN' до PathRule
  // @ts-expect-error: 'PATTERN' is not assignable to 'PATH'
  const bad1: PathRule = {
    type: 'PATTERN',
    path: '/x',
    methods: ['GET' as const],
    handler: (ctx: RequestContext) => {}
  }

  // 2) Відсутнє обов'язкове поле `pattern` для PATTERN (типова помилка)
  // @ts-expect-error: Property 'pattern' is missing in type
  const bad2: PatternRule = {
    type: 'PATTERN',
    // missing `pattern` intentionally
    handler: (ctx: RequestContext) => {}
  }

  expect(true).toBe(true)
})
