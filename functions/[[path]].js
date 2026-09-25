// 安全响应头注入函数
function applySecurityHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://github-contributions-api.jogruber.de https://api.github.com https://cloudflareinsights.com; frame-ancestors 'self';");

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
  if (url.pathname === '/api/time') {
    return new Response(JSON.stringify({
      serverTime: Date.now()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (url.pathname === '/api/contributions') {
    try {
      const apiRes = await fetch('https://github-contributions-api.jogruber.de/v4/xue-moe?y=last', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'xue-moe-portal' }
      });
      if (apiRes.ok) {
        const data = await apiRes.text();
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=1800, s-maxage=3600',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (_) {}
  }

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

  if (hostname.startsWith('time.')) {
    if (url.pathname === '/tools' || url.pathname === '/tools/') {
      return Response.redirect(`${url.origin}/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/tools/')) {
      return Response.redirect(`${url.origin}${url.pathname.replace(/^\/tools/, '')}${url.search}`, 301);
    }
    if (url.pathname === '/apps/clock' || url.pathname === '/apps/clock/') {
      return Response.redirect(`${url.origin}/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/fonts/')) {
      return context.env.ASSETS.fetch(context.request);
    }
    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (!isStaticFile) {
      const res = await fetchAsset(context, '/tools/');
      const seoStructuredData = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "name": "time.xue.moe",
            "url": "https://time.xue.moe/",
            "description": "高精度原子对时与任何时区的精确时间校准服务，毫秒级网络时延估算，纯净无广告。"
          },
          {
            "@type": "WebApplication",
            "name": "time.xue.moe 高精度原子时钟",
            "url": "https://time.xue.moe/",
            "applicationCategory": "UtilitiesApplication",
            "operatingSystem": "All",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            }
          },
          {
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "如何通过网络高精度校准本地时钟？",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "time.xue.moe 采用高精度克里斯蒂安网络授时算法（Christian's Algorithm / SNTP），向边缘服务器连续发起探针以精确测算双向往返网络时延（RTT），剔除抖动并计算单程传播偏差，实现与原子钟毫秒级精准对齐。"
                }
              },
              {
                "@type": "Question",
                "name": "为什么 time.xue.moe 的授时精度比传统对时网站更高？",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "因为授时服务直接运行在 Cloudflare 全球边缘 Anycast 计算节点上，网络往返时延极低（通常仅 8~70ms），授时误差上限可收敛至 ±0.035秒以内，且全站无任何广告干扰。"
                }
              },
              {
                "@type": "Question",
                "name": "如何查询世界主要城市与当前时间的时差？",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "页面提供东京、伦敦、巴黎、纽约、旧金山、UTC等世界主要时区实时对照，自动计算夏令时（DST）与本地时差，分钟级精确对齐。"
                }
              }
            ]
          }
        ]
      });

      return new HTMLRewriter()
        .on('title', {
          element(el) {
            el.setInnerContent('标准时间 - 任何时区的精确时间 · 高精度原子对时 · time.xue.moe');
          }
        })
        .on('meta[name="description"]', {
          element(el) {
            el.setAttribute('content', 'time.xue.moe 专注于提供毫秒级高精度标准时间与任何时区的精确时间校准服务，实时估算网络往返延迟，支持世界主要时区对比、全屏时钟与专注倒计时，纯净无广告。');
          }
        })
        .on('link[rel="canonical"]', {
          element(el) {
            el.setAttribute('href', 'https://time.xue.moe/');
          }
        })
        .on('head', {
          element(el) {
            el.append('<meta name="keywords" content="标准时间,当前时间,精确时间,时间校准,原子时钟,现在几点,对时,世界时钟,世界时区,exact time,atomic clock,time.is,world clock,current time">', { html: true });
            el.append('<meta property="og:title" content="标准时间 - 任何时区的精确时间 · 高精度原子对时 · time.xue.moe">', { html: true });
            el.append('<meta property="og:description" content="毫秒级高精度标准时间与任何时区的精确时间校准，实时估算网络往返延迟，纯净无广告。">', { html: true });
            el.append('<meta property="og:url" content="https://time.xue.moe/">', { html: true });
            el.append('<meta property="og:type" content="website">', { html: true });
            el.append('<meta property="og:site_name" content="time.xue.moe">', { html: true });
            el.append('<meta name="twitter:card" content="summary">', { html: true });
            el.append('<meta name="twitter:title" content="标准时间 - 任何时区的精确时间 · 高精度原子对时 · time.xue.moe">', { html: true });
            el.append('<meta name="twitter:description" content="毫秒级高精度标准时间与任何时区的精确时间校准，实时估算网络往返延迟，纯净无广告。">', { html: true });
            el.append(`<script type="application/ld+json">${seoStructuredData}</script>`, { html: true });
          }
        })
        .on('.seg-btn[data-tab="todo"]', {
          element(el) {
            el.setAttribute('class', 'seg-btn');
          }
        })
        .on('.seg-btn[data-tab="clock"]', {
          element(el) {
            el.setAttribute('class', 'seg-btn active');
          }
        })
        .on('#panel-todo', {
          element(el) {
            el.setAttribute('class', 'panel');
          }
        })
        .on('#panel-clock', {
          element(el) {
            el.setAttribute('class', 'panel active');
          }
        })
        .on('#navBrandSub', {
          element(el) {
            el.setInnerContent('time');
          }
        })
        .transform(res);
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
