import type { AdminEntryDetail } from '@/db/queries';
import type { Tag } from '@/db/schema';
import { TAG_DIMS } from '@/lib/tags';
import type { BranchInput, EntryFormValues } from '@/lib/validation';
import type { EntryStatus, EntryType, LinkMode, TagDim } from '@/types';

/**
 * 条目相关的纯函数：把数据库里的行翻译成表单值，以及把字符串收窄成枚举。
 * 页面里不需要任何 as 断言。
 */

/** 空白门店（BranchEditor 与新建表单共用） */
export const EMPTY_BRANCH: BranchInput = {
  name: '',
  address: '',
  province: '',
  city: '',
  district: '',
  lat: null,
  lng: null,
  poiSource: null,
  poiId: '',
  phone: '',
  hours: '',
  priceLevel: null,
  isPrimary: false,
  sort: 0,
  status: 'active',
};

export function asEntryType(value: string): EntryType {
  return value === 'site' || value === 'code' || value === 'shop' ? value : 'tool';
}

export function asLinkMode(value: string): LinkMode {
  return value === 'internal' || value === 'place' ? value : 'external';
}

export function asEntryStatus(value: string): EntryStatus {
  return value === 'stale' || value === 'dead' ? value : 'active';
}

export function asVisibility(value: string): 'public' | 'unlisted' | 'private' {
  return value === 'unlisted' || value === 'private' ? value : 'public';
}

export function asPrivateStatus(value: string | null | undefined): 'todo' | 'visited' | 'verified' | 'avoid' | undefined {
  return value === 'todo' || value === 'visited' || value === 'verified' || value === 'avoid' ? value : undefined;
}

export type TagSelectionShape = Record<TagDim, string[]>;

export function emptyTagSelection(): TagSelectionShape {
  return { topic: [], scene: [], attr: [], platform: [], price: [], quality: [] };
}

/** 把条目的标签按维度拆成 slug 数组（表单里的 tags 就是长这样） */
export function tagSelectionFromTags(items: Tag[]): TagSelectionShape {
  const selection = emptyTagSelection();

  for (const tag of items) {
    if (TAG_DIMS.includes(tag.dim as TagDim)) {
      const dim = tag.dim as TagDim;
      selection[dim] = [...selection[dim], tag.slug];
    }
  }

  return selection;
}

/** 新建时的默认值（可见性取 settings.defaultVisibility） */
export function buildEmptyEntryFormValues(
  linkMode: LinkMode = 'external',
  defaultVisibility: 'public' | 'unlisted' | 'private' = 'public',
): EntryFormValues {
  return {
    type: linkMode === 'internal' ? 'tool' : linkMode === 'place' ? 'shop' : 'tool',
    linkMode,
    slug: '',
    name: '',
    nameEn: '',
    summary: '',
    url: '',
    icon: '',
    cover: '',
    mapQuery: '',
    note: '',
    meta: {},
    visibility: defaultVisibility,
    privateProfile: {},
    featured: false,
    status: 'active',
    sortWeight: 0,
    tags: emptyTagSelection(),
    tool: { component: '', runtime: 'client', requiresLogin: false, version: '', changelog: [] },
    /** place 也可以一条门店都不填：详情页会退化成「在地图上找最近的」（见 DATA-MODEL 2.1） */
    branches: [],
    qrcodes: [],
  };
}

/** 编辑时的默认值：数据库行 → 表单值 */
export function buildEntryFormValues(detail: AdminEntryDetail): EntryFormValues {
  return {
    type: asEntryType(detail.type),
    linkMode: asLinkMode(detail.linkMode),
    slug: detail.slug,
    name: detail.name,
    nameEn: detail.nameEn ?? '',
    summary: detail.summary,
    url: detail.url ?? '',
    icon: detail.icon ?? '',
    cover: detail.cover ?? '',
    mapQuery: detail.mapQuery ?? '',
    note: detail.note ?? '',
    meta: detail.meta ?? {},
    visibility: asVisibility(detail.visibility),
    privateProfile: detail.privateProfile
      ? {
          rating: detail.privateProfile.rating,
          status: asPrivateStatus(detail.privateProfile.status),
          note: detail.privateProfile.note ?? '',
          contact: detail.privateProfile.contact ?? '',
          paid: detail.privateProfile.paid ?? '',
          visitedOn: detail.privateProfile.visitedOn ?? '',
        }
      : {},
    featured: detail.featured,
    status: asEntryStatus(detail.status),
    sortWeight: detail.sortWeight,
    tags: tagSelectionFromTags(detail.tags),
    tool: detail.tool
      ? {
          component: detail.tool.component,
          runtime: detail.tool.runtime === 'server' ? 'server' : 'client',
          requiresLogin: detail.tool.requiresLogin,
          version: detail.tool.version ?? '',
          changelog: detail.tool.changelog,
        }
      : { component: '', runtime: 'client', requiresLogin: false, version: '', changelog: [] },
    branches: detail.branches.map((branch, index) => ({
      id: branch.id,
      name: branch.name ?? '',
      address: branch.address,
      province: branch.province ?? '',
      city: branch.city,
      district: branch.district ?? '',
      lat: branch.lat,
      lng: branch.lng,
      poiSource: branch.poiSource === 'amap' || branch.poiSource === 'baidu' ? branch.poiSource : branch.lat != null ? 'manual' : null,
      poiId: branch.poiId ?? '',
      phone: branch.phone ?? '',
      hours: branch.hours ?? '',
      priceLevel: branch.priceLevel,
      isPrimary: branch.isPrimary,
      sort: branch.sort || index * 10,
      status: asEntryStatus(branch.status),
    })),
    qrcodes: detail.qrcodes.map((qrcode, index) => ({
      id: qrcode.id,
      label: qrcode.label,
      kind:
        qrcode.kind === 'wechat-group' ||
        qrcode.kind === 'wechat-personal' ||
        qrcode.kind === 'wechat-oa' ||
        qrcode.kind === 'miniprogram' ||
        qrcode.kind === 'alipay'
          ? qrcode.kind
          : 'custom',
      image: qrcode.image,
      tip: qrcode.tip ?? '',
      expiresAt: qrcode.expiresAt ? new Date(qrcode.expiresAt) : null,
      isActive: qrcode.isActive,
      sort: qrcode.sort || index * 10,
    })),
  };
}
