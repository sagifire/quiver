import { describe, it, expect } from 'vitest';
import { PathRouteType } from '../../src/route-types/PathRouteType';
import { Router } from '../../src/core/Router';
import { RequestContext } from '../../src/core/http';
import { IncomingMessage, ServerResponse } from 'node:http';

describe('PATH (бінарний пошук)', () => {
  it('Given N правил, When додаємо правила, Then перевіряємо точний збіг/відсутність збігу', async () => {
    const router = new Router().useType(new PathRouteType());

    const rules = [
      { methods: ['GET' as const], path: '/users', handler: (ctx: RequestContext) => ctx.json('users') },
      { methods: ['GET' as const], path: '/products', handler: (ctx: RequestContext) => ctx.json('products') },
      { methods: ['POST' as const], path: '/users', handler: (ctx: RequestContext) => ctx.json('create user') },
      { methods: ['GET' as const], path: '/items', handler: (ctx: RequestContext) => ctx.json('items') },
      { methods: ['GET' as const], path: '/admin', handler: (ctx: RequestContext) => ctx.json('admin') },
    ];

    rules.forEach(rule => {
      router.addRule({ type: 'PATH', methods: rule.methods, path: rule.path, handler: rule.handler });
    });

    const createMockHttpObjects = (method: string, url: string) => {
      const req = new IncomingMessage(null as any);
      req.method = method;
      req.url = url;
      const res = new ServerResponse(req);
      let responseBody = '';
      res.write = (chunk: any) => { responseBody += chunk; return true; };
      res.end = (chunk?: any) => { if (chunk) responseBody += chunk; return res; };
      (res as any)._getBody = () => responseBody;
      let headers: Record<string, string> = {};
      res.setHeader = (name: string, value: string) => { headers[name] = value; return res; };
      res.getHeaders = () => headers;
      return { req, res };
    };

    // Перевірка точних збігів
    let { req, res } = createMockHttpObjects('GET', '/users');
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('"users"');

    ({ req, res } = createMockHttpObjects('GET', '/products'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('"products"');

    ({ req, res } = createMockHttpObjects('POST', '/users'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('"create user"');

    ({ req, res } = createMockHttpObjects('GET', '/items'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('"items"');

    ({ req, res } = createMockHttpObjects('GET', '/admin'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('"admin"');

    // Перевірка відсутності збігів
    ({ req, res } = createMockHttpObjects('GET', '/nonexistent'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(404);

    ({ req, res } = createMockHttpObjects('PUT', '/users'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(405); // Очікуємо 405
    expect(res.getHeaders()['Allow']).toBe('GET, HEAD, POST'); // Очікуємо GET, HEAD, POST

    ({ req, res } = createMockHttpObjects('GET', '/users/1'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('Given правило, When HEAD запит, Then HEAD працює', async () => {
    const router = new Router().useType(new PathRouteType());

    let handlerCalled = false;
    router.addRule({
      type: 'PATH',
      methods: ['GET' as const],
      path: '/test',
      handler: (ctx) => {
        handlerCalled = true;
        ctx.text('OK');
      },
    });

    const req = new IncomingMessage(null as any);
    req.method = 'HEAD';
    req.url = '/test';
    const res = new ServerResponse(req);
    let responseBody = '';
    res.write = (chunk: any) => { responseBody += chunk; return true; };
    res.end = (chunk?: any) => { if (chunk) responseBody += chunk; return res; };

    await router.handler(req, res);

    expect(res.statusCode).toBe(200); // Очікуємо 200
    expect(handlerCalled).toBe(true);
    expect(responseBody).toBe(''); // HEAD має повертати порожнє тіло
  });

  it('Given правило, When заборонений метод, Then 405 для заборонених методів', async () => {
    const router = new Router().useType(new PathRouteType());

    router.addRule({ type: 'PATH', methods: ['GET' as const], path: '/resource', handler: (ctx) => ctx.text('GET response') });
    router.addRule({ type: 'PATH', methods: ['POST' as const], path: '/resource', handler: (ctx) => ctx.text('POST response') });

    const createMockHttpObjects = (method: string, url: string) => {
      const req = new IncomingMessage(null as any);
      req.method = method;
      req.url = url;
      const res = new ServerResponse(req);
      let headers: Record<string, string> = {};
      res.setHeader = (name: string, value: string) => { headers[name] = value; return res; };
      res.getHeaders = () => headers;
      let responseBody = '';
      res.write = (chunk: any) => { responseBody += chunk; return true; };
      res.end = (chunk?: any) => { if (chunk) responseBody += chunk; return res; };
      (res as any)._getBody = () => responseBody;
      return { req, res };
    };

    // Перевірка, що GET працює
    let { req, res } = createMockHttpObjects('GET', '/resource');
    await router.handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res as any)._getBody()).toBe('GET response');

    // Перевірка, що PUT повертає 405
    ({ req, res } = createMockHttpObjects('PUT', '/resource'));
    await router.handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeaders()['Allow']).toBe('GET, HEAD, POST'); // Очікуємо GET, HEAD, POST
  });
});
