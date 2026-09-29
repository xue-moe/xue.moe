const UPSTREAM_URL = 'https://github-contributions-api.jogruber.de/v4/xue-moe?y=last';
const CACHE_KEY = 'github-contributions:last-year:v1';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

async function refreshContributions(env, cron) {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 8000);
  let upstreamStatus = null;

  try {
    const response = await fetch(UPSTREAM_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'xue-moe-contributions-cache'
      },
      signal: timeout.signal,
      cf: {
        cacheTtlByStatus: { '200-599': -1 }
      }
    });

    upstreamStatus = response.status;
    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.contributions)) {
      throw new Error('Upstream returned an invalid contributions payload');
    }

    const fetchedAt = new Date().toISOString();
    await env.KV.put(CACHE_KEY, JSON.stringify({ fetchedAt, data }), {
      expirationTtl: CACHE_TTL_SECONDS
    });

    console.log(JSON.stringify({
      event: 'contributions_cache_refreshed',
      cron,
      fetchedAt,
      contributionDays: data.contributions.length
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'contributions_cache_refresh_failed',
      cron,
      status: upstreamStatus,
      message: error instanceof Error ? error.message : String(error)
    }));
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  async scheduled(controller, env) {
    await refreshContributions(env, controller.cron);
  }
};
