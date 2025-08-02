import * as http from 'node:http';

/**
 * Фабрика для запуску локального HTTP-сервера для тестів.
 * @param router Екземпляр роутера, який буде обробляти запити.
 * @returns Об'єкт з baseURL та функцією close.
 */
export function startServer(router: any) { // TODO: Замінити any на реальний тип Router
  const server = http.createServer(async (req, res) => {
    // Тут буде логіка обробки запиту роутером
    // Наразі просто заглушка
    await router.handle(req, res);
  });

  let baseURL = '';

  return new Promise<{ baseURL: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, () => { // 0 означає, що буде використано випадковий вільний порт
      const address = server.address();
      if (address && typeof address === 'object') {
        baseURL = `http://localhost:${address.port}`;
      } else if (typeof address === 'string') {
        baseURL = address;
      }
      resolve({
        baseURL,
        close: () => {
          return new Promise((resolveClose) => {
            server.close(() => {
              resolveClose();
            });
          });
        },
      });
    });
  });
}
