import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { Router } from '../../src/core/Router';
import { PathRouteType } from '../../src/route-types/PathRouteType';
import { PatternRouteType } from '../../src/route-types/PatternRouteType';
import { StaticRouteType } from '../../src/route-types/StaticRouteType';
import { StaticIndex } from '../../src/services/StaticIndex';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { RequestContext } from '../../src/core/http';

const FIXTURES_PATH = path.resolve(process.cwd(), 'tests/fixtures/static');

describe('4.1 Smoke concurrency: 100-200 parallel GETs on STATIC and PATH/PATTERN', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const router = new Router<RequestContext, { PATH: any; PATTERN: any; STATIC: any }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;

    // Register PATH
    const pathType = new PathRouteType();
    router.useType(pathType);
    router.addRule({
      type: 'PATH',
      path: '/ping',
      methods: ['GET'],
      handler: (ctx: RequestContext) => {
        ctx.header('x-handler', 'ping').text('pong');
      }
    });

    // Register PATTERN
    const patternType = new PatternRouteType();
    router.useType(patternType);
    router.addRule({
      type: 'PATTERN',
      pattern: '/users/:id',
      methods: ['GET'],
      handler: (ctx: RequestContext) => {
        const id = (ctx as any).params?.id ?? '';
        ctx.json({ id });
      }
    });

    // Register STATIC (using StaticIndex)
    const staticIndex = new StaticIndex({ rootDir: FIXTURES_PATH, urlBase: '/' });
    await staticIndex.start();
    const staticType = new StaticRouteType({ index: staticIndex });
    router.useType(staticType);
    // Add a STATIC rule that delegates to StaticRouteType.match (same approach as other tests)
    router.addRule({
      type: 'STATIC',
      methods: ['GET', 'HEAD'],
      handler: async (ctx: RequestContext) => {
        const h = staticType.match(ctx);
        if (h) {
          await h(ctx);
        } else {
          ctx.status(404).text('Not Found');
        }
      }
    });
  });

  afterAll(async () => {
    await closeServer();
  });

  it('runs 150 parallel GETs across static, path and pattern with no errors', async () => {
    // Attach listeners to fail on unexpected global errors during concurrency
    let uncaught: any = null;
    let unhandled: any = null;
    const onUncaught = (err: any) => { uncaught = err; };
    const onUnhandled = (err: any) => { unhandled = err; };
    process.once('uncaughtException', onUncaught);
    process.once('unhandledRejection', onUnhandled);

    try {
      const indexContent = readFileSync(path.join(FIXTURES_PATH, 'index.html'), 'utf8');
      const appJsBuffer = readFileSync(path.join(FIXTURES_PATH, 'app.js'));

      const total = 150;
      const requests: Promise<any>[] = [];

      for (let i = 0; i < total; i++) {
        if (i % 3 === 0) {
          // STATIC index.html
          requests.push(request({ baseURL, path: '/index.html', method: 'GET' }));
        } else if (i % 3 === 1) {
          // PATH /ping
          requests.push(request({ baseURL, path: '/ping', method: 'GET' }));
        } else {
          // PATTERN /users/:id
          const id = String(1000 + (i % 50));
          requests.push(request({ baseURL, path: `/users/${id}`, method: 'GET' }));
        }
      }

      const results = await Promise.all(requests);

      // Basic validations: every response is present and has expected content
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        expect(res).toBeDefined();
        expect(res.statusCode).toBe(200);

        if (i % 3 === 0) {
          // static index.html should match text
          expect(String(res.body)).toBe(indexContent);
        } else if (i % 3 === 1) {
          expect(String(res.body)).toBe('pong');
          expect(res.headers['x-handler']).toBe('ping');
        } else {
          // pattern returns JSON with id
          const parsed = typeof res.body === 'string' ? JSON.parse(res.body) : JSON.parse(String(res.body));
          expect(parsed).toHaveProperty('id');
          // id should match the sent id
          const expectedId = String(1000 + (i % 50));
          expect(parsed.id).toBe(expectedId);
        }
      }

      // Ensure no global errors occurred
      expect(uncaught).toBeNull();
      expect(unhandled).toBeNull();
    } finally {
      process.removeListener('uncaughtException', onUncaught);
      process.removeListener('unhandledRejection', onUnhandled);
    }
  }, 20_000); // increase timeout to 20s for concurrency
});
