import type { Metadata } from 'next';
import TagManager from '@/components/admin/TagManager';
import { getAdminTagEntryIndex, getAdminTagTree } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '标签管理',
  robots: { index: false, follow: false },
};

const PREVIEW_LIMIT = 10;

export default async function AdminTagsPage() {
  await requireAdmin();

  const [tagTree, entryIndex] = await Promise.all([getAdminTagTree(), getAdminTagEntryIndex()]);

  const previews: Record<string, Array<{ id: string; name: string; type: string }>> = {};
  for (const row of entryIndex) {
    const list = previews[row.tagId] ?? [];
    if (list.length >= PREVIEW_LIMIT) continue;
    list.push({ id: row.entryId, name: row.name, type: row.type });
    previews[row.tagId] = list;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">标签管理</h1>
        <span className="text-sm text-neutral-500">
          共 <span className="tabular-nums">{tagTree.length}</span> 个标签
        </span>
      </div>

      <TagManager
        tags={tagTree.map((tag) => ({
          id: tag.id,
          dim: tag.dim,
          slug: tag.slug,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          desc: tag.desc,
          sort: tag.sort,
          count: tag.count,
        }))}
        entryPreviews={previews}
      />
    </div>
  );
}
