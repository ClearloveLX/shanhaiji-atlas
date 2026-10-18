import type { Tag } from '@/db/schema';
import type { EntryStatus, EntryType, LinkMode, TagDim } from '@/types';

/**
 * 标签相关的纯函数与展示常量。
 * chip 的展示顺序**固定**为 topic → scene → attr → platform → price → quality，
 * 不要按查询返回顺序渲染，保证全站视觉一致（docs/TAGS.md 第 5 节）。
 */

export const TAG_DIMS: TagDim[] = ['topic', 'scene', 'attr', 'platform', 'price', 'quality'];

export const TAG_DIM_LABELS: Record<string, string> = {
  topic: '主题',
  scene: '场景',
  attr: '属性',
  platform: '平台',
  price: '价格',
  quality: '质量',
  private: '私藏',
};

/**
 * 每个维度的标签数量上限，与 src/lib/validation.ts 的 MAX_TAGS_PER_DIM 保持一致。
 * platform 是枚举项（有官方客户端就勾），上限等于字典条数，不参与「打太多」的判断。
 */
export const MAX_TAGS_PER_DIM: Record<TagDim, number> = {
  topic: 3,
  scene: 3,
  attr: 4,
  platform: 6,
  price: 1,
  quality: 2,
};

/** 条目类型 → 中文名。列表页标题、面包屑、搜索结果分组、后台类型列共用这一份 */
export const ENTRY_TYPE_LABELS: Record<string, string> = {
  tool: '工具分享',
  site: '站点分享',
  code: '源码分享',
  shop: '好店分享',
};

export const LINK_MODE_LABELS: Record<string, string> = {
  external: '外部链接',
  // 「基本自研」是梗：全自研的口气太重，留一点余量给 Next.js / SQLite / Tailwind
  internal: '基本自研',
  place: '线下好店',
};

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  stale: '疑似失效',
  dead: '已失效',
};

export const LINK_MODE_SEGMENTS: Record<string, string> = {
  external: '',
  internal: '',
  place: '',
};

/** 复合 key：'scene/work'，避免 attr.free（免费使用）和 price.free（完全免费）混淆 */
export function tagKey(tag: Pick<Tag, 'dim' | 'slug'>): string {
  return `${tag.dim}/${tag.slug}`;
}

/** 后台现场新建标签时用的备选颜色，都是白底上对比度 ≥ 4.5:1 的深色 */
export const TAG_COLOR_PALETTE = [
  '#2B59FF',
  '#0369A1',
  '#0E7490',
  '#0D9488',
  '#047857',
  '#15803D',
  '#4338CA',
  '#6D28D9',
  '#7C3AED',
  '#A21CAF',
  '#BE185D',
  '#9D174D',
  '#334155',
  '#64748B',
];

/** 从标签名稳定地挑一个备选色（同名永远同色，不用随机） */
export function pickTagColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}

/**
 * 中文标签名生成 slug：ASCII 名字直接 kebab-case；
 * 纯中文名没有可靠转写，用 `tag-<4 位哈希>` 兜底（slug 只用于 URL，展示永远用 name）。
 */
export function slugifyTagName(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (ascii.length >= 2) return ascii.slice(0, 40);

  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 131 + name.charCodeAt(index)) % 1679616; // 36^4
  }
  return `tag-${hash.toString(36).padStart(4, '0')}`;
}

/** 按固定维度顺序给 chip 排序 */
export function sortChips<T extends Pick<Tag, 'dim' | 'sort'>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dimDiff = TAG_DIMS.indexOf(a.dim as TagDim) - TAG_DIMS.indexOf(b.dim as TagDim);
    if (dimDiff !== 0) return dimDiff;
    return a.sort - b.sort;
  });
}

export function groupByDim<T extends Pick<Tag, 'dim'>>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(item.dim) ?? [];
    list.push(item);
    grouped.set(item.dim, list);
  }
  return grouped;
}

/** 条目类型 → 详情页/列表页路径段 */
const TYPE_SEGMENTS: Record<string, string> = {
  tool: 'tools',
  site: 'sites',
  code: 'codes',
  shop: 'shops',
};

export function listSegment(type: string): string {
  return TYPE_SEGMENTS[type] ?? 'tools';
}

/** 条目类型 → 中文标签（列表页标题用） */
export function listTitle(type: string): string {
  // 不叫「在线工具」：这一类里也有软件官网（下载页、桌面版），不是都能在浏览器里直接用
  return ENTRY_TYPE_LABELS[type] ?? type;
}

export type { EntryStatus, EntryType, LinkMode };
