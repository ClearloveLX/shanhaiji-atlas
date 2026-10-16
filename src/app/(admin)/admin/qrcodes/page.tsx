import type { Metadata } from 'next';
import QrcodeBoard, { type QrcodeBoardItem } from '@/components/admin/QrcodeBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminQrcodeBoard } from '@/db/queries';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: '二维码看板',
  robots: { index: false, follow: false },
};

const SOON_MS = 3 * 24 * 60 * 60 * 1000;

function remainingLabel(expiresAt: Date | null): string {
  if (!expiresAt) return '长期有效';

  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return '已过期';

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `还有 ${days} 天`;
  return `还有 ${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))} 小时`;
}

/** ★ 每周必看的页面：微信群码 7 天就失效，用户扫到过期码会直接失信 */
export default async function AdminQrcodesPage() {
  await requireAdmin();

  const rows = await getAdminQrcodeBoard(200);

  const items: QrcodeBoardItem[] = rows.map((row) => {
    const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
    const diff = expiresAt ? expiresAt.getTime() - Date.now() : Number.POSITIVE_INFINITY;

    const status: QrcodeBoardItem['status'] = !row.isActive
      ? 'inactive'
      : diff <= 0
        ? 'expired'
        : diff <= SOON_MS
          ? 'soon'
          : 'ok';

    return {
      id: row.id,
      label: row.label,
      kind: row.kind,
      image: row.image,
      tip: row.tip,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isActive: row.isActive,
      showCount: row.showCount,
      entryId: row.entryId,
      entryName: row.entryName,
      entrySlug: row.entrySlug,
      entryType: row.entryType,
      status,
      remainingLabel: remainingLabel(expiresAt),
    };
  });

  const stats = {
    active: items.filter((item) => item.status === 'ok' || item.status === 'soon').length,
    soon: items.filter((item) => item.status === 'soon').length,
    expired: items.filter((item) => item.status === 'expired').length,
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">二维码看板</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: '有效', value: stats.active },
          { label: '7 天内到期', value: stats.soon },
          { label: '已过期', value: stats.expired },
        ].map((card) => (
          <Card key={card.label} className="gap-1 rounded-lg py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-normal text-neutral-500">{card.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <QrcodeBoard items={items} />
    </div>
  );
}
