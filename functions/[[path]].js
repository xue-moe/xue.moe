export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. 将 www.xue.moe 301 永久重定向到根域名 xue.moe
  if (hostname === 'www.xue.moe') {
    url.hostname = 'xue.moe';
    return Response.redirect(url.toString(), 301);
  }

  // 辅助函数：安全拉取静态资源，并在服务端内部自动跟随 3xx 重定向，杜绝把内部重定向暴露给客户端引发死循环
  async function fetchAsset(targetPath) {
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

  // 2. duo.xue.moe 映射到 /duo/
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
      return fetchAsset('/duo/');
    }
    return fetchAsset('/duo' + url.pathname);
  }

  // 3. dev.xue.moe 映射到 /dev/
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
      return fetchAsset('/dev/');
    }
    return fetchAsset('/dev' + url.pathname);
  }

  // 4. tools.xue.moe 映射到 /tools/（支持 SPA 路径如 /apps/todo）
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
      return fetchAsset('/tools/');
    }
    return fetchAsset('/tools' + url.pathname);
  }

  // 根域名 xue.moe 正常访问根目录
  return context.next();
}
