import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MeQrcodeList from '@/components/admin/MeQrcodeList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminEntryById } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { listSegment, sortChips } from '@/lib/tags';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: '站长区 · 条目详情', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  todo: '想去',
  visited: '去过',
  verified: '已验证',
  avoid: '踩雷',
};

const VISIBILITY_LABELS: Record<string, string> = { public: '公开', unlisted: '不列出', private: '私密' };

/** 私密条目详情：复用前台详情的信息结构，另外把 entry_private 的字段显示出来 */
export default async function MeEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const entry = await getAdminEntryById(id);

  if (!entry) notFound();

  const profile = entry.privateProfile;
  const chips = sortChips(entry.tags);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {entry.name}
            {entry.nameEn ? <span className="ml-2 text-sm font-normal text-neutral-500">{entry.nameEn}</span> : null}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            {VISIBILITY_LABELS[entry.visibility] ?? entry.visibility} · {entry.type} · /{entry.slug}
            {entry.deletedAt ? ' · 已删除（回收站）' : ''}
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/entries/${entry.id}/edit`}>去后台编辑</Link>
          </Button>
          {entry.visibility === 'public' ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/${listSegment(entry.type)}/${entry.slug}`}
                target="_blank"
                rel="noopener"
              >
                看公开页
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5 text-sm">
          <p className="leading-relaxed text-neutral-700">{entry.summary}</p>

          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: `${tag.color}55`, color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <dt className="text-neutral-500">收录时间</dt>
              <dd>{formatDate(entry.createdAt)}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <dt className="text-neutral-500">更新时间</dt>
              <dd>{formatDate(entry.updatedAt)}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <dt className="text-neutral-500">点击次数</dt>
              <dd className="tabular-nums">{entry.clickCount}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <dt className="text-neutral-500">状态</dt>
              <dd>{entry.status}</dd>
            </div>
          </dl>

          {entry.url ? (
            <p className="text-xs text-neutral-500">
              外链：{entry.url}（前台走 /go/{entry.slug}）
            </p>
          ) : null}

          {entry.note ? <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{entry.note}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">私密信息</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {profile ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <dt className="text-neutral-500">我的评分</dt>
                <dd>{profile.rating ? '★'.repeat(profile.rating) : '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <dt className="text-neutral-500">我的状态</dt>
                <dd>{profile.status ? (STATUS_LABELS[profile.status] ?? profile.status) : '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <dt className="text-neutral-500">联系方式</dt>
                <dd>{profile.contact ?? '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <dt className="text-neutral-500">实际花费</dt>
                <dd>{profile.paid ?? '—'}</dd>
              </div>
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <dt className="text-neutral-500">到访日期</dt>
                <dd>{profile.visitedOn ? formatDate(profile.visitedOn) : '—'}</dd>
              </div>
              {profile.note ? (
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500">私人备注</dt>
                  <dd className="mt-1 whitespace-pre-line leading-relaxed">{profile.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">这条还没有私密信息。去编辑页的「私密信息」里补。</p>
          )}
        </CardContent>
      </Card>

      {entry.branches.length > 0 ? (
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">门店（{entry.branches.length}）</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <ul className="flex flex-col gap-2 text-sm">
              {entry.branches.map((branch) => (
                <li key={branch.id} className="rounded-md border border-neutral-200 p-3">
                  <p className="font-medium">
                    {branch.city}
                    {branch.district ? ` · ${branch.district}` : ''}
                    {branch.name ? ` · ${branch.name}` : ''}
                    {branch.isPrimary ? <span className="ml-2 text-[11px] text-primary">主店</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{branch.address}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {branch.lat != null && branch.lng != null ? `${branch.lng}, ${branch.lat}` : '未定位'}
                    {branch.hours ? ` · ${branch.hours}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {entry.qrcodes.length > 0 ? (
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">二维码（{entry.qrcodes.length}）</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <MeQrcodeList
              items={entry.qrcodes.map((qrcode) => ({
                id: qrcode.id,
                label: qrcode.label,
                image: qrcode.image,
                isActive: qrcode.isActive,
                expiresAt: qrcode.expiresAt ? new Date(qrcode.expiresAt).toISOString() : null,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
