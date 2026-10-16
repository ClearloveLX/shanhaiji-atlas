'use client';

import { useState } from 'react';
import { Copy, MapPin, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { amapUrl, appleMapUrl, baiduUrl, plainAddress } from '@/lib/map-links';
import { cn } from '@/lib/utils';

export type BranchRow = {
  id: string;
  name: string | null;
  address: string;
  city: string;
  district: string | null;
  phone: string | null;
  hours: string | null;
  priceLevel: number | null;
  lat: number | null;
  lng: number | null;
  isPrimary: boolean;
};

/** 导航按钮组：高德 / 百度 / Apple 地图 / 复制地址 */
export function MapNavButtons({
  brand,
  branch,
  compact = false,
}: {
  brand: string;
  branch: BranchRow;
  compact?: boolean;
}) {
  const title = branch.name ? `${brand}（${branch.name}）` : brand;

  if (branch.lat == null || branch.lng == null) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard
            .writeText(plainAddress({ name: branch.name, address: branch.address }, brand))
            .then(() => toast.success('地址已复制'))
            .catch(() => toast.error('复制失败，手动选一下吧'));
        }}
      >
        <Copy className="size-3.5" aria-hidden />
        复制地址
      </Button>
    );
  }

  const options = { name: title, lng: branch.lng, lat: branch.lat, address: branch.address };

  return (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      <Button asChild variant="outline" size="sm">
        <a href={amapUrl(options)} target="_blank" rel="noopener">
          <Navigation className="size-3.5" aria-hidden />
          高德
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={baiduUrl(options)} target="_blank" rel="noopener">
          百度
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={appleMapUrl(options)} target="_blank" rel="noopener">
          Apple
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="复制地址"
        onClick={() => {
          void navigator.clipboard
            .writeText(plainAddress({ name: branch.name, address: branch.address }, brand))
            .then(() => toast.success('地址已复制'))
            .catch(() => toast.error('复制失败，手动选一下吧'));
        }}
      >
        <Copy className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/** 连锁店的门店列表：按城市分组，顶部城市切换 */
export default function BranchList({ brand, branches, cityLabel }: { brand: string; branches: BranchRow[]; cityLabel: string }) {
  const cities = Array.from(new Set(branches.map((branch) => branch.city)));
  const [city, setCity] = useState(cities[0] ?? '');
  const visible = branches.filter((branch) => branch.city === city);

  if (branches.length === 1) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed">{branches[0].address}</p>
        <MapNavButtons brand={brand} branch={branches[0]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {cities.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCity(item)}
            aria-pressed={city === item}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors duration-150',
              city === item
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border bg-background hover:border-foreground/20 hover:bg-accent',
            )}
          >
            {item}
            <span className="num ml-1 opacity-70">{branches.filter((branch) => branch.city === item).length}</span>
          </button>
        ))}
      </div>

      <ul className="flex flex-col">
        {visible.map((branch) => (
          <li key={branch.id} className="border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {branch.name ?? `${cityLabel}门店`}
              {branch.isPrimary ? (
                <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">主店</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{branch.address}</p>
            {branch.hours ? <p className="mt-1 text-xs text-muted-foreground">营业时间：{branch.hours}</p> : null}
            <div className="mt-2">
              <MapNavButtons brand={brand} branch={branch} compact />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
