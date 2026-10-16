/**
 * 「护肝农场」的纯逻辑：休息时段判定、按土地提速算成熟时刻、配置的缓存读写。
 *
 * 不依赖 React，也不在模块作用域碰 window —— 存储函数只在 useEffect 里被调用。
 */

export type LandType = {
  /** 提速系数：0.9 就是快 10% */
  multiplier: number;
  name: string;
  /** 紧凑写法，用在结果行的小标签里 */
  short: string;
  /** 速度说明，直接展示给用户 */
  speed: string;
  /** 列表里那个小圆点的 Tailwind 类 */
  dot: string;
};

/** 三种土地，系数取自游戏里的实际提速 */
export const LAND_TYPES: readonly LandType[] = [
  { multiplier: 1, name: '普通土地', short: '普通', speed: '原速', dot: 'bg-stone-400' },
  {
    multiplier: 0.9,
    name: '黑土地',
    short: '黑土',
    speed: '提速 10%',
    dot: 'bg-neutral-700 dark:bg-neutral-300',
  },
  { multiplier: 0.8, name: '金土地', short: '金土', speed: '提速 20%', dot: 'bg-amber-400' },
];

export type Crop = {
  id: string;
  /** 单季基础生长时长（分钟），不含土地提速 */
  baseMinutes: number;
  seasons: 1 | 2;
};

/** 4 / 8 / 12 / 24 小时 × 一季 / 两季 */
export const CROPS: readonly Crop[] = [
  { id: '4h-1', baseMinutes: 240, seasons: 1 },
  { id: '4h-2', baseMinutes: 240, seasons: 2 },
  { id: '8h-1', baseMinutes: 480, seasons: 1 },
  { id: '8h-2', baseMinutes: 480, seasons: 2 },
  { id: '12h-1', baseMinutes: 720, seasons: 1 },
  { id: '12h-2', baseMinutes: 720, seasons: 2 },
  { id: '24h-1', baseMinutes: 1440, seasons: 1 },
  { id: '24h-2', baseMinutes: 1440, seasons: 2 },
];

export type FarmConfig = {
  /** 休息时段开始的小时，0–23 */
  restStart: number;
  /** 休息时段结束的小时，0–23 */
  restEnd: number;
  /** 拥有的土地，存的是提速系数 */
  lands: number[];
};

export const STORAGE_KEY = 'atlas.farm-planner.v1';

export function createDefaultConfig(): FarmConfig {
  return { restStart: 0, restEnd: 6, lands: LAND_TYPES.map((land) => land.multiplier) };
}

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 这个时刻是否落在休息时段里。
 * - `start === end` 视为「不设休息时段」，全天都算合适
 * - `start > end` 是跨天时段，比如 22:00–07:00
 */
export function isInRest(date: Date, start: number, end: number): boolean {
  if (start === end) return false;

  const hour = date.getHours();
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function describeRest(start: number, end: number): string {
  if (start === end) return '没有设置休息时段，任何成熟时间都算合适';

  const range = `${pad(start)}:00 – ${pad(end)}:00`;
  return start > end ? `${range} 不可打扰（跨天）` : `${range} 不可打扰`;
}

/** 生长时长：4 小时 / 3 小时 36 分 / 24 分 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} 分`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 成熟时刻：今天 16:30 / 明天 09:00 / 10 月 20 日 08:00 */
export function formatMaturity(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);

  if (days <= 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  if (days === 2) return `后天 ${time}`;
  return `${at.getMonth() + 1} 月 ${at.getDate()} 日 ${time}`;
}

/** 结果行里用的紧凑写法：今天只写 17:59，明天起才带日期 */
export function formatCompactMaturity(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);

  if (days <= 0) return time;
  if (days === 1) return `明天 ${time}`;
  if (days === 2) return `后天 ${time}`;
  return `${at.getMonth() + 1}/${at.getDate()} ${time}`;
}

export type SeasonMaturity = {
  /** 第几季，从 1 开始 */
  season: number;
  /** 这一季的生长时长（分钟，已含土地提速） */
  minutes: number;
  at: Date;
  inRest: boolean;
};

export type LandPlan = {
  land: LandType;
  /** 所有季的成熟时刻都避开休息时段才算合适 */
  suitable: boolean;
  maturities: SeasonMaturity[];
};

export type CropPlan = {
  crop: Crop;
  name: string;
  lands: LandPlan[];
  suitableCount: number;
};

/** 游戏里的叫法：一季 / 两季 */
export function seasonTerm(crop: Crop): string {
  return crop.seasons === 1 ? '一季' : '两季';
}

/**
 * 这行会出现哪些成熟时刻，直接照游戏里的叫法写。
 * 一季 →「第一季」；两季 →「第一季 + 第二季」。
 * 不写「收一次 / 收两次」：那是我自己发明的说法，看不出跟下面两行是什么关系。
 */
export function seasonRange(crop: Crop): string {
  return crop.seasons === 1 ? '第一季' : '第一季 + 第二季';
}

/** 行标题只留时长，季数交给 seasonRange 说，免得标题里塞两件事 */
export function cropName(crop: Crop): string {
  return `${crop.baseMinutes / 60} 小时`;
}

/** 悬停时给完整解释，把游戏术语和实际行为连起来 */
export function cropHint(crop: Crop): string {
  return crop.seasons === 1
    ? '一季作物：只有第一季。第一季收完，这块地就空出来了，所以只有一个成熟时刻。'
    : '两季作物：第一季收完，同一块地接着长第二季，第二季只要一半时间，所以有两个成熟时刻。';
}

