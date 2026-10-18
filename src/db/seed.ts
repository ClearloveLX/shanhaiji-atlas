import './load-env';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from './index';
import { entries, entryBranches, entryTags, entryTools, settings, tags } from './schema';
import type { EntryMeta } from './schema';
import { isToolSlug } from '../tools/registry';

/**
 * 种子数据：标签字典 + 管理员账号 + 20 条条目
 * （18 个 AI 产品官网 = type 'site'，2 个自研工具 = type 'tool' + linkMode 'internal'）。
 * 幂等：标签按 (dim, slug) 更新，条目按 (type, slug) 判断已存在就跳过。
 * 用法：pnpm db:seed
 */

type TagSeed = {
  dim: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  desc: string;
  sort: number;
};

/* ────────────────────────── 标签字典（40 个） ────────────────────────── */

const TAG_SEEDS: TagSeed[] = [
  // topic 主题 1 个：回答「这是哪一类东西」，比场景更先被看到
  {
    dim: 'topic',
    slug: 'ai',
    name: 'AI',
    color: '#4338CA',
    icon: 'BrainCircuit',
    desc: '以大模型能力为核心的工具与服务：对话、生成、检索，以及配套的开发者接口。',
    sort: 10,
  },
  // scene 场景 12 个
  {
    dim: 'scene',
    slug: 'work',
    name: '办公',
    color: '#2B59FF',
    icon: 'Briefcase',
    desc: '文档、协作、流程、会议、表单这类为工作服务的东西。适合想把琐事流程化、少加点班的人。',
    sort: 10,
  },
  {
    dim: 'scene',
    slug: 'study',
    name: '学习',
    color: '#0369A1',
    icon: 'GraduationCap',
    desc: '课程、词典、笔记、论文、刷题相关的资源。适合想把知识沉淀下来，而不是收藏了就忘的人。',
    sort: 20,
  },
  {
    dim: 'scene',
    slug: 'travel',
    name: '出行',
    color: '#0E7490',
    icon: 'Plane',
    desc: '地图、机票、酒店、行程规划与翻译工具。适合出门前先查清楚、路上不抓瞎的人。',
    sort: 30,
  },
  {
    dim: 'scene',
    slug: 'home',
    name: '居家',
    color: '#64748B',
    icon: 'House',
    desc: '家装、清洁、收纳、维修与租房相关。适合正在收拾自己那一小块地方、想把日子过顺的人。',
    sort: 40,
  },
  {
    dim: 'scene',
    slug: 'health',
    name: '健康',
    color: '#BE185D',
    icon: 'HeartPulse',
    desc: '运动、睡眠、饮食记录、问诊与心理支持。适合想把身体状态先看清楚、再慢慢调整的人。',
    sort: 50,
  },
  {
    dim: 'scene',
    slug: 'money',
    name: '理财',
    color: '#6D28D9',
    icon: 'Wallet',
    desc: '记账、比价、汇率、报销与税务工具。适合不想到了月底才发现钱不知道花在哪的人。',
    sort: 60,
  },
  {
    dim: 'scene',
    slug: 'food',
    name: '吃喝',
    color: '#047857',
    icon: 'UtensilsCrossed',
    desc: '外卖、菜谱、探店与生鲜采购。适合每天都在纠结吃什么、又不想凑合一顿的人。',
    sort: 70,
  },
  {
    dim: 'scene',
    slug: 'digital',
    name: '数码',
    color: '#4338CA',
    icon: 'Cpu',
    desc: '硬件、外设、系统工具与开发相关。适合喜欢把设备和软件调到最顺手状态的人。',
    sort: 80,
  },
  {
    dim: 'scene',
    slug: 'kids',
    name: '亲子',
    color: '#0D9488',
    icon: 'Baby',
    desc: '育儿、绘本、玩具与儿童教育。适合家里有个停不下来的小发动机、需要找点好内容的人。',
    sort: 90,
  },
  {
    dim: 'scene',
    slug: 'pet',
    name: '宠物',
    color: '#7C3AED',
    icon: 'PawPrint',
    desc: '宠物用品、医疗与寄养信息。适合把猫狗当家人、愿意为它们多花点心思的铲屎官。',
    sort: 100,
  },
  {
    dim: 'scene',
    slug: 'create',
    name: '创作',
    color: '#9D174D',
    icon: 'Palette',
    desc: '设计、剪辑、写作、音乐与图片处理。适合脑子里有想法、需要把它真正做出来的人。',
    sort: 110,
  },
  {
    dim: 'scene',
    slug: 'fun',
    name: '娱乐',
    color: '#15803D',
    icon: 'Gamepad2',
    desc: '影视、游戏、社区与摸鱼去处。适合下班之后只想放松一会儿、不想再动脑子的人。',
    sort: 120,
  },

  // attr 属性 8 个
  {
    dim: 'attr',
    slug: 'free',
    name: '免费',
    color: '#166534',
    icon: 'Gift',
    desc: '核心功能可以长期免费使用，没有强制付费墙，不付钱也能把主要的事情做完。',
    sort: 10,
  },
  {
    dim: 'attr',
    slug: 'no-login',
    name: '免登录',
    color: '#1D4ED8',
    icon: 'LogIn',
    desc: '打开即用，不注册账号也能完成主要操作，不用先交出邮箱和手机号。',
    sort: 20,
  },
  {
    dim: 'attr',
    slug: 'open-source',
    name: '开源',
    color: '#0E7490',
    icon: 'GitBranch',
    desc: '源码公开可查、可自行部署，不怕哪天突然关停，也不怕条款被悄悄改掉。',
    sort: 30,
  },
  {
    dim: 'attr',
    slug: 'zh-ui',
    name: '中文界面',
    color: '#1E3A8A',
    icon: 'Languages',
    desc: '官方提供简体中文界面，不需要靠浏览器翻译去猜按钮到底是什么意思。',
    sort: 40,
  },
  {
    dim: 'attr',
    slug: 'no-install',
    name: '免下载',
    color: '#7C3AED',
    icon: 'Cloud',
    desc: '纯网页或小程序形态，不用安装客户端，换台电脑也不用重新配置一遍环境。',
    sort: 50,
  },
  {
    dim: 'attr',
    slug: 'need-proxy',
    name: '需境外访问',
    color: '#64748B',
    icon: 'Globe',
    desc: '中国大陆直连打不开，需要自备网络条件，用之前先确认自己能不能访问。',
    sort: 60,
  },
  {
    dim: 'attr',
    slug: 'maintained',
    name: '长期维护',
    color: '#155E75',
    icon: 'RefreshCw',
    desc: '近 12 个月内有明确的更新记录，不是收完一波用户就放在那里不管的项目。',
    sort: 70,
  },
  {
    dim: 'attr',
    slug: 'ads-free',
    name: '无广告',
    color: '#374151',
    icon: 'ShieldCheck',
    desc: '没有弹窗、没有信息流广告、没有诱导下载，打开就是干正事的地方。',
    sort: 80,
  },

  // platform 平台 6 个
  {
    dim: 'platform',
    slug: 'web',
    name: '网页',
    color: '#0F172A',
    icon: 'Monitor',
    desc: '浏览器里直接打开就能用，不分系统，换设备也不影响使用体验。',
    sort: 10,
  },
  {
    dim: 'platform',
    slug: 'ios',
    name: 'iOS',
    color: '#4B5563',
    icon: 'Apple',
    desc: '提供 iPhone / iPad 客户端，App Store 里可以搜到官方发布的版本。',
    sort: 20,
  },
  {
    dim: 'platform',
    slug: 'android',
    name: 'Android',
    color: '#166534',
    icon: 'Smartphone',
    desc: '提供 Android 客户端，可以在各大应用商店或官网下载到安装包。',
    sort: 30,
  },
  {
    dim: 'platform',
    slug: 'windows',
    name: 'Windows',
    color: '#1E40AF',
    icon: 'Laptop',
    desc: '提供 Windows 桌面客户端，适合长时间坐在电脑前处理事情的人。',
    sort: 40,
  },
  {
    dim: 'platform',
    slug: 'macos',
    name: 'macOS',
    color: '#6B21A8',
    icon: 'Command',
    desc: '提供 macOS 桌面客户端，和系统快捷键、触控板手势结合得比较自然。',
    sort: 50,
  },
  {
    dim: 'platform',
    slug: 'miniprogram',
    name: '小程序',
    color: '#334155',
    icon: 'QrCode',
    desc: '微信小程序形态，扫码即用、不用安装，适合偶尔用一次就不想留 App 的场景。',
    sort: 60,
  },

  // price 价格 4 个
  {
    dim: 'price',
    slug: 'free',
    name: '完全免费',
    color: '#15803D',
    icon: 'CircleDollarSign',
    desc: '没有任何付费项，全部功能开放，也不靠广告回本，用着心里踏实。',
    sort: 10,
  },
  {
    dim: 'price',
    slug: 'freemium',
    name: '免费增值',
    color: '#0891B2',
    icon: 'Coins',
    desc: '基础功能免费就够用，高级功能需要付费，可以先试一段时间再决定。',
    sort: 20,
  },
  {
    dim: 'price',
    slug: 'onetime',
    name: '一次性买断',
    color: '#1D4ED8',
    icon: 'CreditCard',
    desc: '付一次钱长期使用，不订阅、不按年续费，适合讨厌订阅制的人。',
    sort: 30,
  },
  {
    dim: 'price',
    slug: 'subscription',
    name: '订阅制',
    color: '#4338CA',
    icon: 'CalendarClock',
    desc: '按月或按年付费，功能持续更新，适合日常工作离不开它的重度用户。',
    sort: 40,
  },

  // quality 质量 4 个
  {
    dim: 'quality',
    slug: 'editor-pick',
    name: '编辑精选',
    color: '#2B59FF',
    icon: 'Star',
    desc: '人工筛过的条目：确实好用、长期可用、愿意推荐给朋友的那一种。',
    sort: 10,
  },
  {
    dim: 'quality',
    slug: 'high-repute',
    name: '高口碑',
    color: '#0E7490',
    icon: 'ThumbsUp',
    desc: '有长期公开好评、不是刷榜刷出来的，社区讨论里经常被自发推荐。',
    sort: 20,
  },
  {
    dim: 'quality',
    slug: 'new',
    name: '新上线',
    color: '#047857',
    icon: 'Sparkles',
    desc: '收录不满 90 天的新面孔，还在观察期，欢迎反馈真实使用体验。',
    sort: 30,
  },
  {
    dim: 'quality',
    slug: 'dead',
    name: '已失效',
    color: '#6B7280',
    icon: 'TriangleAlert',
    desc: '链接已经打不开或者服务已经停止，保留记录是为了避免以后重复收录。',
    sort: 40,
  },

  // private 私密维度 5 个（只在后台和 /me 里出现，公开筛选栏永远不会渲染）
  {
    dim: 'private',
    slug: 'todo',
    name: '想去',
    color: '#0369A1',
    icon: 'Bookmark',
    desc: '还没去过的店，攒着等有空。',
    sort: 10,
  },
  {
    dim: 'private',
    slug: 'visited',
    name: '去过',
    color: '#166534',
    icon: 'CircleCheck',
    desc: '打过卡的，留个记录方便回头对比。',
    sort: 20,
  },
  {
    dim: 'private',
    slug: 'fav',
    name: '私藏',
    color: '#9D174D',
    icon: 'Heart',
    desc: '不想公开推荐的心头好，自己知道就行。',
    sort: 30,
  },
  {
    dim: 'private',
    slug: 'avoid',
    name: '不推荐',
    color: '#B91C1C',
    icon: 'CircleX',
    desc: '去过但不行，留个记录免得下次又去。',
    sort: 40,
  },
  {
    dim: 'private',
    slug: 'friend',
    name: '朋友开的',
    color: '#7C3AED',
    icon: 'Users',
    desc: '朋友开的店，支持一下，顺便记着别推荐过头。',
    sort: 50,
  },
];

