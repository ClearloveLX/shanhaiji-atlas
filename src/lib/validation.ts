import { z } from 'zod';

/**
 * 前后端共用的 Zod schema。
 * 表结构的约束在这里复述一遍：DB check 挡不住表单，Zod 挡不住直接写库，两边都要。
 */

/* ────────────────────────── 基础枚举与常量 ────────────────────────── */

/**
 * 标签维度。顺序就是全站展示顺序（chip、筛选栏、后台表单都按它排）。
 * topic 放最前：它回答「这是哪一类东西」，比场景更值得第一眼看到。
 */
export const TAG_DIMS = ['topic', 'scene', 'attr', 'platform', 'price', 'quality'] as const;
export type TagDim = (typeof TAG_DIMS)[number];

export const ENTRY_TYPES = ['tool', 'site', 'code', 'shop'] as const;
export const LINK_MODES = ['external', 'internal', 'place'] as const;
export const ENTRY_STATUSES = ['active', 'stale', 'dead'] as const;
export const VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export const PRIVATE_STATUSES = ['todo', 'visited', 'verified', 'avoid'] as const;
export const QRCODE_KINDS = [
  'wechat-group',
  'wechat-personal',
  'wechat-oa',
  'miniprogram',
  'alipay',
  'custom',
] as const;
export const POI_SOURCES = ['amap', 'baidu', 'manual'] as const;
export const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;
/** entry 推荐收录 | feedback 网站建议 / BUG */
export const SUBMISSION_KINDS = ['entry', 'feedback'] as const;
/** 推荐收录的拒绝原因 */
export const ENTRY_REJECT_REASONS = ['链接失效', '不符合收录标准', '重复', '垃圾信息'] as const;
/** 建议 / BUG 的拒绝原因（「已处理」走的是通过，不是拒绝） */
export const FEEDBACK_REJECT_REASONS = ['重复反馈', '信息不足', '不需要处理', '垃圾信息'] as const;
/** 服务端接受上面两套里的任意一个；前台按 kind 只显示对应那套 */
export const SUBMISSION_REJECT_REASONS = [
  '链接失效',
  '不符合收录标准',
  '重复',
  '垃圾信息',
  '重复反馈',
  '信息不足',
  '不需要处理',
] as const;

/**
 * 每个维度的标签数量上限 —— 超过就等于没打。
 *
 * 例外是 `platform`：它是**枚举项**，产品有没有某个客户端是事实，不是倾向。
 * 一个对话助手同时有网页 / iOS / Android / Windows / macOS 很正常，
 * 卡在 3 个会让「按平台筛选」直接筛错，所以它的上限等于字典条数（6）。
 * 真正要克制的是 `scene` 和 `attr`。
 */
export const MAX_TAGS_PER_DIM: Record<TagDim, number> = {
  topic: 3,
  scene: 3,
  attr: 4,
  platform: 6,
  price: 1,
  quality: 2,
};

/* ────────────────────────── 通用片段 ────────────────────────── */

export const entryTypeSchema = z.enum(ENTRY_TYPES);
export const linkModeSchema = z.enum(LINK_MODES);
export const entryStatusSchema = z.enum(ENTRY_STATUSES);
export const visibilitySchema = z.enum(VISIBILITIES);
export const privateStatusSchema = z.enum(PRIVATE_STATUSES);
export const tagDimSchema = z.enum(TAG_DIMS);
export const qrcodeKindSchema = z.enum(QRCODE_KINDS);
export const poiSourceSchema = z.enum(POI_SOURCES);

/** 全小写 kebab-case，不以 - 开头结尾，不含连续 -- */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'slug 必填')
  .max(80, 'slug 最多 80 个字符')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能用小写字母、数字和单个连字符');

const httpUrlSchema = z.string().trim().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, '必须是 http:// 或 https:// 开头的合法链接');

const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `最多 ${max} 个字符`)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

export const entryMetaSchema = z.object({
  offline: z.boolean().optional(),
  needProxy: z.boolean().optional(),
});

/* ────────────────────────── 标签选择（表单形态） ────────────────────────── */

/** 表单里标签是一个整体，存库时再拆成 entry_tags */
export const tagSelectionSchema = z.object({
  topic: z.array(z.string()).max(MAX_TAGS_PER_DIM.topic, '主题最多 3 个').default([]),
  scene: z.array(z.string()).min(1, '至少选 1 个场景标签').max(MAX_TAGS_PER_DIM.scene, '场景最多 3 个'),
  attr: z.array(z.string()).max(MAX_TAGS_PER_DIM.attr, '属性最多 4 个').default([]),
  platform: z.array(z.string()).max(MAX_TAGS_PER_DIM.platform, '平台最多 6 个').default([]),
  price: z.array(z.string()).max(MAX_TAGS_PER_DIM.price, '价格最多 1 个').default([]),
  quality: z.array(z.string()).max(MAX_TAGS_PER_DIM.quality, '质量最多 2 个').default([]),
});

