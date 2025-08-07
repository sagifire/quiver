import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { StaticRouteType, StaticRule } from '../../src/route-types/StaticRouteType';
import { Router } from '../../src/core/Router';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { StaticIndex } from '../../src/services/StaticIndex'; // Імпортуємо StaticIndex
import { RequestContext } from '../../src/core/http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/static');

describe('2.2 STATIC: базова відповідь', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {    
    const router = new Router<RequestContext, { STATIC: StaticRule }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;
    const staticIndex = new StaticIndex({ rootDir: FIXTURES_PATH, urlBase: '/' }); // Використовуємо '/' як базовий URL для статичних файлів
    await staticIndex.start(); // Скануємо файли
    const staticRouteType = new StaticRouteType({ index: staticIndex });
    router.useType(staticRouteType); // Передаємо index
    router.addRule({ // Додаємо правило до роутера
      type: 'STATIC',
      handler: async (ctx) => {
        const handler = staticRouteType.match(ctx);
        if (handler) {
          await handler(ctx);
        } else {
          ctx.status(404).text('Not Found'); // Якщо StaticRouteType не знайшов файл
        }
      }
    });
  });

  afterAll(async () => {
    await closeServer();
  });

  it('GET на текстовий файл: 200, коректні заголовки та тіло', async () => {
    const filePath = 'index.html';
    const expectedContent = readFileSync(path.join(FIXTURES_PATH, filePath), 'utf-8');
    const { statusCode, headers, body } = await request({ baseURL, path: `/${filePath}`, method: 'GET' });

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toBe('text/html; charset=utf-8'); // Додано charset
    expect(headers['content-length']).toBe(String(Buffer.byteLength(expectedContent)));
    expect(headers['last-modified']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(body).toBe(expectedContent);
  });

  it('HEAD на текстовий файл: 200, коректні заголовки, без тіла', async () => {
    const filePath = 'index.html';
    const expectedContent = readFileSync(path.join(FIXTURES_PATH, filePath), 'utf-8');
    const { statusCode, headers, body } = await request({ baseURL, path: `/${filePath}`, method: 'HEAD' });

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toBe('text/html; charset=utf-8'); // Додано charset
    expect(headers['content-length']).toBe(String(Buffer.byteLength(expectedContent)));
    expect(headers['last-modified']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(body).toBe(''); // HEAD запит не повинен повертати тіло
  });

  it('GET на бінарний файл: 200, коректні заголовки та тіло', async () => {
    const filePath = 'app.js';
    const expectedContentBuffer = readFileSync(path.join(FIXTURES_PATH, filePath)); // Читаємо як Buffer
    const { statusCode, headers, body } = await request({ baseURL, path: `/${filePath}`, method: 'GET' });

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(headers['content-length']).toBe(String(expectedContentBuffer.length));
    expect(headers['last-modified']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(body).equals(expectedContentBuffer)).toBe(true); // Порівнюємо як Buffer
  });

  it('HEAD на бінарний файл: 200, коректні заголовки, без тіла', async () => {
    const filePath = 'app.js';
    const expectedContentBuffer = readFileSync(path.join(FIXTURES_PATH, filePath)); // Читаємо як Buffer
    const { statusCode, headers, body } = await request({ baseURL, path: `/${filePath}`, method: 'HEAD' });

    expect(statusCode).toBe(200);
    expect(headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(headers['content-length']).toBe(String(expectedContentBuffer.length));
    expect(headers['last-modified']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(body).toBe(''); // HEAD запит не повинен повертати тіло
  });
});
