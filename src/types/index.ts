/** 全项目共用的类型 */

/** Server Action 的统一返回形状 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export type EntryType = 'tool' | 'site' | 'shop';
export type LinkMode = 'external' | 'internal' | 'place';
export type EntryStatus = 'active' | 'stale' | 'dead';
export type TagDim = 'topic' | 'scene' | 'attr' | 'platform' | 'price' | 'quality';
export type SubmitStatus = 'pending' | 'approved' | 'rejected';