export type TagSelection = z.infer<typeof tagSelectionSchema>;

/* ────────────────────────── 门店 / 二维码 / 自研工具 ────────────────────────── */

export const branchInputSchema = z.object({
  id: z.string().optional(),
  name: optionalText(60),
  address: z.string().trim().min(1, '地址必填').max(200, '地址最多 200 个字符'),
  province: optionalText(20),
  city: z.string().trim().min(1, '城市必填').max(20, '城市最多 20 个字符'),
  district: optionalText(20),
  lat: z.number().min(-90, '纬度范围 -90 ~ 90').max(90, '纬度范围 -90 ~ 90').nullable().optional(),
  lng: z.number().min(-180, '经度范围 -180 ~ 180').max(180, '经度范围 -180 ~ 180').nullable().optional(),
  poiSource: poiSourceSchema.nullable().optional(),
  poiId: optionalText(64),
  phone: optionalText(30),
  hours: optionalText(120),
  priceLevel: z.number().int().min(1).max(3).nullable().optional(),
  isPrimary: z.boolean().default(false),
  sort: z.number().int().default(0),
  status: entryStatusSchema.default('active'),
});

export type BranchInput = z.infer<typeof branchInputSchema>;

export const qrcodeInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, '标签必填').max(30, '标签最多 30 个字符'),
  kind: qrcodeKindSchema,
  image: z.string().trim().min(1, '请先上传二维码图片'),
  tip: optionalText(120),
  /** 微信群码默认「今天 + 7 天」 */
  expiresAt: z.date().nullable().optional(),
  isActive: z.boolean().default(true),
  sort: z.number().int().default(0),
});

export type QrcodeInput = z.infer<typeof qrcodeInputSchema>;

export const changelogItemSchema = z.object({
  version: z.string().trim().min(1).max(20),
  date: z.string().trim().min(1),
  note: z.string().trim().min(1).max(200),
});

export const toolInputSchema = z.object({
  /**
   * 必须能在 src/tools/registry.ts 里找到（由 actions/entries.ts 的 isToolSlug 兜底）。
   * 这里**故意不要求非空**：表单在 external / place 形态下也会带上一个空的 tool 对象，
   * 卡在 min(1) 会让「保存」静默失败 —— 报错挂在根本没渲染出来的工具字段上，界面上什么都看不到。
   * 「internal 必须选组件」由下面 entryInputSchema.superRefine 的 linkMode 分支保证。
   */
  component: z.string().trim().max(60, '组件名最多 60 个字符'),
  runtime: z.enum(['client', 'server']).default('client'),
  requiresLogin: z.boolean().default(false),
  version: optionalText(20),
  changelog: z.array(changelogItemSchema).default([]),
});

export type ToolInput = z.infer<typeof toolInputSchema>;

/** 只有站长看得到的字段（entry_private，1:1） */
export const privateProfileSchema = z.object({
  /** 我的评分 1-5 */
  rating: z.number().int().min(1).max(5).nullable().optional(),
  /** todo 想去 | visited 去过 | verified 已验证 | avoid 踩雷 */
  status: privateStatusSchema.nullable().optional(),
  note: optionalText(2000),
  contact: optionalText(120),
  paid: optionalText(60),
  /** 'YYYY-MM-DD' */
  visitedOn: optionalText(10),
});

export type PrivateProfileInput = z.infer<typeof privateProfileSchema>;

/* ────────────────────────── 条目 ────────────────────────── */