/* ────────────────────────── 示例条目（36 条） ────────────────────────── */

type BranchSeed = {
  name?: string;
  address: string;
  province?: string;
  city: string;
  district?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  hours?: string;
  priceLevel?: number;
  isPrimary?: boolean;
};

type EntrySeed = {
  type: 'tool' | 'site' | 'code' | 'shop';
  linkMode: 'external' | 'internal' | 'place';
  slug: string;
  name: string;
  nameEn?: string;
  summary: string;
  url?: string;
  /** linkMode='place' 时可填：地图 App 里能搜到的名字，留空用 name */
  mapQuery?: string;
  note?: string;
  meta?: EntryMeta;
  featured?: boolean;
  status?: 'active' | 'stale' | 'dead';
  /** 收录于多少天前，用来铺开「最新收录」的时间线 */
  daysAgo: number;
  viewCount?: number;
  clickCount?: number;
  tags: string[];
  branches?: BranchSeed[];
  /** linkMode='internal' 时必填，component 必须与 src/tools/registry.ts 的 key 一致 */
  tool?: { component: string; runtime: 'client' | 'server'; requiresLogin?: boolean; version?: string };
};

const ENTRY_SEEDS: EntrySeed[] = [
  {
    type: 'site',
    linkMode: 'external',
    slug: 'chatgpt',
    name: 'ChatGPT',
    nameEn: 'OpenAI',
    summary: 'OpenAI 的通用对话模型，写作、编程、翻译与数据分析均有覆盖，支持联网检索与文件解析。',
    note: '生态最完整的一个：插件、Canvas、语音、图像生成都在同一个入口里。国内需要境外网络。',
    url: 'https://chatgpt.com/',
    featured: true,
    daysAgo: 6,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/create',
      'attr/need-proxy',
      'attr/zh-ui',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
      'quality/editor-pick',
      'quality/high-repute',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'claude',
    name: 'Claude',
    nameEn: 'Anthropic',
    summary: 'Anthropic 的对话模型，长文本理解与代码改动见长，适合处理整份文档和成规模的代码库。',
    note: '输出风格偏克制，写正式文档比多数模型省事；Projects 可以把资料固定成上下文。',
    url: 'https://claude.ai/',
    daysAgo: 8,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/create',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
      'quality/high-repute',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'gemini',
    name: 'Gemini',
    nameEn: 'Google',
    summary: 'Google 的对话模型，与搜索、YouTube、Gmail 等自家服务打通，多模态输入支持完整。',
    note: '要查带来源的资料时比较省心，回答里直接附引用链接。',
    url: 'https://gemini.google.com/',
    daysAgo: 10,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/create',
      'attr/need-proxy',
      'attr/zh-ui',
      'attr/free',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
      'quality/high-repute',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'grok',
    name: 'Grok',
    nameEn: 'xAI',
    summary: 'xAI 的对话模型，直接读取 X 的实时内容，适合跟热点、查正在发生的事。',
    url: 'https://grok.com/',
    daysAgo: 24,
    tags: [
      'topic/ai',
      'scene/fun',
      'scene/work',
      'attr/need-proxy',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'copilot',
    name: 'Copilot',
    nameEn: 'Microsoft',
    summary: 'Microsoft 的 AI 助手，接入 Windows、Office 与 Edge，写文档做表格时可直接调用。',
    url: 'https://copilot.microsoft.com/',
    daysAgo: 28,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'attr/need-proxy',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'le-chat',
    name: 'Le Chat',
    nameEn: 'Mistral AI',
    summary: 'Mistral AI 的对话入口，以响应速度见长，欧洲模型里生态相对完整的一个。',
    url: 'https://chat.mistral.ai/',
    daysAgo: 34,
    tags: [
      'topic/ai',
      'scene/work',
      'attr/need-proxy',
      'attr/free',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'llama',
    name: 'Llama',
    nameEn: 'Meta',
    summary: 'Meta 的开放权重模型，权重可自行部署，站点提供模型卡、许可说明与下载入口。',
    note: '想在自己机器上跑模型，从这里开始看许可证和硬件要求。',
    url: 'https://llama.com/',
    daysAgo: 40,
    tags: [
      'topic/ai',
      'scene/digital',
      'attr/open-source',
      'attr/need-proxy',
      'attr/free',
      'platform/web',
      'price/free',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'qwen',
    name: 'Qwen',
    nameEn: 'Alibaba',
    summary: '阿里通义的开发者与海外入口，Qwen 系列开放权重的模型卡、在线 Demo 与 API 文档都在这。',
    url: 'https://qwen.ai/',
    daysAgo: 30,
    tags: [
      'topic/ai',
      'scene/digital',
      'attr/open-source',
      'attr/free',
      'platform/web',
      'price/free',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'qianwen',
    name: '千问',
    nameEn: '阿里通义',
    summary: '阿里通义的国内对话入口，中文语境与本土知识处理得较好，支持文档问答与联网检索。',
    url: 'https://www.tongyi.com/',
    daysAgo: 14,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/create',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'deepseek',
    name: 'DeepSeek',
    nameEn: '深度求索',
    summary: '深度求索的对话模型，推理与代码能力突出，中文写作稳定，网页端可直接使用。',
    note: '免费额度之外的性价比也高，国内直连、不需要境外网络。',
    url: 'https://chat.deepseek.com/',
    featured: true,
    daysAgo: 4,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/digital',
      'attr/zh-ui',
      'attr/free',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/free',
      'quality/editor-pick',
      'quality/high-repute',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'kimi',
    name: 'Kimi',
    nameEn: '月之暗面',
    summary: '月之暗面的对话模型，长文档与联网检索是强项，适合读论文、研报和长篇材料。',
    url: 'https://www.kimi.com/',
    daysAgo: 12,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'attr/zh-ui',
      'attr/free',
      'attr/ads-free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
      'quality/high-repute',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'doubao',
    name: '豆包',
    nameEn: '字节跳动',
    summary: '字节跳动的对话助手，覆盖写作、翻译、口语练习与图像生成，移动端体验完整。',
    url: 'https://www.doubao.com/',
    daysAgo: 18,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/create',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'wenxin',
    name: '文心',
    nameEn: '百度',
    summary: '百度的对话助手，依托自家搜索与文库，查资料、写公文、整理表格都在同一个入口。',
    url: 'https://yiyan.baidu.com/',
    daysAgo: 20,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'chatglm',
    name: '智谱清言',
    nameEn: 'GLM',
    summary: '智谱 AI 的对话入口，GLM 系列模型，支持文档解析、代码与图表生成。',
    url: 'https://chatglm.cn/',
    daysAgo: 22,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'yuanbao',
    name: '腾讯元宝',
    nameEn: '混元',
    summary: '腾讯的对话助手，混元与 DeepSeek 双模型可选，可检索公众号内容并接入腾讯文档。',
    url: 'https://yuanbao.tencent.com/',
    daysAgo: 26,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'platform/windows',
      'platform/macos',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'xinghuo',
    name: '讯飞星火',
    nameEn: '科大讯飞',
    summary: '科大讯飞的对话模型，语音输入与实时翻译是特色，中文口语场景适配较好。',
    url: 'https://xinghuo.xfyun.cn/',
    daysAgo: 32,
    tags: [
      'topic/ai',
      'scene/work',
      'scene/study',
      'scene/travel',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'tiangong',
    name: '天工',
    nameEn: '昆仑万维',
    summary: '昆仑万维的 AI 助手，主打办公智能体，可生成文档、表格与演示文稿。',
    url: 'https://www.tiangong.cn/',
    daysAgo: 36,
    tags: [
      'topic/ai',
      'scene/work',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },
  {
    type: 'site',
    linkMode: 'external',
    slug: 'minimax',
    name: 'MiniMax',
    nameEn: '海螺 AI',
    summary: 'MiniMax 的模型与产品入口，海螺 AI 提供对话、语音与视频生成能力。',
    url: 'https://www.minimaxi.com/',
    daysAgo: 38,
    tags: [
      'topic/ai',
      'scene/create',
      'scene/fun',
      'attr/zh-ui',
      'attr/free',
      'platform/web',
      'platform/ios',
      'platform/android',
      'price/freemium',
    ],
  },

  /* ── 自研工具（linkMode='internal'，component 必须与 src/tools/registry.ts 对齐） ── */
  {
    type: 'tool',
    linkMode: 'internal',
    slug: 'eat-today',
    name: '今天吃什么',
    summary: '中午点外卖选不出来的时候，让清单替你决定：默认带一份常见的外卖清单，可以自己增删改。',
    note: '清单只存在这台设备的浏览器缓存里，不上传也不跨设备。默认那 12 个是按中午外卖的高频选项挑的，先删掉不吃的，再加自己常点的，命中率会高不少。',
    daysAgo: 0,
    tags: [
      'scene/food',
      'attr/free',
      'attr/no-login',
      'attr/no-install',
      'attr/ads-free',
      'platform/web',
      'price/free',
    ],
    tool: { component: 'eat-today', runtime: 'client', version: '1.0.0' },
  },
  {
    type: 'tool',
    linkMode: 'internal',
    slug: 'farm-planner',
    name: '护肝农场',
    summary:
      '给 QQ 农场这类种菜游戏算下种时间：按你设的休息时段和土地类型，列出每块地的成熟时刻，让收菜不落在睡觉时间里。',
    note: '成熟时刻全部避开休息时段的地会标「合适」，卡在凌晨的那一季会标红。两季作物的第二季按减半算，黑土地提速 10%、金土地提速 20%。休息时段和土地配置存在浏览器缓存里。',
    daysAgo: 0,
    tags: [
      'scene/fun',
      'attr/free',
      'attr/no-login',
      'attr/no-install',
      'attr/ads-free',
      'platform/web',
      'price/free',
    ],
    tool: { component: 'farm-planner', runtime: 'client', version: '1.0.0' },
  },
];

/* ────────────────────────── 执行 ────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoToDate(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function seedTags(): { created: number; total: number } {
  let created = 0;

  for (const seed of TAG_SEEDS) {
    const existing = db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.dim, seed.dim), eq(tags.slug, seed.slug)))
      .get();

    if (existing) {
      db.update(tags)
        .set({ name: seed.name, color: seed.color, icon: seed.icon, desc: seed.desc, sort: seed.sort })
        .where(eq(tags.id, existing.id))
        .run();
    } else {
      db.insert(tags).values(seed).run();
      created += 1;
    }
  }

  return { created, total: TAG_SEEDS.length };
}

function seedAdmin(): { email: string; created: boolean } {
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error('缺少 ADMIN_PASSWORD 环境变量，无法创建管理员账号（检查 .env.local）');
  }

  // 明文密码绝不入库、绝不进日志
  const passwordHash = bcrypt.hashSync(password, 10);
  const existing = db.select({ key: settings.key }).from(settings).where(eq(settings.key, 'admin')).get();

  if (existing) {
    db.update(settings).set({ value: { email, passwordHash }, updatedAt: new Date() }).where(eq(settings.key, 'admin')).run();
    return { email, created: false };
  }

  db.insert(settings).values({ key: 'admin', value: { email, passwordHash } }).run();
  return { email, created: true };
}

function seedEntries(): { created: number; skipped: number; byType: Record<string, number> } {
  let created = 0;
  let skipped = 0;
  const byType: Record<string, number> = { tool: 0, site: 0, shop: 0 };

  for (const seed of ENTRY_SEEDS) {
    const existing = db
      .select({ id: entries.id, mapQuery: entries.mapQuery })
      .from(entries)
      .where(and(eq(entries.type, seed.type), eq(entries.slug, seed.slug)))
      .get();

    if (existing) {
      skipped += 1;
      byType[seed.type] += 1;

      // 已存在的条目一律不覆盖（站长的编辑优先），只补 map_query 这一个新列：
      // 库里是空的、seed 里有值才写，永远不动已有值。
      if (seed.mapQuery && !existing.mapQuery) {
        db.update(entries).set({ mapQuery: seed.mapQuery }).where(eq(entries.id, existing.id)).run();
      }

      continue;
    }

    const createdAt = daysAgoToDate(seed.daysAgo);

    const inserted = db
      .insert(entries)
      .values({
        type: seed.type,
        linkMode: seed.linkMode,
        slug: seed.slug,
        name: seed.name,
        nameEn: seed.nameEn,
        summary: seed.summary,
        url: seed.url,
        mapQuery: seed.linkMode === 'place' ? (seed.mapQuery ?? null) : null,
        note: seed.note,
        meta: seed.meta ?? {},
        featured: seed.featured ?? false,
        status: seed.status ?? 'active',
        sortWeight: seed.featured ? 100 : 0,
        viewCount: seed.viewCount ?? 0,
        clickCount: seed.clickCount ?? 0,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: entries.id })
      .get();

    const entryId = inserted.id;

    // 标签
    for (const composite of seed.tags) {
      const [dim, slug] = composite.split('/');
      const tag = db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.dim, dim), eq(tags.slug, slug)))
        .get();

      if (!tag) {
        throw new Error(`条目 ${seed.slug} 引用了不存在的标签：${composite}`);
      }

      db.insert(entryTags).values({ entryId, tagId: tag.id }).onConflictDoNothing().run();
    }

    // 自研工具的 entry_tools 行：component 必须与 src/tools/registry.ts 对齐
    if (seed.tool) {
      if (!isToolSlug(seed.tool.component)) {
        throw new Error(`条目 ${seed.slug} 的组件「${seed.tool.component}」没有在 src/tools/registry.ts 注册`);
      }

      db.insert(entryTools)
        .values({
          entryId,
          component: seed.tool.component,
          runtime: seed.tool.runtime,
          requiresLogin: seed.tool.requiresLogin ?? false,
          version: seed.tool.version ?? null,
          changelog: [],
        })
        .run();
    }

    // 门店
    if (seed.branches) {      seed.branches.forEach((branch, index) => {
        db.insert(entryBranches)
          .values({
            entryId,
            name: branch.name,
            address: branch.address,
            province: branch.province,
            city: branch.city,
            district: branch.district,
            lat: branch.lat,
            lng: branch.lng,
            poiSource: branch.lat !== undefined ? 'manual' : null,
            phone: branch.phone,
            hours: branch.hours,
            priceLevel: branch.priceLevel,
            isPrimary: branch.isPrimary ?? index === 0,
            sort: index * 10,
            status: 'active',
          })
          .run();
      });
    }

    created += 1;
    byType[seed.type] += 1;
  }

  return { created, skipped, byType };
}

function seedSettings(): { created: number } {
  const defaults: Array<[string, unknown]> = [
    ['submissionsOpen', true],
    ['maintenanceMode', false],
    ['defaultVisibility', 'public'],
  ];

  let created = 0;

  for (const [key, value] of defaults) {
    const existing = db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get();
    if (existing) continue;
    db.insert(settings).values({ key, value }).run();
    created += 1;
  }

  return { created };
}

function main(): void {
  const tagResult = seedTags();
  const admin = seedAdmin();
  const settingsResult = seedSettings();
  const entryResult = seedEntries();

  const totalEntries = db.select({ id: entries.id }).from(entries).all().length;
  const totalTags = db.select({ id: tags.id }).from(tags).all().length;
  const branchCount = db.select({ id: entryBranches.id }).from(entryBranches).all().length;

  console.log('');
  console.log(`标签 ${totalTags} 个（本次新建 ${tagResult.created} 个）`);
  console.log(
    `条目 ${totalEntries} 条（工具 ${entryResult.byType.tool} / 站点 ${entryResult.byType.site} / 店铺 ${entryResult.byType.shop}，` +
      `本次新建 ${entryResult.created} 条、跳过已存在 ${entryResult.skipped} 条）`,
  );
  console.log(`门店 ${branchCount} 条`);
  console.log(`管理员账号已就绪：${admin.email}${admin.created ? '（本次创建）' : '（本次更新密码）'}`);
  console.log(`站点设置 ${settingsResult.created > 0 ? `已初始化 ${settingsResult.created} 项` : '已存在，未改动'}`);
  console.log('');
}

main();
