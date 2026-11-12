// HTTP-only entry point in front of Pages. HTTPS stays on the existing Pages site.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== 'ip.xue.moe') return new Response('Not Found\n', { status: 404 });
    const accept = request.headers.get('Accept') || '';
    const plain = !/\btext\/html\b/i.test(accept) && (
      /\btext\/plain\b/i.test(accept) || /^curl\//i.test(request.headers.get('User-Agent') || '')
    );
    if (url.pathname !== '/' || !plain) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Accept, User-Agent, CF-Connecting-IP',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow'
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method Not Allowed\n', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
    }
    const ip = request.headers.get('CF-Connecting-IP');
    return new Response(request.method === 'HEAD' ? null : ip ? `${ip}\n` : 'IP information unavailable\n', {
      status: ip ? 200 : 503, headers
    });
  }
};
