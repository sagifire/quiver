import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { StaticRouteType, StaticRule } from '../../src/route-types/StaticRouteType';
import { Router } from '../../src/core/Router';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { StaticIndex } from '../../src/services/StaticIndex';
import { RequestContext } from '../../src/core/http';
import {
  createTmpDir,
  createFile,
  createFsStructure,
  createSymlink,
  removeDir,
} from '../helpers/fs-fixtures';

describe('2.5 STATIC: безпека', () => {
  let baseURL: string;
  let closeServer: () => Promise<void>;
  let tmpRoot: string;
  let outsideDir: string;
  let canSymlink = false;

  beforeAll(async () => {
    // Підготуємо тимчасові директорії та файли
    tmpRoot = await createTmpDir();
    outsideDir = await createTmpDir();

    // Файли в root
    await createFsStructure(tmpRoot, {
      'index.html': '<html><body>index</body></html>',
      'visible.txt': 'hello',
      '.hidden': 'secret',
      '.well-known': {
        'security.txt': 'contact: security@example.com',
      },
      'a': {},
    });

    // Файл зовні руту
    await createFile(outsideDir, 'outside.txt', 'outside');

    // Спроба створити симлінк на файл поза root
    try {
      canSymlink = await createSymlink(path.join(outsideDir, 'outside.txt'), path.join(tmpRoot, 'outlink'));
    } catch (err) {
      canSymlink = false;
    }

    // Спроба створити циклічний симлінк a/loop -> ../a
    try {
      if (canSymlink) {
        const target = path.join(tmpRoot, 'a');
        const linkPath = path.join(tmpRoot, 'a', 'loop');
        // Ensure target exists
        await createFile(target, 'placeholder.txt', 'x').catch(() => {});
        await createSymlink(target, linkPath);
      }
    } catch (err) {
      // ignore failures on platforms without symlink support
    }

    // Налаштуємо Router + StaticIndex (followSymlinks: true — щоб перевірити захист від поза-root)
    const router = new Router<RequestContext, { STATIC: StaticRule }>();
    const server = await startServer(router);
    baseURL = server.baseURL;
    closeServer = server.close;

    const staticIndex = new StaticIndex({
      rootDir: tmpRoot,
      urlBase: '/',
      followSymlinks: true,
      allowWellKnown: true, // дозволимо .well-known для окремої перевірки
    });
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
      },
    });
  });

  afterAll(async () => {
    await closeServer();
    await removeDir(tmpRoot).catch(() => {});
    await removeDir(outsideDir).catch(() => {});
  });

  it('Запит з .. → 404 (не в індексі)', async () => {
    const { statusCode } = await request({ baseURL, path: `/../index.html`, method: 'GET' });
    expect(statusCode).toBe(404);
  });

  it('Symlink на файл поза root → немає в індексі', async () => {
    if (!canSymlink) {
      // Якщо симлінки не підтримуються на платформі: позначимо тест як пройдений (skip-чека)
      expect(true).toBe(true);
      return;
    }

    const { statusCode } = await request({ baseURL, path: `/outlink`, method: 'GET' });
    expect(statusCode).toBe(404);
  });

  it('Cyclic symlink → індексатор не зависає та не індексує loop', async () => {
    if (!canSymlink) {
      expect(true).toBe(true);
      return;
    }

    // Попросимо доступного файлу — переконаємось, що сервер відповідає (індексація завершена)
    const { statusCode, body } = await request({ baseURL, path: `/index.html`, method: 'GET' });
    expect(statusCode).toBe(200);
    expect(body).toContain('index');

    // Циклічний шлях не повинен бути в індексі
    const maybeLoop = await request({ baseURL, path: `/a/loop`, method: 'GET' });
    expect(maybeLoop.statusCode).toBe(404);
  });

  it('.hidden → 404; .well-known — доступно при опції allowWellKnown', async () => {
    const hidden = await request({ baseURL, path: `/.hidden`, method: 'GET' });
    expect(hidden.statusCode).toBe(404);

    const wk = await request({ baseURL, path: `/.well-known/security.txt`, method: 'GET' });
    expect(wk.statusCode).toBe(200);
    expect(String(wk.body)).toBe('contact: security@example.com');
  });
});
