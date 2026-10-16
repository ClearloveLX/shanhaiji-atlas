/**
 * 高德地理编码（地址 → 经纬度）。
 *
 * 申请方式：高德开放平台 → 应用管理 → 我的应用 → 添加 Key → 服务平台选「Web 服务」，
 * 然后把 key 填进 .env.local 的 AMAP_KEY。
 *
 * 三条约定：
 *   1. **没配 key 就直接返回 null**，让后台降级成手工填经纬度，不要让整个功能报错
 *   2. 同一个地址 24 小时内只调一次（高德有 QPS 和日限额）；缓存在进程内存里，
 *      重启后失效 —— 对一个人用的后台足够了，不值得为此建张表
 *   3. 失败、返回空结果、超时都返回 null，不抛错
 */

export type GeocodeResult = {
  lng: number;
  lat: number;
  poiId: string | null;
  formattedAddress: string;
  province: string | null;
  city: string | null;
  district: string | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

type CacheEntry = { at: number; value: GeocodeResult | null };

// 挂到 globalThis，避免开发模式热重载后反复请求
type GlobalWithGeocodeCache = typeof globalThis & { __atlasGeocodeCache?: Map<string, CacheEntry> };
const globalForCache = globalThis as GlobalWithGeocodeCache;
const cache = globalForCache.__atlasGeocodeCache ?? new Map<string, CacheEntry>();
globalForCache.__atlasGeocodeCache = cache;

export function hasAmapKey(): boolean {
  return Boolean(process.env.AMAP_KEY);
}

export async function geocodeAddress(address: string, city?: string): Promise<GeocodeResult | null> {
  const key = process.env.AMAP_KEY;
  const trimmed = address.trim();

  if (!key || !trimmed) return null;

  const cacheKey = `${city ?? ''}|${trimmed}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const params = new URLSearchParams({ key, address: trimmed, output: 'JSON' });
    if (city) params.set('city', city);

    const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      cache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }

    const data: unknown = await response.json();
    const result = parseAmapResponse(data);

    cache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  } catch {
    // 超时 / 网络失败都不抛错
    cache.set(cacheKey, { at: Date.now(), value: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseAmapResponse(data: unknown): GeocodeResult | null {
  if (typeof data !== 'object' || data === null) return null;

  const candidate = data as {
    status?: unknown;
    geocodes?: Array<{
      location?: unknown;
      poiid?: unknown;
      formatted_address?: unknown;
      province?: unknown;
      city?: unknown;
      district?: unknown;
    }>;
  };

  if (candidate.status !== '1' || !Array.isArray(candidate.geocodes) || candidate.geocodes.length === 0) return null;

  const first = candidate.geocodes[0];
  const location = typeof first.location === 'string' ? first.location : '';
  const [lngRaw, latRaw] = location.split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);

  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) return null;

  return {
    lng,
    lat,
    poiId: typeof first.poiid === 'string' && first.poiid ? first.poiid : null,
    formattedAddress: typeof first.formatted_address === 'string' ? first.formatted_address : '',
    province: typeof first.province === 'string' && first.province ? first.province : null,
    city: typeof first.city === 'string' && first.city ? first.city : null,
    district: typeof first.district === 'string' && first.district ? first.district : null,
  };
}
