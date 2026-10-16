'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { nearbyBranches } from '@/actions/map';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type MapBranch = {
  id: string;
  entryId: string;
  entryName: string;
  entrySlug: string;
  name: string | null;
  address: string;
  city: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  priceLevel: number | null;
  scenes: string[];
  distanceKm?: number;
};

type AMapMarker = { setMap: (map: unknown) => void; on: (event: string, handler: () => void) => void };
type AMapInstance = { setCenter: (position: [number, number]) => void; setZoomAndCenter: (zoom: number, center: [number, number]) => void; add: (marker: unknown) => void };

type AMapNamespace = {
  Map: new (container: HTMLElement, options: { zoom: number; center: [number, number]; viewMode?: string }) => AMapInstance;
  Marker: new (options: { position: [number, number]; title?: string; label?: { content: string } }) => AMapMarker;
};

declare global {
  interface Window {
    AMap?: AMapNamespace;
    __onAMapLoaded?: () => void;
  }
}

const SCRIPT_ID = 'amap-js-sdk';

function loadAMap(key: string): Promise<AMapNamespace> {
  return new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve(window.AMap);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      window.__onAMapLoaded = () => (window.AMap ? resolve(window.AMap) : reject(new Error('AMap 加载失败')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=__onAMapLoaded`;
    window.__onAMapLoaded = () => (window.AMap ? resolve(window.AMap) : reject(new Error('AMap 加载失败')));
    script.onerror = () => reject(new Error('AMap 脚本加载失败'));
    document.head.appendChild(script);
  });
}

/**
 * 好店地图：左侧浮层筛选 + 地图打点 + 「我在这附近」。
 * 没配 NEXT_PUBLIC_AMAP_JS_KEY 时退化成「列表模式」——筛选和定位照样能用，只是没有地图底图。
 */
export default function ShopMap({ branches, amapKey }: { branches: MapBranch[]; amapKey: string }) {
  const [cities, setCities] = useState<string[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(0);
  const [nearby, setNearby] = useState<MapBranch[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapInstance | null>(null);

  const allCities = useMemo(() => Array.from(new Set(branches.map((branch) => branch.city))), [branches]);
  const allScenes = useMemo(() => Array.from(new Set(branches.flatMap((branch) => branch.scenes))), [branches]);
  // 「我在这附近」接口只回门店本身，场景标签从已有的数据里补回来（同 entryId）
  const sceneLookup = useMemo(() => new Map(branches.map((branch) => [branch.entryId, branch.scenes])), [branches]);

  const filtered = useMemo(() => {
    const source = nearby ?? branches;

    return source.filter((branch) => {
      if (cities.length > 0 && !cities.includes(branch.city)) return false;
      if (scenes.length > 0 && !branch.scenes.some((scene) => scenes.includes(scene))) return false;
      if (maxPrice > 0 && (branch.priceLevel ?? 0) > maxPrice) return false;
      return true;
    });
  }, [branches, cities, maxPrice, nearby, scenes]);

  // 初始化地图（只在配了 key 的时候）
  useEffect(() => {
    if (!amapKey || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    loadAMap(amapKey)
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 11,
          center: [121.4737, 31.2304],
          viewMode: '2D',
        });
        setMapReady(true);
      })
      .catch((error: unknown) => {
        setMapError(error instanceof Error ? error.message : '地图加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, [amapKey]);

  // 打点
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap) return;

    const AMap = window.AMap;
    const markers = filtered
      .filter((branch) => branch.lat != null && branch.lng != null)
      .map((branch) => {
        const marker = new AMap.Marker({
          position: [branch.lng as number, branch.lat as number],
          title: branch.name ? `${branch.entryName}（${branch.name}）` : branch.entryName,
          label: { content: branch.name ? `${branch.entryName} · ${branch.name}` : branch.entryName },
        });
        marker.setMap(mapRef.current);
        return marker;
      });

    return () => {
      for (const marker of markers) marker.setMap(null);
    };
  }, [filtered, mapReady]);

  function locate() {
    if (!navigator.geolocation) {
      toast.error('浏览器不支持定位');
      return;
    }

    startTransition(async () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const result = await nearbyBranches(latitude, longitude);

          if (!result.ok) {
            toast.error(result.error);
            return;
          }

          setNearby(result.items.map((item) => ({ ...item, scenes: sceneLookup.get(item.entryId) ?? [] })));
          mapRef.current?.setZoomAndCenter(13, [longitude, latitude]);
          toast.success(`附近共 ${result.items.length} 家门店`);
        },
        () => toast.error('定位失败，请检查浏览器权限'),
        { timeout: 8000 },
      );
    });
  }

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col lg:flex-row">
      {/* 左侧浮层筛选 + 列表 */}
      <div className="flex w-full flex-col gap-4 overflow-y-auto border-b border-border bg-background p-4 sm:p-5 lg:h-full lg:w-[360px] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold">好店地图</h1>
          <Button type="button" size="sm" variant="outline" onClick={locate} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
            我在这附近
          </Button>
        </div>

        <section aria-labelledby="filter-city">
          <h2 id="filter-city" className="eyebrow">
            城市
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allCities.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => toggle(cities, city, setCities)}
                aria-pressed={cities.includes(city)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
                  cities.includes(city)
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-foreground/20 hover:bg-accent',
                )}
              >
                {city}
              </button>
            ))}
          </div>
        </section>

        {allScenes.length > 0 ? (
          <section aria-labelledby="filter-scene">
            <h2 id="filter-scene" className="eyebrow">
              场景
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allScenes.map((scene) => (
                <button
                  key={scene}
                  type="button"
                  onClick={() => toggle(scenes, scene, setScenes)}
                  aria-pressed={scenes.includes(scene)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
                    scenes.includes(scene)
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-foreground/20 hover:bg-accent',
                  )}
                >
                  {scene}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="filter-price">
          <h2 id="filter-price" className="eyebrow">
            价位（最多）
          </h2>
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2, 3].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setMaxPrice(level)}
                aria-pressed={maxPrice === level}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
                  maxPrice === level
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-foreground/20 hover:bg-accent',
                )}
              >
                {level === 0 ? '不限' : '¥'.repeat(level)}
              </button>
            ))}
          </div>
        </section>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          共 <span className="num">{filtered.length}</span> 家
          {nearby ? '（按距离排序）' : ''}
        </p>

        <ul className="flex flex-col gap-2">
          {filtered.slice(0, 60).map((branch) => (
            <li key={branch.id} className="surface surface-hover p-3">
              <Link href={`/shops/${branch.entrySlug}`} className="text-sm font-medium text-brand hover:underline">
                {branch.entryName}
                {branch.name ? <span className="font-normal text-muted-foreground"> · {branch.name}</span> : null}
              </Link>
              <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                {branch.address}
              </p>
              {typeof branch.distanceKm === 'number' ? (
                <p className="num mt-1 text-xs text-brand">{branch.distanceKm.toFixed(1)} km</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* 右侧地图 */}
      <div className="relative min-h-[320px] flex-1">
        {amapKey ? (
          <div ref={containerRef} className="size-full" role="application" aria-label="好店地图" />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted p-6 text-center">
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              没有配置 <code className="num rounded-md bg-background px-1.5 py-0.5 text-xs">NEXT_PUBLIC_AMAP_JS_KEY</code>
              ，地图底图不显示。左侧的筛选和「我在这附近」照常可用（高德 JS API 需要单独申请一个「Web 端 (JS API)」的 key）。
            </p>
          </div>
        )}

        {mapError ? (
          <p
            role="alert"
            className="absolute left-4 top-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {mapError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
