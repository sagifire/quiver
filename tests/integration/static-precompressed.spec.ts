import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { StaticRouteType, StaticRule } from '../../src/route-types/StaticRouteType';
import { Router } from '../../src/core/Router';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticIndex } from '../../src/services/StaticIndex';
import { RequestContext } from '../../src/core/http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/precompressed');

describe('2.6 STATIC: precompressed (тонкий інтерфейс)', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const router = new Router<RequestContext, { STATIC: StaticRule }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;

    const staticIndex = new StaticIndex({ rootDir: FIXTURES_PATH, urlBase: '/' });
    await staticIndex.start();

    const staticRouteType = new StaticRouteType({
      index: staticIndex,
      precompressed: { enabled: true } // use thin interface (sibling files)
    });

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

  it('Accept-Encoding: br → serves .br with Content-Encoding: br, Vary and ETag suffix, Accept-Ranges: none', async () => {
    const res = await request({
      baseURL,
      path: '/app.js',
      method: 'GET',
      headers: {
        'Accept-Encoding': 'br'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(String(res.headers['vary'] || '')).toBe('Accept-Encoding');
    expect(String(res.headers['etag'] || '')).toContain('-br"');
    expect(String(res.headers['accept-ranges'] || '')).toBe('none');
  });

  it('Accept-Encoding: gzip → serves .gz with Content-Encoding: gzip, Vary and ETag suffix, Accept-Ranges: none', async () => {
    const res = await request({
      baseURL,
      path: '/app.js',
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(String(res.headers['vary'] || '')).toBe('Accept-Encoding');
    expect(String(res.headers['etag'] || '')).toContain('-gzip"');
    expect(String(res.headers['accept-ranges'] || '')).toBe('none');
  });

  it('No Accept-Encoding → serves original file (no Content-Encoding), Vary present, Accept-Ranges: bytes, ETag without encoding suffix', async () => {
    const res = await request({
      baseURL,
      path: '/app.js',
      method: 'GET'
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(String(res.headers['vary'] || '')).toBe('Accept-Encoding');
    expect(String(res.headers['accept-ranges'] || '')).toBe('bytes');
    const etag = String(res.headers['etag'] || '');
    expect(etag).not.toContain('-br"');
    expect(etag).not.toContain('-gzip"');
  });
});
