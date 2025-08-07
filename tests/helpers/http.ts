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
  body: string | Buffer;
}

/**
 * Невеликий HTTP-клієнт для виконання запитів.
 * @param options Опції запиту: method, path, headers, body, baseURL.
 * @returns Promise з даними відповіді (statusCode, headers, body).
 */
export function request(options: RequestOptions): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    // If caller provided an absolute path (starts with '/'), use it as raw request path
    // so tests can send traversal-like paths (e.g. '/../index.html') without WHATWG URL normalization.
    // Otherwise, resolve the path against baseURL using URL.
    let hostname = new URL(options.baseURL).hostname
    let port = new URL(options.baseURL).port
    let reqPath: string
    if (options.path.startsWith('/')) {
      reqPath = options.path
    } else {
      const url = new URL(options.path, options.baseURL)
      hostname = url.hostname
      port = url.port
      reqPath = url.pathname + url.search
    }

    const reqOptions: http.RequestOptions = {
      method: options.method,
      headers: options.headers,
      hostname,
      port,
      path: reqPath,
    };

    const req = http.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        let body: string | Buffer = raw;
        const isText =
          ct === '' ||
          ct.startsWith('text/') ||
          ct.includes('charset=') ||
          ct.startsWith('application/json') ||
          ct.startsWith('application/javascript');
        if (isText) {
          body = raw.toString('utf8');
        }
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
