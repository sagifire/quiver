import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../helpers/server';
import { request } from '../helpers/http';
import { createTmpDir, createFile, createFsStructure, changeMtime, createSymlink, removeDir } from '../helpers/fs-fixtures';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('Тест-хелпери', () => {
  let server: { baseURL: string; close: () => Promise<void> } | undefined;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    if (tmpDir) {
      await removeDir(tmpDir);
      tmpDir = undefined;
    }
  });

  it('server.ts: повинен запускати HTTP-сервер і повертати baseURL', async () => {
    // Заглушка для роутера, оскільки ми тестуємо лише функціонал сервера
    const mockRouter = {
      handle: async (req: any, res: any) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello from mock router!');
      },
    };
    server = await startServer(mockRouter);
    expect(server.baseURL).toMatch(/^http:\/\/localhost:\d+$/);

    const response = await request({ baseURL: server.baseURL, method: 'GET', path: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello from mock router!');
  });

  it('http.ts: повинен виконувати HTTP-запити', async () => {
    const mockRouter = {
      handle: async (req: any, res: any) => {
        if (req.url === '/test' && req.method === 'POST') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          res.statusCode = 201;
          res.setHeader('X-Test-Header', 'Value');
          res.end(`Received: ${body}`);
        } else {
          res.statusCode = 404;
          res.end('Not Found');
        }
      },
    };
    server = await startServer(mockRouter);

    const response = await request({
      baseURL: server.baseURL,
      method: 'POST',
      path: '/test',
      headers: { 'Content-Type': 'text/plain' },
      body: 'test body',
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-test-header']).toBe('Value');
    expect(response.body).toBe('Received: test body');
  });

  it('fs-fixtures.ts: повинен створювати тимчасові директорії та файли', async () => {
    tmpDir = await createTmpDir();
    expect(await fs.stat(tmpDir)).toBeTruthy(); // Перевіряємо, що директорія існує

    const filePath = path.join(tmpDir, 'test-file.txt');
    await createFile(tmpDir, 'test-file.txt', 'Hello, fs-fixtures!');
    expect(await fs.readFile(filePath, 'utf-8')).toBe('Hello, fs-fixtures!');

    const nestedFilePath = path.join(tmpDir, 'nested/dir/file.txt');
    await createFile(path.join(tmpDir, 'nested/dir'), 'file.txt', 'Nested content');
    expect(await fs.readFile(nestedFilePath, 'utf-8')).toBe('Nested content');
  });

  it('fs-fixtures.ts: повинен створювати структуру файлів', async () => {
    tmpDir = await createTmpDir();
    await createFsStructure(tmpDir, {
      'file1.txt': 'content1',
      'dir1': {
        'file2.txt': 'content2',
        'dir2': {
          'file3.txt': 'content3',
        },
      },
    });

    expect(await fs.readFile(path.join(tmpDir, 'file1.txt'), 'utf-8')).toBe('content1');
    expect(await fs.readFile(path.join(tmpDir, 'dir1/file2.txt'), 'utf-8')).toBe('content2');
    expect(await fs.readFile(path.join(tmpDir, 'dir1/dir2/file3.txt'), 'utf-8')).toBe('content3');
  });

  it('fs-fixtures.ts: повинен змінювати час модифікації файлу', async () => {
    tmpDir = await createTmpDir();
    const filePath = path.join(tmpDir, 'mtime-test.txt');
    await createFile(tmpDir, 'mtime-test.txt', 'mtime content');

    const oldStats = await fs.stat(filePath);
    const newMtime = new Date(oldStats.mtime.getTime() + 5000); // Змінюємо на 5 секунд вперед
    await changeMtime(filePath, newMtime);

    const newStats = await fs.stat(filePath);
    expect(newStats.mtime.getTime()).toBe(newMtime.getTime());
  });

  it('fs-fixtures.ts: повинен створювати симлінки (якщо підтримується)', async () => {
    tmpDir = await createTmpDir();
    const targetPath = path.join(tmpDir, 'target.txt');
    const linkPath = path.join(tmpDir, 'link.txt');

    await createFile(tmpDir, 'target.txt', 'Symlink target content');
    const symlinkCreated = await createSymlink(targetPath, linkPath);

    if (symlinkCreated) {
      expect(await fs.readlink(linkPath)).toBe(targetPath);
      expect(await fs.readFile(linkPath, 'utf-8')).toBe('Symlink target content');
    } else {
      // Якщо симлінк не створено (наприклад, на Windows без прав), тест повинен пройти
      // без помилок, але ми не перевіряємо readlink/readFile
      console.log('Створення симлінка пропущено, оскільки не підтримується або немає прав.');
    }
  });

  it('fs-fixtures.ts: повинен видаляти тимчасові директорії', async () => {
    tmpDir = await createTmpDir();
    await createFile(tmpDir, 'file-to-delete.txt', 'content');
    await removeDir(tmpDir);

    await expect(fs.stat(tmpDir)).rejects.toThrow(/ENOENT/); // Перевіряємо, що директорія не існує
    tmpDir = undefined; // Щоб afterEach не намагався видалити знову
  });
});
