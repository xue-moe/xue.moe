const CONTRIBUTIONS_CACHE_KEY = 'github-contributions:last-year:v1';
const CONTRIBUTIONS_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CONTRIBUTIONS_COLD_RETRY_TTL_SECONDS = 15 * 60;
const CONTRIBUTIONS_UPSTREAM_URL = 'https://github-contributions-api.jogruber.de/v4/xue-moe?y=last';
const SITEMAP_LAST_MODIFIED = '2026-09-29';
const INDEXABLE_SITE_URLS = {
  'xue.moe': ['https://xue.moe/'],
  'duo.xue.moe': ['https://duo.xue.moe/'],
  'tools.xue.moe': ['https://tools.xue.moe/'],
  'time.xue.moe': ['https://time.xue.moe/']
};

function seoFileResponse(hostname, pathname) {
  const siteUrls = INDEXABLE_SITE_URLS[hostname] || [];

  if (pathname === '/robots.txt') {
    const sitemapLine = siteUrls.length
      ? `\nSitemap: https://${hostname}/sitemap.xml`
      : '';
    return new Response(`User-agent: *\nAllow: /\nDisallow: /api/${sitemapLine}\n`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400'
      }
    });
  }

  if (!siteUrls.length) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }

  const entries = siteUrls.map((siteUrl) => `  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${SITEMAP_LAST_MODIFIED}</lastmod>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
}

function contributionsResponse(data, cacheControl = 'public, max-age=300, s-maxage=300') {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

function contributionsUnavailable(status = 503) {
  return new Response(JSON.stringify({ error: 'Contributions are temporarily unavailable.' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

function getUtcPlusFourVisitorDay(now = Date.now()) {
  const utcPlusFourNow = new Date(now + 4 * 60 * 60 * 1000);
  // Visitor days reset at 00:00 UTC+04:00 (04:00 in Shanghai, UTC+08:00).
  const nextResetUtc = Date.UTC(
    utcPlusFourNow.getUTCFullYear(),
    utcPlusFourNow.getUTCMonth(),
    utcPlusFourNow.getUTCDate() + 1
  ) - 4 * 60 * 60 * 1000;
  return {
    day: utcPlusFourNow.toISOString().slice(0, 10),
    secondsUntilReset: Math.max(1, Math.ceil((nextResetUtc - now) / 1000))
  };
}

// 安全响应头注入函数
function applySecurityHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'self';");

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
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  }

  if (url.pathname === '/api/visit') {
    const { day: today, secondsUntilReset } = getUtcPlusFourVisitorDay();
    const cookieHeader = context.request.headers.get('Cookie') || '';
    const visitedToday = cookieHeader.split(';').some((cookie) => {
      const [name, ...valueParts] = cookie.trim().split('=');
      return name === `xue_v_${today}` && valueParts.join('=') === '1';
    });

    if (!context.env || !context.env.KV) {
      console.error(JSON.stringify({ event: 'visitor_stats_kv_binding_missing' }));
      return new Response(JSON.stringify({ error: 'Visitor counts are temporarily unavailable.' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }

    try {
      const todayKey = `v_day_${today}`;
      const totalKey = 'v_total';
      const parseCount = (value) => {
        const count = Number.parseInt(value || '0', 10);
        return Number.isSafeInteger(count) && count >= 0 ? count : 0;
      };

      let todayCount;
      let totalCount;
      if (!visitedToday) {
        todayCount = parseCount(await context.env.KV.get(todayKey)) + 1;
        await context.env.KV.put(todayKey, String(todayCount), { expirationTtl: 86400 * 7 });

        totalCount = parseCount(await context.env.KV.get(totalKey)) + 1;
        await context.env.KV.put(totalKey, String(totalCount));
      } else {
        todayCount = parseCount(await context.env.KV.get(todayKey));
        totalCount = parseCount(await context.env.KV.get(totalKey));
      }

      const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex, nofollow'
      });

      if (!visitedToday) {
        headers.set('Set-Cookie', `xue_v_${today}=1; Path=/; Max-Age=${secondsUntilReset}; SameSite=Lax; Secure; HttpOnly`);
      }

      return new Response(JSON.stringify({
        todayCount,
        totalCount,
        today,
        isNewVisit: !visitedToday
      }), { status: 200, headers });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'visitor_stats_kv_error',
        message: error instanceof Error ? error.message : String(error)
      }));
      return new Response(JSON.stringify({ error: 'Visitor counts are temporarily unavailable.' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }
  }

  if (url.pathname === '/api/contributions') {
    if (context.request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Allow': 'GET', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }

    if (!context.env || !context.env.KV) {
      console.error(JSON.stringify({ event: 'contributions_cache_binding_missing' }));
      return contributionsUnavailable();
    }

    let cachedRecord;
    try {
      cachedRecord = await context.env.KV.get(CONTRIBUTIONS_CACHE_KEY, 'json');
    } catch (error) {
      console.error(JSON.stringify({
        event: 'contributions_cache_read_error',
        message: error instanceof Error ? error.message : String(error)
      }));
      return contributionsUnavailable();
    }

    if (cachedRecord && cachedRecord.data && Array.isArray(cachedRecord.data.contributions)) {
      return contributionsResponse(cachedRecord.data);
    }

    try {
      const retryCooldown = await context.env.KV.get(`${CONTRIBUTIONS_CACHE_KEY}:retry`);
      if (retryCooldown) return contributionsUnavailable();
    } catch (error) {
      console.error(JSON.stringify({
        event: 'contributions_retry_marker_read_error',
        message: error instanceof Error ? error.message : String(error)
      }));
      return contributionsUnavailable();
    }

    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), 5000);
    let upstreamStatus = null;
    try {
      const apiRes = await fetch(CONTRIBUTIONS_UPSTREAM_URL, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'xue-moe-portal' },
        signal: timeout.signal,
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: {
            '200-299': 1800,
            '400-599': 0
          }
        }
      });

      upstreamStatus = apiRes.status;
      if (!apiRes.ok) throw new Error(`Upstream returned ${apiRes.status}`);

      const data = await apiRes.json();
      if (!data || !Array.isArray(data.contributions)) {
        throw new Error('Upstream returned an invalid contributions payload');
      }

      try {
        await context.env.KV.put(CONTRIBUTIONS_CACHE_KEY, JSON.stringify({
          fetchedAt: new Date().toISOString(),
          data
        }), { expirationTtl: CONTRIBUTIONS_CACHE_TTL_SECONDS });
        await context.env.KV.delete(`${CONTRIBUTIONS_CACHE_KEY}:retry`);
      } catch (error) {
        console.error(JSON.stringify({
          event: 'contributions_cache_write_error',
          message: error instanceof Error ? error.message : String(error)
        }));
      }

      return contributionsResponse(data);
    } catch (error) {
      try {
        await context.env.KV.put(`${CONTRIBUTIONS_CACHE_KEY}:retry`, '1', {
          expirationTtl: CONTRIBUTIONS_COLD_RETRY_TTL_SECONDS
        });
      } catch (cacheError) {
        console.error(JSON.stringify({
          event: 'contributions_retry_marker_write_error',
          message: cacheError instanceof Error ? cacheError.message : String(cacheError)
        }));
      }
      console.error(JSON.stringify({
        event: 'contributions_upstream_error',
        status: upstreamStatus,
        message: error instanceof Error ? error.message : String(error)
      }));
      return contributionsUnavailable(502);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
    return seoFileResponse(hostname, url.pathname);
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
            "description": "通过多次网络请求估算本地设备与服务器的时间差，并提供世界主要时区时钟。"
          },
          {
            "@type": "WebApplication",
            "name": "time.xue.moe 标准时间与世界时钟",
            "url": "https://time.xue.moe/",
            "applicationCategory": "UtilitiesApplication",
            "operatingSystem": "All",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            }
          }
        ]
      });

      return new HTMLRewriter()
        .on('title', {
          element(el) {
            el.setInnerContent('标准时间与世界时钟 · 网络时间偏差估算 · time.xue.moe');
          }
        })
        .on('meta[name="description"]', {
          element(el) {
            el.setAttribute('content', '查看世界主要城市的当前时间与时区。time.xue.moe 通过多次网络请求估算本地设备与服务器的时间差，并显示测量的往返延迟。');
          }
        })
        .on('link[rel="canonical"]', {
          element(el) {
            el.setAttribute('href', 'https://time.xue.moe/');
          }
        })
        .on('meta[property="og:title"]', {
          element(el) {
            el.setAttribute('content', '标准时间与世界时钟 · 网络时间偏差估算 · time.xue.moe');
          }
        })
        .on('meta[property="og:description"]', {
          element(el) {
            el.setAttribute('content', '查看世界主要城市的当前时间与时区。通过多次网络请求估算本地设备与服务器的时间差，并显示测量的往返延迟。');
          }
        })
        .on('meta[property="og:url"]', {
          element(el) {
            el.setAttribute('content', 'https://time.xue.moe/');
          }
        })
        .on('meta[property="og:site_name"]', {
          element(el) {
            el.setAttribute('content', 'time.xue.moe');
          }
        })
        .on('meta[property="og:image"]', {
          element(el) {
            el.setAttribute('content', 'https://time.xue.moe/images/og/time.png');
          }
        })
        .on('meta[property="og:image:alt"]', {
          element(el) {
            el.setAttribute('content', '标准时间与世界时钟及主要城市时区');
          }
        })
        .on('meta[name="twitter:image"]', {
          element(el) {
            el.setAttribute('content', 'https://time.xue.moe/images/og/time.png');
          }
        })
        .on('meta[name="twitter:image:alt"]', {
          element(el) {
            el.setAttribute('content', '标准时间与世界时钟及主要城市时区');
          }
        })
        .on('meta[name="twitter:title"]', {
          element(el) {
            el.setAttribute('content', '标准时间与世界时钟 · 网络时间偏差估算 · time.xue.moe');
          }
        })
        .on('meta[name="twitter:description"]', {
          element(el) {
            el.setAttribute('content', '查看世界主要城市的当前时间与时区。通过多次网络请求估算本地设备与服务器的时间差。');
          }
        })
        .on('head', {
          element(el) {
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

  if (hostname === 'xue-moe.pages.dev') {
    return Response.redirect(`https://xue.moe${url.pathname}${url.search}`, 301);
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
