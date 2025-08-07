import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { StaticRouteType, StaticRule } from '../../src/route-types/StaticRouteType';
import { Router } from '../../src/core/Router';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { StaticIndex } from '../../src/services/StaticIndex';
import { RequestContext } from '../../src/core/http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/static');

describe('2.3 STATIC: кеш-заголовки', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const router = new Router<RequestContext, { STATIC: StaticRule }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;

    const staticIndex = new StaticIndex({ rootDir: FIXTURES_PATH, urlBase: '/' });
    await staticIndex.start();
    const staticRouteType = new StaticRouteType({ index: staticIndex });
    router.useType(staticRouteType);

    router.addRule({
      type: 'STATIC',
      handler: async (ctx) => {
        const handler = staticRouteType.match(ctx);
        if (handler) {
          await handler(ctx);
        } else {
          ctx.status(404).text('Not Found');
        }
      }
    });
  });

  afterAll(async () => {
    await closeServer();
  });

  it('Перший GET — зчитай ETag, другий — з If-None-Match → 304 без тіла', async () => {
    const filePath = 'index.html';
    // Перший GET — отримуємо ETag
    const first = await request({ baseURL, path: `/${filePath}`, method: 'GET' });
    expect(first.statusCode).toBe(200);
    const etag = first.headers['etag'] as string | undefined;
    expect(etag).toBeDefined();

    // Другий GET з If-None-Match — очікуємо 304 та порожнє тіло
    const second = await request({
      baseURL,
      path: `/${filePath}`,
      method: 'GET',
      headers: {
        'If-None-Match': String(etag)
      }
    });

    expect(second.statusCode).toBe(304);
    // Tіло відповіді для 304 має бути пустим
    expect(second.body).toBe('');
    // Не повинно бути Content-Length тіла
    // Якщо сервер все ж додає header, він має бути '0' або відсутнім; перевіримо, що вміст тіла порожній
  });
});
