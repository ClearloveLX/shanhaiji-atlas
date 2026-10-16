'use client';

import { useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MAP_SEARCH_PROVIDERS, amapSearchUrl, type MapSearchOptions } from '@/lib/map-links';
import { cn } from '@/lib/utils';

/**
 * 「在地图上找最近的」按钮组（连锁品牌不用维护门店地址的那条路）。
 *
 * 默认直接开地图搜品牌词；用户点「用我的位置」授权定位后，会把坐标带进链接 ——
 * 高德在移动端会据此按距离排序，百度网页版会把中心点移到用户附近。
 * 拿不到定位也不影响使用，只是搜出来的结果不按距离排。
 *
 * 只给高德 / 百度 / Apple 三个出口，和门店导航按钮保持一致（Google 地图国内打不开）。
 */
export default function NearestShopLinks({
  keyword,
  city,
  className,
}: {
  keyword: string;
  city?: string | null;
  className?: string;
}) {
  const [center, setCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const options: MapSearchOptions = { keyword, city: city ?? null, center };

  function locateAndOpen() {
    if (center) {
      window.open(amapSearchUrl(options), '_blank', 'noopener,noreferrer');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('浏览器不支持定位，可直接使用地图搜索');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lng: position.coords.longitude, lat: position.coords.latitude };
        setCenter(next);
        setLocating(false);
        // 定位回调里 window.open 仍算用户手势的延续，浏览器一般放行；被拦了还能手动点地图按钮
        window.open(amapSearchUrl({ ...options, center: next }), '_blank', 'noopener,noreferrer');
      },
      () => {
        setLocating(false);
        toast.error('未获取到位置，可直接使用地图搜索');
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  }

  const approximate = !city && !center;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {MAP_SEARCH_PROVIDERS.map((provider) => (
          <Button key={provider.id} asChild variant="outline" size="sm">
            <a
              href={provider.build(options)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={`在${provider.label}搜索「${keyword}」`}
            >
              {provider.label}
            </a>
          </Button>
        ))}
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={locateAndOpen} disabled={locating} className="self-start">
        {locating ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <LocateFixed className="size-3.5" aria-hidden />
        )}
        {center ? '已按你的位置，重新搜索' : '按我的位置查找'}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {center
          ? '已获取大致位置，打开地图将按距离排序。坐标仅用于拼接链接，不会上传。'
          : approximate
            ? '搜索品牌关键词，在地图 App 内按距离排序即可。'
            : `将在${city}范围内搜索该品牌，在地图 App 内按距离排序即可。`}
      </p>
    </div>
  );
}
