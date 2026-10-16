'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Flower2,
  Leaf,
  RotateCcw,
  Settings2,
  Sprout,
  TreeDeciduous,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createDefaultConfig,
  cropHint,
  describeRest,
  formatCompactMaturity,
  isInRest,
  LAND_TYPES,
  pad,
  planAll,
  readConfig,
  restBands,
  seasonRange,
  selectedLandTypes,
  trackPercent,
  TRACK_SPAN_HOURS,
  writeConfig,
  type CropPlan,
  type FarmConfig,
  type TimeBand,
} from './lib/plan';

/** 按生长时长挑一个图标，不用 emoji（全站图标一律 lucide） */
const CROP_ICONS: Record<number, LucideIcon> = {
  240: Sprout,
  480: Leaf,
  720: Flower2,
  1440: TreeDeciduous,
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TRACK_TICKS = ['现在', '+12h', '+24h', '+36h', '+48h'];

/**
 * 48 小时时间轴：红条是未来两天里的休息时段。
 * 下面的结果行全以这根轴为参照 —— 看到「明天 03:59」时，能对得上它离红条有多近。
 */
function TimeTrack({ bands }: { bands: TimeBand[] }) {
  return (
    <div className="relative h-3 w-full">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-secondary">
        {bands.map((band) => (
          <span
            key={`${band.from}-${band.to}`}
            className="absolute inset-y-0 bg-destructive/35"
            style={{
              left: `${trackPercent(band.from)}%`,
              width: `${Math.max(0.6, trackPercent(band.to) - trackPercent(band.from))}%`,
            }}
          />
        ))}

        {[25, 50, 75].map((pct) => (
          <span
            key={pct}
            className="absolute inset-y-0 w-px bg-background/70"
            style={{ left: `${pct}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function FarmPlannerTool() {
  const [config, setConfig] = useState(createDefaultConfig);
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** clock 每秒走一次只为显示；now 截到分钟，成熟时刻按它算，避免每秒重算整张表 */
  const [clock, setClock] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setConfig(readConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeConfig(config);
  }, [config, hydrated]);

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setClock(current);

      setNow((prev) => {
        const minute = Math.floor(current.getTime() / 60_000);
        if (prev && Math.floor(prev.getTime() / 60_000) === minute) return prev;
        return new Date(minute * 60_000);
      });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const lands = useMemo(() => selectedLandTypes(config), [config]);
  const plans = useMemo(() => (now ? planAll(config, now) : []), [config, now]);
  const bands = useMemo(
    () => (now ? restBands(now, config.restStart, config.restEnd) : []),
    [config.restEnd, config.restStart, now],
  );

  const ready = plans.filter((plan) => plan.suitableCount === plan.lands.length);
  const risky = plans.filter((plan) => plan.suitableCount < plan.lands.length);
  const inRestNow = clock ? isInRest(clock, config.restStart, config.restEnd) : false;

  function update(patch: Partial<FarmConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  function toggleLand(multiplier: number) {
    setConfig((prev) => ({
      ...prev,
      lands: prev.lands.includes(multiplier)
        ? prev.lands.filter((value) => value !== multiplier)
        : [...prev.lands, multiplier],
    }));
  }

  if (!hydrated || !clock || !now) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-56 animate-pulse rounded-xl border border-border bg-muted" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted" />
        <span className="sr-only">正在按当前时间计算</span>
      </div>
    );
  }

  const dateLabel = `${clock.getFullYear()}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())} 星期${
    WEEKDAYS[clock.getDay()]
  }`;
  const timeLabel = `${pad(clock.getHours())}:${pad(clock.getMinutes())}`;
  const secondsLabel = pad(clock.getSeconds());

  function renderRows(list: CropPlan[], currentNow: Date) {
    return (
      <ul className="divide-y divide-border">
        {list.map((plan) => {
          const Icon = CROP_ICONS[plan.crop.baseMinutes] ?? Sprout;

          return (
            <li key={plan.crop.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-5">
              <div className="flex min-w-0 items-center gap-2.5 sm:w-40 sm:shrink-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" title={cropHint(plan.crop)}>
                    {plan.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {seasonRange(plan.crop)}
                  </span>
                </span>
              </div>

              {/* 一块地一行：左边土地、中间成熟时刻、右边结论。
                  手机上时刻会自己折行，不会再挤成参差不齐的小药丸 */}
              <ul className="flex min-w-0 flex-1 flex-col divide-y divide-border/60">
                {plan.lands.map((landPlan) => (
                  <li
                    key={landPlan.land.multiplier}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', landPlan.land.dot)}
                        aria-hidden
                      />
                      {landPlan.land.short}
                    </span>

                    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                      {landPlan.maturities.map((maturity) => (
                        <span
                          key={maturity.season}
                          className="flex items-baseline gap-1.5 whitespace-nowrap"
                        >
                          <span className="w-9 shrink-0 text-[11px] text-muted-foreground">
                            {maturity.season === 1 ? '第一季' : '第二季'}
                          </span>
                          <span
                            className={cn(
                              'num tabular-nums text-sm',
                              maturity.inRest && 'text-destructive',
                            )}
                          >
                            {formatCompactMaturity(maturity.at, currentNow)}
                          </span>
                        </span>
                      ))}
                    </span>

                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium',
                        landPlan.suitable ? 'text-brand' : 'text-destructive',
                      )}
                    >
                      {landPlan.suitable ? '合适' : '不合适'}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── 现在几点 + 未来 48 小时的休息时段 ─────────── */}
      <section className="surface topo relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-brand/10 blur-3xl"
        />

        <div className="relative flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="eyebrow">现在</p>
            <p className="num text-3xl leading-none font-semibold">
              {timeLabel}
              <span className="text-lg font-normal text-muted-foreground">:{secondsLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>

          <div className="flex items-center gap-2">
            {inRestNow ? <Badge variant="destructive">休息中</Badge> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 sm:h-8"
              aria-expanded={settingsOpen}
              aria-controls="farm-settings"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings2 className="size-4" aria-hidden />
              设置
              <ChevronDown
                className={cn('size-3.5 transition-transform duration-150', settingsOpen && 'rotate-180')}
                aria-hidden
              />
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <TimeTrack bands={bands} />
          <div className="num flex justify-between text-[11px] text-muted-foreground">
            {TRACK_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-4 shrink-0 rounded-full bg-destructive/35" aria-hidden />
            {describeRest(config.restStart, config.restEnd)}
          </p>
        </div>

        {lands.length > 0 ? (
          <div className="relative mt-4 flex items-baseline gap-3 border-t border-border pt-3">
            <span className="num shrink-0 text-3xl leading-none font-semibold text-brand">
              {ready.length}
            </span>
            <span className="min-w-0 text-sm leading-relaxed">
              种作物在 {lands.length} 种土地上都不会吵醒你
              {risky.length > 0 ? (
                <span className="text-muted-foreground">，另外 {risky.length} 种会</span>
              ) : (
                <span className="text-muted-foreground">，全都可以种</span>
              )}
            </span>
          </div>
        ) : null}
      </section>

      {/* ── 设置 ─────────────────────────────── */}
      {settingsOpen ? (
        <section id="farm-settings" className="surface flex flex-col gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rest-start">休息开始</Label>
              <select
                id="rest-start"
                value={config.restStart}
                onChange={(event) => update({ restStart: Number(event.target.value) })}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:h-9"
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {pad(hour)}:00
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rest-end">休息结束</Label>
              <select
                id="rest-end"
                value={config.restEnd}
                onChange={(event) => update({ restEnd: Number(event.target.value) })}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:h-9"
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {pad(hour)}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{describeRest(config.restStart, config.restEnd)}</p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">拥有的土地</legend>
            <div className="flex flex-wrap gap-2">
              {LAND_TYPES.map((land) => (
                <label
                  key={land.multiplier}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[13px] transition-colors duration-150 has-[:checked]:border-brand/40 has-[:checked]:bg-brand-soft"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    checked={config.lands.includes(land.multiplier)}
                    onChange={() => toggleLand(land.multiplier)}
                  />
                  <span className={cn('size-2 rounded-full', land.dot)} aria-hidden />
                  {land.name}
                  <span className="text-xs text-muted-foreground">{land.speed}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              只勾自己真的有的地，没勾的不会出现在下面的结果里。
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 sm:h-8"
              onClick={() => setConfig(createDefaultConfig())}
            >
              <RotateCcw className="size-4" aria-hidden />
              恢复默认（00:00–06:00 · 三种土地）
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 sm:h-8"
              onClick={() => setSettingsOpen(false)}
            >
              收起
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── 结果 ─────────────────────────────── */}
      {lands.length === 0 ? (
        <p className="surface px-4 py-10 text-center text-sm text-muted-foreground">
          还没勾选土地。在「设置」里至少选一种，才会开始算时间。
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="surface flex flex-col gap-2 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">一季和两季怎么分</h2>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 font-medium text-foreground">
                  第一季
                </span>
                <span>一季作物：只有第一季。第一季收完，这块地就空出来了，所以只有一个成熟时刻。</span>
              </li>
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 font-medium text-brand">
                  第一季 + 第二季
                </span>
                <span>两季作物：第一季收完，同一块地接着长第二季（只要一半时间），所以两个时刻都写。</span>
              </li>
            </ul>
          </section>

          <section className="surface flex flex-col gap-1 px-4 py-2 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-brand" aria-hidden />
                可以睡整觉的
                <span className="num text-xs font-normal text-muted-foreground">{ready.length} 种</span>
              </h2>
              <p className="text-xs text-muted-foreground">每一块地上的成熟时刻都避开了休息时段</p>
            </div>

            {ready.length > 0 ? (
              renderRows(ready, now)
            ) : (
              <p className="my-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                这个时段里没有一种作物能完全避开休息时段。要么换短一点的作物，要么把休息时段调窄一点。
              </p>
            )}
          </section>

          {risky.length > 0 ? (
            <section className="surface flex flex-col gap-1 px-4 py-2 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  会撞上休息时段的
                  <span className="num text-xs font-normal text-muted-foreground">{risky.length} 种</span>
                </h2>
                <p className="text-xs text-muted-foreground">红字那个时刻会撞上休息时段，得半夜爬起来收</p>
              </div>

              {renderRows(risky, now)}
            </section>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {LAND_TYPES.map((land) => (
            <span key={land.multiplier} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', land.dot)} aria-hidden />
              {land.name} · {land.speed}
            </span>
          ))}
        </div>
        <p className="leading-relaxed">
          时间轴从「现在」往后铺 {TRACK_SPAN_HOURS} 小时，红条是这 {TRACK_SPAN_HOURS} 小时里的休息时段。
          一块地上只要有一个成熟时刻落进红条，这块地就标「不合适」；休息时段填成同一个小时就是不设限制。
        </p>
      </div>
    </div>
  );
}
