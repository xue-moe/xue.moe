// 安全响应头注入函数
function applySecurityHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self';");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// 辅助函数：安全拉取静态资源，并在服务端内部自动跟随 3xx 重定向，杜绝把内部重定向暴露给客户端引发死循环
async function fetchAsset(context, targetPath) {
  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = targetPath;

  let res = await context.env.ASSETS.fetch(new Request(assetUrl.toString(), context.request));

  // 防御性：若 Cloudflare ASSETS 返回 301/308 重定向（如规范化斜杠），在内部自动跟随获取最终 200 内容
  if (res.status >= 300 && res.status < 400 && res.headers.has('Location')) {
    const loc = res.headers.get('Location');
    const nextUrl = new URL(loc, assetUrl.origin);
    res = await context.env.ASSETS.fetch(new Request(nextUrl.toString(), context.request));
  }
  return res;
}

async function handleRoute(context, url, hostname) {
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
    return fetchAsset(context, url.pathname);
  }

  // 1. duo.xue.moe 映射到 /duo/
  if (hostname.startsWith('duo.')) {
    // 清理旧缓存或多余前缀，重定向回根路径
    if (url.pathname === '/duo' || url.pathname === '/duo/') {
      return Response.redirect(`${url.origin}/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/duo/')) {
      return Response.redirect(`${url.origin}${url.pathname.replace(/^\/duo/, '')}${url.search}`, 301);
    }
    if (url.pathname.startsWith('/fonts/')) {
      return context.env.ASSETS.fetch(context.request);
    }
    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (!isStaticFile) {
      return fetchAsset(context, '/duo/');
    }
    return fetchAsset(context, '/duo' + url.pathname);
  }

  // 2. dev.xue.moe 映射到 /dev/
  if (hostname.startsWith('dev.')) {
    // 清理旧缓存或多余前缀，重定向回根路径
    if (url.pathname === '/dev' || url.pathname === '/dev/') {
      return Response.redirect(`${url.origin}/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/dev/')) {
      return Response.redirect(`${url.origin}${url.pathname.replace(/^\/dev/, '')}${url.search}`, 301);
    }
    if (url.pathname.startsWith('/fonts/')) {
      return context.env.ASSETS.fetch(context.request);
    }
    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (!isStaticFile) {
      return fetchAsset(context, '/dev/');
    }
    return fetchAsset(context, '/dev' + url.pathname);
  }

  // 3. tools.xue.moe 映射到 /tools/（支持 SPA 路径如 /apps/todo）
  if (hostname.startsWith('tools.')) {
    // 关键修复：清除旧重定向残留在浏览器中的 /tools 前缀（如用户访问 https://tools.xue.moe/tools/）
    if (url.pathname === '/tools' || url.pathname === '/tools/') {
      return Response.redirect(`${url.origin}/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/tools/')) {
      return Response.redirect(`${url.origin}${url.pathname.replace(/^\/tools/, '')}${url.search}`, 301);
    }

    // 字体静态资源直通
    if (url.pathname.startsWith('/fonts/')) {
      return context.env.ASSETS.fetch(context.request);
    }

    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    // 所有页面路由内部映射至 '/tools/' 目录，绝不使用 '/tools/index.html'
    if (!isStaticFile) {
      return fetchAsset(context, '/tools/');
    }
    return fetchAsset(context, '/tools' + url.pathname);
  }

  // 根域名 xue.moe 正常访问根目录
  return context.next();
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. 强制 HTTPS 规范化重定向
  const proto = context.request.headers.get('x-forwarded-proto') || (url.protocol ? url.protocol.replace(':', '') : 'https');
  if (proto === 'http') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  // 2. 统一 WWW 规范化重定向（如 www.duo.xue.moe -> duo.xue.moe, www.xue.moe -> xue.moe）
  if (hostname.startsWith('www.')) {
    url.hostname = hostname.replace(/^www\./, '');
    return Response.redirect(url.toString(), 301);
  }

  const res = await handleRoute(context, url, hostname);

  // 3. 对 3xx 重定向响应附加 HSTS 响应头
  if (res.status >= 300 && res.status < 400) {
    const redirectHeaders = new Headers(res.headers);
    redirectHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: redirectHeaders,
    });
  }

  // 4. 对所有正常返回的响应注入全套安全响应头 (HSTS, CSP, X-Frame-Options 等)
  return applySecurityHeaders(res);
}
