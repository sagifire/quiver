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

describe('2.4 STATIC: Range', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;
  let staticRouteType: StaticRouteType<RequestContext>;

  beforeAll(async () => {
    const router = new Router<RequestContext, { STATIC: StaticRule }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;

    const staticIndex = new StaticIndex({ rootDir: FIXTURES_PATH, urlBase: '/' });
    await staticIndex.start();

    staticRouteType = new StaticRouteType({ index: staticIndex });
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

  it('Range: bytes=0-3 → 206, Content-Range, length 4', async () => {
    const filePath = 'app.js';
    const expectedBuffer = readFileSync(path.join(FIXTURES_PATH, filePath));
    const { statusCode, headers, body } = await request({
      baseURL,
      path: `/${filePath}`,
      method: 'GET',
      headers: { Range: 'bytes=0-3' }
    });

    expect(statusCode).toBe(206);
    expect(headers['content-range']).toBe(`bytes 0-3/${expectedBuffer.length}`);
    expect(headers['content-length']).toBe('4');
    // body may be string or Buffer depending on content-type handling in helper
    const received = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    expect(Buffer.from(received).equals(expectedBuffer.slice(0, 4))).toBe(true);
  });

  it('Range beyond file → 416 with correct Content-Range', async () => {
    const filePath = 'app.js';
    const expectedBuffer = readFileSync(path.join(FIXTURES_PATH, filePath));
    const { statusCode, headers, body } = await request({
      baseURL,
      path: `/${filePath}`,
      method: 'GET',
      headers: { Range: `bytes=${expectedBuffer.length + 10}-${expectedBuffer.length + 20}` }
    });

    expect(statusCode).toBe(416);
    expect(headers['content-range']).toBe(`bytes */${expectedBuffer.length}`);
    // Body for 416 can be empty; ensure it's not the file content
    const received = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    expect(received.length).toBeLessThanOrEqual(0); // should be empty
  });
});
