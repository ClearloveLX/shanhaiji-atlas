/**
 * 站点配置的唯一来源。
 * 其它文件一律从这里读，禁止硬编码站名 / slogan / 导航。
 */

export type NavItem = {
  title: string;
  href: string;
};

export const siteConfig = {
  name: '山海集',
  nameEn: 'Atlas',
  /** 品牌定式：中间「·」+ 半角空格 */
  fullName: '山海集 · Atlas',
  slogan: '万物皆可收录，一签就能找到',
  description:
    '山海集 Atlas 收录工具分享、站点分享、源码分享与好店分享，按场景、属性、平台等多维度标签组织，支持搜索、多标签筛选与标签聚合页。',
  locale: 'zh-CN',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000',
  /**
   * 顶栏导航用短名（工具 / 站点 / 源码 / 好店）：
   * 1024 宽时「工具分享」这种四字标签会把导航挤到折行（连「推荐收录」也跟着折）。
   * 分类的全名（工具分享 / 站点分享 / 源码分享 / 好店分享）在首页数字行、入口卡、
   * 列表页标题、面包屑和后台里，见 src/lib/tags.ts 的 ENTRY_TYPE_LABELS。
   */
  nav: [
    { title: '首页', href: '/' },
    { title: '工具', href: '/tools' },
    { title: '站点', href: '/sites' },
    { title: '源码', href: '/codes' },
    { title: '好店', href: '/shops' },
    { title: '标签', href: '/tags' },
  ] satisfies NavItem[],
} as const;

/** URL 拼接统一走这里，不带尾斜杠 */
export function absoluteUrl(path = '/'): string {
  const base = siteConfig.url.replace(/\/+$/, '');
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path === '/' ? '' : path}`;
}
