import { expect, test } from 'vitest'
import { Router } from '../../src/core/Router'
import { PathRouteType } from '../../src/route-types/PathRouteType'
import { RequestContext } from '../../src/core/http'
import { IncomingMessage, ServerResponse } from 'node:http'

// 3.2 Кастомний RequestContext — перевірка на рівні типів:
// - поле customField має бути доступне в handler і pipes.
// Це файл типово-орієнтований: успіх перевіряється компілятором TS.

class MyContext extends RequestContext {
  public customField: string
  constructor(req: IncomingMessage, res: ServerResponse) {
    super(req, res)
    this.customField = 'hello-custom'
  }
}

test('3.2 Custom RequestContext types — handler and pipes see customField', () => {
  // Вказуємо generic Router<MyContext> та передаємо клас в опції
  const router = new Router<MyContext>({ context: { class: MyContext } })
    .useType(new PathRouteType<MyContext>())

  // Pipe повинен бачити поле customField
  router.useGlobalPipes((ctx) => {
    // Якщо поле відсутнє — TypeScript згенерує помилку тут
    void ctx.customField
  })

  // Handler повинен бачити поле customField
  router.addRule({
    type: 'PATH',
    path: '/check',
    handler: (ctx) => {
      void ctx.customField
    }
  })

  expect(true).toBe(true) // runtime-заглушка; перевірка — на етапі компіляції
})
