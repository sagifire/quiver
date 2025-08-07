import * as http from 'node:http';

/**
 * Фабрика для запуску локального HTTP-сервера для тестів.
 * Підтримує router.handler(req,res) або router.handle(req,res).
 * @param router Екземпляр роутера або mock-об'єкт з handle/handler
 * @returns Об'єкт з baseURL та функцією close.
 */
export function startServer(router: any) {
  const handler =
    typeof router.handler === 'function'
      ? router.handler.bind(router)
      : typeof router.handle === 'function'
      ? router.handle.bind(router)
      : null;

  if (!handler) {
    throw new Error('Router must implement handler(req,res) or handle(req,res)');
  }

  const server = http.createServer((req, res) => {
    // Викликаємо handler; ловимо синхронні помилки та відловлюємо відхилення промісів
    try {
      const maybePromise = handler(req, res);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((err: any) => {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Internal Server Error');
          } else {
            res.destroy(err);
          }
        });
      }
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
      } else {
        res.destroy(err as Error);
      }
    }
  });

  return new Promise<{ baseURL: string; close: () => Promise<void> }>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      let baseURL = '';
      if (address && typeof address === 'object') {
        baseURL = `http://localhost:${address.port}`;
      } else if (typeof address === 'string') {
        baseURL = address;
      }
      resolve({
        baseURL,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) return rejectClose(err);
              resolveClose();
            });
          }),
      });
    });
    server.on('error', (err) => reject(err));
  });
}
