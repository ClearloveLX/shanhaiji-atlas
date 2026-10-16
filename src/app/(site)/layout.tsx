import Link from 'next/link';
import { logoutAction } from '@/actions/auth';
import SiteFooter from '@/components/layout/SiteFooter';
import SiteHeader from '@/components/layout/SiteHeader';
import { getPublicTagTree, getSiteSettings } from '@/db/queries';
import { auth } from '@/lib/auth';
import { siteConfig } from '@/lib/site-config';

/**
 * 前台路由组布局：顶栏 + 内容 + 页脚。
 *
 * ⚠️ 两件事必须记住：
 *   1. 自研工具运行页 /tools/{slug}/app 不在这个布局树下（它走 (tool) 路由组）
 *   2. 这里虽然有 auth()，但**只用来决定要不要显示站长模式提示条、是否绕过维护模式**，
 *      **绝不改变页面内容** —— 公开页面的数据永远来自 getPublic*（见 docs/PRIVACY.md 铁律 1）
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [tagTree, settings, session] = await Promise.all([getPublicTagTree(), getSiteSettings(), auth()]);
  const isAdmin = Boolean(session);

  const tags = tagTree
    .filter((tag) => tag.count > 0 && tag.dim !== 'private')
    .map((tag) => ({ slug: tag.slug, name: tag.name, dim: tag.dim }));

  // 维护模式：访客看到公告，站长照常看完整内容（方便边改边看）
  if (settings.maintenanceMode && !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center">
          <span className="eyebrow">维护中</span>
          <h1 className="mt-4 text-xl font-semibold">{siteConfig.fullName} 正在整理中</h1>
          <p className="mt-2 text-sm text-muted-foreground">收录正在整理中，请稍后再访问。站长登录后可继续。</p>
          <Link href="/login" className="mt-5 inline-block text-sm text-brand hover:underline">
            站长登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {isAdmin ? (
        <div className="bg-primary px-4 py-1.5 text-xs text-primary-foreground sm:px-6">
          <div className="shell flex flex-wrap items-center gap-x-3 gap-y-1 px-0">
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
            <span>站长模式 · 你正在看公开视图</span>
            <Link href="/me" className="underline underline-offset-2">
              进入 /me
            </Link>
            <Link href="/admin" className="underline underline-offset-2">
              进入 /admin
            </Link>
            <form action={logoutAction} className="ml-auto">
              <button type="submit" className="underline underline-offset-2">
                退出
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <SiteHeader tags={tags} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
