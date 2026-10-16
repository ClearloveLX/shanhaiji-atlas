import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 Tailwind class，冲突时后者胜出 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 统一转 Date。
 * ⚠️ 经过 unstable_cache 的值会被 JSON 序列化，Date 落到磁盘缓存再读出来会变成字符串，
 * 所以从 queries.ts 拿到的日期一律先用它归一化，不要直接调 .getTime()。
 */
export function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 日期格式化统一用 Intl，不引日期库 */
export function formatDate(value: Date | number | string, withTime = false): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

/** 相对时间：3 分钟前 / 2 天前 */
export function formatRelative(value: Date | number | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return '刚刚';
}

/** 从 URL 里取域名，去掉 www. */
export function domainOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * 没有图标时的兜底色：由名字 hash 取一个固定颜色，不用随机（刷新颜色不变）。
 * 全部是深色相的现代色，配浅底 + 同色字，比铺满饱和色块干净。
 */
const FALLBACK_COLORS = [
  '#2B59FF', // 电光蓝
  '#0E7490', // 深青
  '#6D28D9', // 紫罗兰
  '#047857', // 墨绿
  '#9D174D', // 玫红
  '#334155', // 石板
  '#0369A1', // 海蓝
  '#A21CAF', // 品红
];

export function colorFromName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 37 + name.charCodeAt(index)) % 1000003;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** 中文名取首字，英文名取首字母 */
export function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '·';
}

function stableHash(value: string, modulo: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 131 + value.charCodeAt(index)) % modulo;
  }
  return hash;
}

/** 把任意文本压成 url 友好的 slug（全小写、单个连字符） */
export function slugifyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * 条目 slug 生成：优先英文名，其次中文名里的 ASCII，最后用 `item-xxxx` 兜底。
 * slug 一旦发布就是对外链接，改它等于断链，后台会提示。
 */
export function suggestSlug(name: string, nameEn?: string | null): string {
  const fromEn = slugifyText(nameEn ?? '');
  if (fromEn.length >= 2) return fromEn;

  const fromName = slugifyText(name);
  if (fromName.length >= 2) return fromName;

  return `item-${stableHash(name, 1679616).toString(36).padStart(4, '0')}`;
}
