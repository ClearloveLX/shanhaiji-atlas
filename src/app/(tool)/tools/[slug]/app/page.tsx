import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Info } from 'lucide-react';
import UsagePing from '@/components/tools/UsagePing';
import { Skeleton } from '@/components/ui/skeleton';
import { getPublicEntryBySlug } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { isToolSlug, TOOL_REGISTRY } from '@/tools/registry';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('tool', slug);

  if (!entry) return { title: '工具不存在' };

  return {
    title: `${entry.name} · 在线使用`,
    description: entry.summary,
    alternates: { canonical: `/tools/${entry.slug}/app` },
    robots: { index: true, follow: true },
  };
}

/**
 * 自研工具的运行页。
 * 极窄容器、无全站导航、无页脚、无推荐位 —— 用工具的人只想干活。
 */
export default async function ToolAppPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = await getPublicEntryBySlug('tool', slug);

  if (!entry || entry.linkMode !== 'internal' || !entry.tool) notFound();

  await trackPageView({ path: `/tools/${entry.slug}/app`, kind: 'tool', entryId: entry.id });

  const component = entry.tool.component;

  if (!isToolSlug(component)) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <h1 className="text-base font-semibold">这个工具暂时打不开</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            条目里登记的组件名{' '}
            <code className="num rounded-md bg-muted px-1.5 py-0.5 text-xs">{component}</code> 没有在{' '}
            <code className="num rounded-md bg-muted px-1.5 py-0.5 text-xs">src/tools/registry.ts</code> 注册。
          </p>
          <Link href={`/tools/${entry.slug}`} className="mt-4 inline-block text-sm text-brand hover:underline">
            回详情页
          </Link>
        </div>
      </main>
    );
  }

  // 静态 import 路径 + 动态 import()：工具代码单独成 chunk，不进首屏
  const Tool = (await TOOL_REGISTRY[component].load()).default;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/tools/${entry.slug}`}
              aria-label="返回工具详情页"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <h1 className="truncate text-sm font-medium">{entry.name}</h1>
          </div>

          <Link
            href={`/tools/${entry.slug}`}
            className="flex shrink-0 items-center gap-1 rounded-full text-xs text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            <Info className="size-3.5" aria-hidden />
            关于这个工具
          </Link>
        </header>

        <main className="py-6">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Tool />
          </Suspense>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-4 text-xs text-muted-foreground">
          <span>
            版本 <span className="num">{entry.tool.version ?? '1.0.0'}</span>
          </span>
          <span>所有处理都在本地完成，内容不会上传到服务器</span>
        </footer>
      </div>

      <UsagePing entryId={entry.id} />
    </div>
  );
}
