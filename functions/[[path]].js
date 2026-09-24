export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. 将 www.xue.moe 301 永久重定向到根域名 xue.moe
  if (hostname === 'www.xue.moe') {
    url.hostname = 'xue.moe';
    return Response.redirect(url.toString(), 301);
  }

  // 2. duo.xue.moe 映射到 /duo 目录（地址栏不变）
  if (hostname.startsWith('duo.')) {
    if (!url.pathname.startsWith('/duo')) {
      url.pathname = '/duo' + (url.pathname === '/' ? '/index.html' : url.pathname);
    }
    return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
  }

  // 3. dev.xue.moe 映射到 /dev 目录（地址栏不变）
  if (hostname.startsWith('dev.')) {
    if (!url.pathname.startsWith('/dev')) {
      url.pathname = '/dev' + (url.pathname === '/' ? '/index.html' : url.pathname);
    }
    return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
  }

  // 4. tools.xue.moe 映射到 /tools 目录（支持 SPA 路径如 /apps/todo）
  if (hostname.startsWith('tools.')) {
    if (url.pathname.startsWith('/fonts/')) {
      return context.env.ASSETS.fetch(context.request);
    }
    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (!isStaticFile) {
      url.pathname = '/tools/index.html';
    } else if (!url.pathname.startsWith('/tools')) {
      url.pathname = '/tools' + url.pathname;
    }
    return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
  }

  // 根域名 xue.moe 正常访问根目录
  return context.next();
}
