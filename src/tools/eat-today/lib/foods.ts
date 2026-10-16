/**
 * 「今天吃什么」的纯逻辑：默认清单、增删改规则、缓存读写。
 *
 * 不依赖 React，也不在模块作用域碰 window —— 存储函数只在 useEffect 里被调用，
 * 所以这个文件在服务端渲染时是安全的。
 */

export type FoodItem = {
  /** 稳定 id：默认项是固定的，用户新增项由 makeId 生成 */
  id: string;
  name: string;
};

export type EatTodayState = {
  items: FoodItem[];
  /** 上一次选中的 id：用来「不连着重复」，也用来在刷新后还记得结果 */
  lastId: string | null;
};

export const MAX_NAME_LENGTH = 20;
export const MAX_ITEMS = 200;
export const STORAGE_KEY = 'atlas.eat-today.v1';

/** 默认清单：中午点外卖最常出现的那几种，先给一份能直接用的 */
const DEFAULT_NAMES: readonly string[] = [
  '黄焖鸡米饭',
  '兰州牛肉面',
  '沙县小吃',
  '麻辣烫',
  '螺蛳粉',
  '猪脚饭',
  '盖浇饭',
  '水饺',
  '蛋炒饭',
  '米线',
  '汉堡',
  '麻辣香锅',
];

export function createDefaultItems(): FoodItem[] {
  return DEFAULT_NAMES.map((name, index) => ({ id: `default-${index + 1}`, name }));
}

export function createDefaultState(): EatTodayState {
  return { items: createDefaultItems(), lastId: null };
}

/** 名称统一处理：去掉首尾空白，把连续空白压成一个空格 */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** 校验一个名字能不能进清单；exceptId 用于「编辑自己」时跳过重名判断 */
export function validateName(raw: string, items: FoodItem[], exceptId?: string): string | null {
  const name = normalizeName(raw);

  if (!name) return '先写个名字';
  if (name.length > MAX_NAME_LENGTH) return `名字最多 ${MAX_NAME_LENGTH} 个字`;
  if (items.some((item) => item.id !== exceptId && item.name === name)) return '清单里已经有这个了';

  return null;
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 抽一个：有多个选项时不连着抽中上一次那个 */
export function pickCandidate(items: FoodItem[], lastId: string | null): FoodItem | null {
  if (items.length === 0) return null;

  const pool = items.length > 1 ? items.filter((item) => item.id !== lastId) : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 当前清单是否就是默认那份（顺序也要一致），用来决定要不要显示「恢复默认」 */
export function isDefaultList(items: FoodItem[]): boolean {
  if (items.length !== DEFAULT_NAMES.length) return false;
  return items.every((item, index) => item.name === DEFAULT_NAMES[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 解析缓存。缓存是用户能随手改的地方，所以每一步都当作不可信输入：
 * 坏掉的条目直接丢掉，全坏就退回默认清单。
 */
export function parseState(raw: string | null): EatTodayState {
  if (!raw) return createDefaultState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createDefaultState();
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) return createDefaultState();

  const items: FoodItem[] = [];

  for (const entry of parsed.items) {
    if (!isRecord(entry)) continue;

    const id = typeof entry.id === 'string' ? entry.id : '';
    const name = typeof entry.name === 'string' ? normalizeName(entry.name) : '';

    if (!id || !name || name.length > MAX_NAME_LENGTH) continue;
    if (items.some((item) => item.id === id)) continue;

    items.push({ id, name });
    if (items.length >= MAX_ITEMS) break;
  }

  const rawLastId = typeof parsed.lastId === 'string' ? parsed.lastId : null;
  const lastId = rawLastId && items.some((item) => item.id === rawLastId) ? rawLastId : null;

  return { items, lastId };
}

export function serializeState(state: EatTodayState): string {
  return JSON.stringify({ items: state.items, lastId: state.lastId });
}

export function readState(): EatTodayState {
  try {
    return parseState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式下 localStorage 可能直接抛错，退回默认清单就好
    return createDefaultState();
  }
}

export function writeState(state: EatTodayState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // 写不进去不影响这次使用
  }
}
