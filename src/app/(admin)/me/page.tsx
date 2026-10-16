import Link from 'next/link';
import type { Metadata } from 'next';
import MeEntryList from '@/components/admin/MeEntryList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminEntries, getMeDashboard } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '站长区',
  robots: { index: false, follow: false },
};

/** /me 首页：我的私藏 / 想去 / 最近添加 / 待办 */
export default async function MeHomePage() {
  await requireAdmin();

  const [stats, recent] = await Promise.all([getMeDashboard(), getAdminEntries({ pageSize: 12, sort: 'updated' })]);

  const cards = [
    { label: '全部条目', value: stats.total, href: '/admin/entries' },
    { label: '私密', value: stats.privateCount, href: '/admin/entries?visibility=private' },
    { label: '不列出', value: stats.unlistedCount, href: '/admin/entries?visibility=unlisted' },
    { label: '想去', value: stats.todo, href: '/me/notes' },
    { label: '去过', value: stats.visited, href: '/me/notes' },
    { label: '有笔记', value: stats.notes, href: '/me/notes' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">我的收录</h1>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Card className="gap-1 rounded-lg py-4 transition-shadow hover:shadow-md">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-normal text-neutral-500">{card.label}</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <section aria-labelledby="me-recent">
        <h2 id="me-recent" className="text-sm font-medium text-neutral-500">
          最近改动
        </h2>
        <div className="mt-3">
          <MeEntryList entries={recent.items} />
        </div>
      </section>
    </div>
  );
}