export const entryInputSchema = z
  .object({
    type: entryTypeSchema,
    linkMode: linkModeSchema,
    slug: slugSchema,
    name: z.string().trim().min(1, '名称必填').max(60, '名称最多 60 个字符'),
    nameEn: optionalText(80),
    summary: z
      .string()
      .trim()
      .min(20, '一句话简介至少 20 字')
      .max(200, '简介最多 200 个字符（列表页会截断显示，建议 20-60 字）'),
    url: optionalText(2048),
    icon: optionalText(500),
    cover: optionalText(500),
    /** type='shop' 可选：交给地图 App 的搜索词，留空用 name（见 docs/DATA-MODEL.md 2.1） */
    mapQuery: optionalText(60),
    note: optionalText(2000),
    meta: entryMetaSchema.default({}),
    /** public 公开 | unlisted 不列出但可直达 | private 只有站长可见 */
    visibility: visibilitySchema.default('public'),
    /** 只有站长看得到的私人信息，任何可见性都能填 */
    privateProfile: privateProfileSchema.default({}),
    featured: z.boolean().default(false),
    status: entryStatusSchema.default('active'),
    sortWeight: z.number().int().default(0),
    tags: tagSelectionSchema,
    /** linkMode='internal' 时必填 */
    tool: toolInputSchema.optional(),
    /** linkMode='place' 时可选：填了就给逐个门店的导航按钮，一条都不填就走「地图搜索」 */
    branches: z.array(branchInputSchema).default([]),
    qrcodes: z.array(qrcodeInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.linkMode === 'external') {
      if (!value.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: '外部链接必须填 URL' });
      } else if (!httpUrlSchema.safeParse(value.url).success) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: '必须是 http:// 或 https:// 开头的合法链接' });
      }
    }

    if (value.linkMode === 'internal') {
      if (value.type !== 'tool') {
        ctx.addIssue({ code: 'custom', path: ['type'], message: '自研工具的 type 必须是 tool' });
      }
      if (value.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: '自研工具跑在站内，不要填外链 URL' });
      }
      if (!value.tool?.component) {
        ctx.addIssue({ code: 'custom', path: ['tool', 'component'], message: '请选择已注册的工具组件' });
      }
    }

    if (value.linkMode === 'place') {
      if (value.type !== 'shop') {
        ctx.addIssue({ code: 'custom', path: ['type'], message: '线下好店的 type 必须是 shop' });
      }
      // 门店列表不再是必填：一条都不填时，详情页给「在地图上找最近的」按钮组，
      // 搜索词取 mapQuery，留空则取 name（见 docs/DATA-MODEL.md 2.1 的约束说明）
    }

    // 地图搜索词只有店铺用得上；工具和站点填了就是填错了
    if (value.mapQuery && value.type !== 'shop') {
      ctx.addIssue({ code: 'custom', path: ['mapQuery'], message: '只有店铺（type=shop）才需要地图搜索词' });
    }
  });

export type EntryInput = z.infer<typeof entryInputSchema>;
/** 表单里的形态：带 default 的字段可以缺省 */
export type EntryFormValues = z.input<typeof entryInputSchema>;

/* ────────────────────────── 标签 ────────────────────────── */

export const tagInputSchema = z.object({
  dim: tagDimSchema,
  slug: slugSchema.max(40, 'slug 最多 40 个字符'),
  name: z.string().trim().min(1, '名称必填').max(20, '名称最多 20 个字符'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB 格式'),
  /** lucide 组件名 */
  icon: optionalText(40),
  desc: optionalText(200),
  sort: z.number().int().default(0),
});

export type TagInput = z.infer<typeof tagInputSchema>;

export const mergeTagsInputSchema = z.object({
  sourceIds: z.array(z.string()).min(1, '至少选 1 个要合并掉的标签'),
  targetId: z.string().min(1, '请选择保留哪个标签'),
});

/* ────────────────────────── 投稿 ────────────────────────── */

/**
 * 投稿。一张表装两种，靠 kind 分：
 * - entry    「推荐一个收录」：必须有合法 url，理由 20–300 字，走完流程会变成一条 entries
 * - feedback 「网站建议 / BUG」：url 选填（问题未必指得出一个链接），理由 5–1000 字，不生成条目
 */
export const submissionInputSchema = z
  .object({
    kind: z.enum(SUBMISSION_KINDS).default('entry'),
    name: z.string().trim().min(1, '先写一句话标题').max(60, '最多 60 个字符'),
    url: optionalText(2048),
    type: entryTypeSchema.optional(),
    reason: z.string().trim().max(1000, '最多 1000 字'),
    contact: optionalText(100),
    /** 不需要 JS 的算术验证：服务端比对 a + b 是否等于 answer */
    captchaA: z.coerce.number().int(),
    captchaB: z.coerce.number().int(),
    captchaAnswer: z.coerce.number().int(),
  })
  .superRefine((value, ctx) => {
    if (value.url && !httpUrlSchema.safeParse(value.url).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: '链接必须是 http:// 或 https:// 开头的合法地址',
      });
    }

    if (value.kind === 'entry') {
      if (!value.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: '推荐收录必须填链接' });
      }
      if (value.reason.length < 20) {
        ctx.addIssue({ code: 'custom', path: ['reason'], message: '推荐理由至少 20 字' });
      } else if (value.reason.length > 300) {
        ctx.addIssue({ code: 'custom', path: ['reason'], message: '推荐理由最多 300 字' });
      }
      return;
    }

    if (value.reason.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: '把问题说清楚一点，至少 5 个字' });
    }
  });

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export const rejectSubmissionInputSchema = z.object({
  id: z.string().min(1),
  reason: z.enum(SUBMISSION_REJECT_REASONS),
});

/* ────────────────────────── 站点设置 ────────────────────────── */

export const siteSettingsSchema = z.object({
  submissionsOpen: z.boolean(),
  maintenanceMode: z.boolean(),
  defaultVisibility: visibilitySchema,
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

/* ────────────────────────── 登录 ────────────────────────── */

export const credentialsSchema = z.object({
  email: z.string().trim().min(1, '请填写邮箱'),
  password: z.string().min(1, '请填写密码'),
});
