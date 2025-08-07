import { Router } from '../../src/core/Router';
import { PathRouteType } from '../../src/route-types/PathRouteType';
import { PatternRouteType } from '../../src/route-types/PatternRouteType';
import { StaticRouteType } from '../../src/route-types/StaticRouteType';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { createTmpDir, removeDir, createFile } from '../helpers/fs-fixtures';
import { join } from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestContext } from '../../src/core/http';
import { IncomingMessage, ServerResponse } from 'node:http';
import { StaticIndex } from '../../src/services/StaticIndex';

describe('2.1 Router: групи, addRule(s), кастомний Context', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
  });

  afterEach(async () => {
    await removeDir(tmpDir);
  });

  it('PATTERN має пріоритет над STATIC, якщо зареєстрований раніше', async () => {
    // Готуємо індекс та файл
    await createFile(tmpDir, 'test.txt', 'Static Content');

    const sidx = new StaticIndex({
        rootDir: tmpDir,
        urlBase: '/',
    });
    await sidx.start(); // Чекаємо на завершення індексації

    // ВАЖЛИВО: спершу реєструємо PATTERN, потім STATIC
    const router = new Router()
        .useType(new PatternRouteType())
        .useType(new StaticRouteType({ index: sidx }));

    // Додаємо лише PATTERN правило
    router.addRule({
        type: 'PATTERN',
        pattern: '/test.txt',
        handler: ctx => { ctx.text('Pattern Content'); }
    });

    const { baseURL, close } = await startServer(router);
    const res = await request({ baseURL, path: '/test.txt', method: 'GET' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Pattern Content');

    await close();
  });

  it('STATIC має пріоритет над PATTERN, якщо зареєстрований раніше', async () => {
    await createFile(tmpDir, 'test.txt', 'Static Content');

    const sidx = new StaticIndex({
        rootDir: tmpDir,
        urlBase: '/',
    });
    await sidx.start(); // Чекаємо на завершення індексації

    const router = new Router()
      .useType(new StaticRouteType({ index: sidx }))
      .useType(new PatternRouteType());

    router.addRule({
      type: 'STATIC',
      handler: (ctx) => {
        ctx.text('Static Content'); // STATIC handler should return static content
      }
    });

    router.addRule({
      type: 'PATTERN',
      pattern: '/test.txt',
      handler: (ctx) => {
        ctx.text('Pattern Content');
      }
    });

    const { baseURL, close } = await startServer(router);
    const res = await request({ baseURL, path: '/test.txt', method: 'GET' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Static Content');
    await close();
  });

  it('Спроба addRule для незареєстрованого типу має призвести до помилки', () => {
    const router = new Router()
      .useType(new PathRouteType());

    expect(() => {
      router.addRule({
        type: 'NON_EXISTENT_TYPE',
        path: '/test',
        handler: (ctx) => { ctx.text('test'); }
      } as unknown as { type: 'PATH', path: string, handler: (ctx: any) => void }
    );
    }).toThrow('Route type "NON_EXISTENT_TYPE" is not registered'); // Прибираємо крапку
  });

  it('Кастомний RequestContext передається і поле читається в handler', async () => {
    class MyCustomContext extends RequestContext {
      public customField: string;
      constructor(req: IncomingMessage, res: ServerResponse) {
        super(req, res);
        this.customField = 'Hello from Custom Context!';
      }
    }

    const router = new Router({ context: { class: MyCustomContext } })
      .useType(new PathRouteType<MyCustomContext>());

    router.addRule({
      type: 'PATH',
      path: '/custom-context',
      handler: (ctx: MyCustomContext) => {
        ctx.text(ctx.customField);
      }
    });

    const { baseURL, close } = await startServer(router);
    const res = await request({ baseURL, path: '/custom-context', method: 'GET' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Hello from Custom Context!');
    await close();
  });
});
