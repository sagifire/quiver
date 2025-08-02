import * as http from 'node:http';

interface RequestOptions {
  method: string;
  path: string;
  headers?: http.OutgoingHttpHeaders;
  body?: string | Buffer;
  baseURL: string;
}

interface ResponseData {
  statusCode?: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/**
 * Невеликий HTTP-клієнт для виконання запитів.
 * @param options Опції запиту: method, path, headers, body, baseURL.
 * @returns Promise з даними відповіді (statusCode, headers, body).
 */
export function request(options: RequestOptions): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, options.baseURL);
    const reqOptions: http.RequestOptions = {
      method: options.method,
      headers: options.headers,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
