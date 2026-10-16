import type { Metadata } from 'next';
import Link from 'next/link';
import MeEntryList from '@/components/admin/MeEntryList';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchAdminEntries } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: '站长区 · 全量搜索', robots: { index: false, follow: false } };

/** 全量搜索：三种可见性都能搜到（含私密条目的私人备注） */
export default async function MeSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const keyword = (raw ?? '').trim();

  const results = keyword ? await searchAdminEntries(keyword, 100) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">全量搜索</h1>
      <p className="text-sm text-neutral-500">这一页会搜到私密条目和私人备注，公开站点的搜索看不到这些。</p>

      <form autoComplete="off" spellCheck={false} action="/me/search" method="get" className="flex max-w-xl gap-2">
        <label htmlFor="me-search-q" className="sr-only">
          搜索全部条目
        </label>
        <Input autoComplete="off" spellCheck={false} id="me-search-q" name="q" defaultValue={keyword} placeholder="搜名称、简介、备注" />
        <Button type="submit">搜索</Button>
      </form>

      {keyword ? (
        <p className="text-sm text-neutral-500" aria-live="polite">
          找到 {results.length} 条
        </p>
      ) : null}

      {results.length > 0 ? <MeEntryList entries={results} /> : null}

      {keyword && results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          没有匹配的条目。
          <Link href="/admin/entries/new" className="ml-2 text-primary hover:underline">
            新建一条
          </Link>
        </p>
      ) : null}
    </div>
  );
}
