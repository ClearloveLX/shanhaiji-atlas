import type { Metadata } from 'next';
import EntryFilters from '@/components/admin/EntryFilters';
import EntryTable, { type AdminEntryRow } from '@/components/admin/EntryTable';
import { getAdminAllTags, getAdminEntries, getAdminEntryPositions, type EntrySort } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = {
  title: '条目管理',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;
const SORTS: EntrySort[] = ['newest', 'updated', 'name', 'featured', 'manual'];

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** 列表页：筛选和分页状态全部写在 URL 里，刷新和分享链接结果一致 */
export default async function AdminEntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const keyword = first(sp.q);
  const type = first(sp.type);
  const status = first(sp.status);
  const linkMode = first(sp.mode);
  const visibility = first(sp.visibility);
  const sortParam = first(sp.sort);
  // 默认「手动排序」：后台列表默认就该是站长自己排的那套顺序，
  // 而不是「按更新时间」——不然每次点进来看到的都不是他刚调好的样子。
  const sort: EntrySort = SORTS.includes(sortParam as EntrySort) ? (sortParam as EntrySort) : 'manual';
  const dir: 'asc' | 'desc' = first(sp.dir) === 'asc' ? 'asc' : 'desc';
  const tagKeys = first(sp.tags)
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  const [paged, allTags, positions] = await Promise.all([
    getAdminEntries({
      type: type || undefined,
      status: status || undefined,
      linkMode: linkMode || undefined,
      visibility: visibility || undefined,
      keyword: keyword || undefined,
      tagKeys,
      sort,
      dir,
      page,
      pageSize: PAGE_SIZE,
    }),
    getAdminAllTags(),
    // 只有手动排序视图才需要「第几位」，其它排序下序号就是当前列表的行号
    sort === 'manual' ? getAdminEntryPositions() : Promise.resolve(undefined),
  ]);

  const rows: AdminEntryRow[] = paged.items.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    type: item.type,
    linkMode: item.linkMode,
    status: item.status,
    visibility: item.visibility,
    featured: item.featured,
    icon: item.icon,
    url: item.url,
    clickCount: item.clickCount,
    viewCount: item.viewCount,
    updatedLabel: formatRelative(item.updatedAt),
    tags: item.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, dim: tag.dim })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">条目管理</h1>
        <span className="text-sm text-neutral-500">
          共 <span className="tabular-nums">{paged.total}</span> 条
        </span>
      </div>

      <EntryFilters
        tags={allTags.map((tag) => ({
          id: tag.id,
          dim: tag.dim,
          slug: tag.slug,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        }))}
        keyword={keyword}
        type={type}
        status={status}
        linkMode={linkMode}
        visibility={visibility}
        sort={sort}
        tagKeys={tagKeys}
        total={paged.total}
      />

      <EntryTable
        rows={rows}
        total={paged.total}
        page={paged.page}
        totalPages={paged.totalPages}
        pageSize={paged.pageSize}
        sort={sort === 'newest' ? 'updated' : sort}
        dir={dir}
        positions={positions}
        tags={allTags.map((tag) => ({
          id: tag.id,
          dim: tag.dim,
          slug: tag.slug,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        }))}
      />
    </div>
  );
}
