const PROXY_PATHS = new Set(['/api', '/uploads', '/robots.txt', '/sitemap.xml']);

function shouldProxy(pathname) {
  return (
    PROXY_PATHS.has(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/')
  );
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { code: 'proxy_error', message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!shouldProxy(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    let origin;
    try {
      origin = new URL(env.API_URL);
    } catch {
      return jsonError(503, 'API_URL is not set to a valid API origin for this Worker.');
    }

    const target = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);
    const clientIp = headers.get('cf-connecting-ip');

    headers.delete('cf-connecting-ip');
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-host');
    headers.delete('x-forwarded-proto');
    if (clientIp) headers.set('x-forwarded-for', clientIp);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    try {
      return await fetch(new Request(target, init));
    } catch {
      return jsonError(502, 'The API is unreachable.');
    }
  },
};
