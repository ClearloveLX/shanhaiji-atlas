import type { EntryBranch } from '@/db/schema';

/**
 * 导航 URL 拼接。
 *
 * 坐标系提醒：高德/腾讯用 GCJ-02，百度用 BD-09，Apple/Google 用 WGS-84。
 * 地理编码拿到的一般是 GCJ-02，所以百度链接里带 coord_type=gcj02 让它自己转，
 * **不要自己写坐标转换**。
 */

export type MapLinkOptions = {
  name: string;
  lng: number;
  lat: number;
  address?: string | null;
};

export function amapUrl({ name, lng, lat }: MapLinkOptions): string {
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name)}&src=shanhaiji`;
}

export function baiduUrl({ name, lng, lat, address }: MapLinkOptions): string {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    title: name,
    content: address ?? '',
    output: 'html',
    coord_type: 'gcj02',
  });
  return `https://api.map.baidu.com/marker?${params.toString()}`;
}

export function appleMapUrl({ name, lng, lat }: MapLinkOptions): string {
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}`;
}

/** 复制地址用的纯文本兜底 */
export function plainAddress(branch: Pick<EntryBranch, 'name' | 'address'>, brand: string): string {
  const title = branch.name ? `${brand}（${branch.name}）` : brand;
  return `${title} ${branch.address}`;
}

/** 高德静态地图（详情页嵌一张图，不加载 JS SDK、不吃配额） */
export function amapStaticMapUrl(options: MapLinkOptions & { zoom?: number; size?: string; key: string }): string | null {
  const { lng, lat, key, zoom = 16, size = '600*300', name } = options;
  if (!key) return null;

  const params = new URLSearchParams({
    location: `${lng},${lat}`,
    zoom: String(zoom),
    size,
    markers: `mid,,A:${lng},${lat}`,
    key,
  });

  if (name) params.set('name', name);

  return `https://restapi.amap.com/v3/staticmap?${params.toString()}`;
}

export function hasCoords(branch: Pick<EntryBranch, 'lat' | 'lng'>): branch is Pick<EntryBranch, 'lat' | 'lng'> & { lat: number; lng: number } {
  return typeof branch.lat === 'number' && typeof branch.lng === 'number';
}

/* ────────────────────────── 地图搜索（不依赖任何地址数据） ────────────────────────── */

/**
 * 连锁品牌不用维护门店地址：给一个搜索词，剩下的交给用户手机里的地图 App ——
 * 它能按用户当前定位排距离，比我们维护几十条门店准得多，也不会过期。
 *
 * 参数里的 center 来自浏览器定位（可选）：
 *   · 高德：center 只在移动端生效，用来把结果按距离排；桌面端靠 city 收范围
 *   · 百度：/@lng,lat,zoom 是网页版的中心点写法
 *   · Apple：near 给一个城市名做上下文；Google：query 就是纯搜索
 */
export type MapSearchOptions = {
  /** 搜索词：一般取 entries.map_query，留空则取 entries.name */
  keyword: string;
  /** 已知城市（有门店时取主店城市），没有就不传 */
  city?: string | null;
  /** 用户当前位置（浏览器定位授权后才有） */
  center?: { lng: number; lat: number } | null;
};

/** 高德搜索（URI API，不需要 key，移动端能直接唤起 App） */
export function amapSearchUrl({ keyword, city, center }: MapSearchOptions): string {
  const params = new URLSearchParams({ keyword, view: 'map', callnative: '1', src: 'shanhaiji' });
  if (city) params.set('city', city);
  if (center) params.set('center', `${center.lng},${center.lat}`);
  return `https://uri.amap.com/search?${params.toString()}`;
}

/** 百度地图网页版搜索 */
export function baiduSearchUrl({ keyword, center }: MapSearchOptions): string {
  const base = `https://map.baidu.com/search/${encodeURIComponent(keyword)}`;
  return center ? `${base}/@${center.lng},${center.lat},13z` : base;
}

/** Apple 地图（iOS / macOS 自带） */
export function appleSearchUrl({ keyword, city }: MapSearchOptions): string {
  const params = new URLSearchParams({ q: keyword });
  if (city) params.set('near', city);
  return `https://maps.apple.com/?${params.toString()}`;
}

/**
 * 只放这三个：和门店导航按钮保持一致。
 * 不加 Google 地图 —— 国内打不开，而且它对中国 POI 的数据本来就差。
 */
export const MAP_SEARCH_PROVIDERS = [
  { id: 'amap', label: '高德地图', build: amapSearchUrl },
  { id: 'baidu', label: '百度地图', build: baiduSearchUrl },
  { id: 'apple', label: 'Apple 地图', build: appleSearchUrl },
] as const;

export type MapSearchProviderId = (typeof MAP_SEARCH_PROVIDERS)[number]['id'];

/** 搜索词：map_query 优先，其次条目名 */
export function mapSearchKeyword(name: string, mapQuery?: string | null): string {
  return mapQuery?.trim() || name.trim();
}