/** 这块地上每一季实际要长多久：一季 →「8 小时」，两季 →「8 小时 + 4 小时」 */
export function seasonLengths(crop: Crop, multiplier: number): number[] {
  const total = Math.round(crop.baseMinutes * multiplier);
  return crop.seasons === 1 ? [total] : [total, Math.round(total / 2)];
}

/* ────────────────────── 48 小时时间轴 ────────────────────── */

/** 时间轴默认铺开的时长（小时）。24 小时两季作物最坏情况是 36 小时，48 装得下 */
export const TRACK_SPAN_HOURS = 48;

/** 一段区间，单位是「相对 now 的分钟数」 */
export type TimeBand = { from: number; to: number };

export function trackMinutes(spanHours = TRACK_SPAN_HOURS): number {
  return spanHours * 60;
}

export function minutesFrom(now: Date, at: Date): number {
  return (at.getTime() - now.getTime()) / 60_000;
}

export function trackPercent(minutes: number, spanHours = TRACK_SPAN_HOURS): number {
  const ratio = minutes / trackMinutes(spanHours);
  return Math.min(100, Math.max(0, ratio * 100));
}

/**
 * 未来 spanHours 小时里，落在休息时段的那几段。
 * 从「昨天」开始扫，跨天时段（22:00–07:00）才不会漏掉今天凌晨那一段。
 */
export function restBands(
  now: Date,
  start: number,
  end: number,
  spanHours = TRACK_SPAN_HOURS,
): TimeBand[] {
  if (start === end) return [];

  const t0 = now.getTime();
  const t1 = t0 + spanHours * 3_600_000;
  const bands: TimeBand[] = [];

  for (let offset = -1; offset <= Math.ceil(spanHours / 24) + 1; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
    const from = day + start * 3_600_000;
    const to = day + (start < end ? end : end + 24) * 3_600_000;

    const clippedFrom = Math.max(from, t0);
    const clippedTo = Math.min(to, t1);
    if (clippedTo > clippedFrom) {
      bands.push({ from: (clippedFrom - t0) / 60_000, to: (clippedTo - t0) / 60_000 });
    }
  }

  return bands;
}

export function planCrop(
  crop: Crop,
  lands: readonly LandType[],
  config: FarmConfig,
  now: Date,
): CropPlan {
  const landPlans: LandPlan[] = lands.map((land) => {
    const total = Math.round(crop.baseMinutes * land.multiplier);
    const maturities: SeasonMaturity[] = [];
    let elapsed = 0;

    for (let season = 1; season <= crop.seasons; season += 1) {
      const minutes = season === 1 ? total : Math.round(total / 2);
      elapsed += minutes;

      const at = new Date(now.getTime() + elapsed * 60_000);
      maturities.push({ season, minutes, at, inRest: isInRest(at, config.restStart, config.restEnd) });
    }

    return { land, suitable: maturities.every((item) => !item.inRest), maturities };
  });

  return {
    crop,
    name: cropName(crop),
    lands: landPlans,
    suitableCount: landPlans.filter((plan) => plan.suitable).length,
  };
}

/** 排序：合适的土地块数多 → 两季优先 → 生长时间长的优先 */
function comparePlans(a: CropPlan, b: CropPlan): number {
  if (b.suitableCount !== a.suitableCount) return b.suitableCount - a.suitableCount;
  if (b.crop.seasons !== a.crop.seasons) return b.crop.seasons - a.crop.seasons;
  return b.crop.baseMinutes - a.crop.baseMinutes;
}

export function selectedLandTypes(config: FarmConfig): LandType[] {
  return LAND_TYPES.filter((land) => config.lands.includes(land.multiplier));
}

export function planAll(config: FarmConfig, now: Date): CropPlan[] {
  const lands = selectedLandTypes(config);
  return CROPS.map((crop) => planCrop(crop, lands, config, now)).sort(comparePlans);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 23) return fallback;
  return value;
}

/** 缓存是用户能随手改的地方，坏值一律退回默认 */
export function parseConfig(raw: string | null): FarmConfig {
  const fallback = createDefaultConfig();
  if (!raw) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (!isRecord(parsed)) return fallback;

  const restStart = normalizeHour(parsed.restStart, fallback.restStart);
  const restEnd = normalizeHour(parsed.restEnd, fallback.restEnd);

  // lands 缺字段（旧数据）就按「三种土地都有」处理；是空数组则尊重用户的选择
  if (!Array.isArray(parsed.lands)) return { restStart, restEnd, lands: fallback.lands };

  const lands: number[] = [];
  for (const value of parsed.lands) {
    if (typeof value !== 'number') continue;
    if (!LAND_TYPES.some((land) => land.multiplier === value)) continue;
    if (lands.includes(value)) continue;
    lands.push(value);
  }

  // 数组里有东西却一条都不合法 = 数据坏了，退回默认；
  // 数组本来就是空的 = 用户自己全取消了，尊重这个选择（页面上有对应的空状态）
  if (lands.length === 0 && parsed.lands.length > 0) {
    return { restStart, restEnd, lands: fallback.lands };
  }

  return { restStart, restEnd, lands };
}

export function serializeConfig(config: FarmConfig): string {
  return JSON.stringify(config);
}

export function readConfig(): FarmConfig {
  try {
    return parseConfig(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式下 localStorage 可能直接抛错
    return createDefaultConfig();
  }
}

export function writeConfig(config: FarmConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeConfig(config));
  } catch {
    // 写不进去不影响这次使用
  }
}
