import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPublicEntries, getPublicEntryBySlug, getPublicRedirectEntry } from '@/db/queries';
import { listSegmentOf } from '@/lib/revalidate';

export const metadata: Metadata = {
  title: '这个链接可能已经失效',
  robots: { index: false, follow: false },
};

/**
 * 外链跳转的兜底页之二：条目存在但被标成 dead（或本来就没有外链）。
 * 给同类推荐，别让用户白跑一趟。
 */
export default async function GoGonePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;

  const entry = from ? await getPublicRedirectEntry(from) : null;
  const detail = entry ? await getPublicEntryBySlug(entry.type, entry.slug) : null;

  const sceneTag = detail?.tags.find((tag) => tag.dim === 'scene');
  const recommendations = sceneTag
    ? (await getPublicEntries({ tagKeys: [`scene/${sceneTag.slug}`], pageSize: 6 })).items
        .filter((item) => item.id !== entry?.id && item.status === 'active')
        .slice(0, 4)
    : [];

  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-[560px] self-center">
        <div className="surface p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </span>

          <h1 className="mt-5 text-xl font-semibold tracking-tight">这个链接可能已经失效</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {entry
              ? `「${entry.name}」已被标记为失效，请暂勿访问。`
              : '该跳转编号没有对应条目。'}
          </p>

          <form autoComplete="off" spellCheck={false} action="/search" method="get" className="mt-6 flex gap-2">
            <label htmlFor="go-gone-q" className="sr-only">
              搜索收录
            </label>
            <Input autoComplete="off" spellCheck={false} id="go-gone-q" name="q" placeholder="更换关键词再试" />
            <Button type="submit">搜索</Button>
          </form>

          {recommendations.length > 0 ? (
            <section className="mt-7" aria-labelledby="go-gone-recs">
              <div className="hairline" />
              <h2 id="go-gone-recs" className="eyebrow mt-5">
                同类中仍可使用的收录
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {recommendations.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/${listSegmentOf(item.type)}/${item.slug}`}
                      className="block rounded-lg border border-border px-3 py-2.5 transition-colors duration-150 hover:border-foreground/20 hover:bg-accent"
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{item.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="hairline mt-6" />

          <div className="mt-5 flex gap-4 text-sm">
            <Link href="/" className="text-brand hover:underline">
              回首页
            </Link>
            <Link href="/submit" className="text-brand hover:underline">
              告诉我们它挂了
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
