import Link from 'next/link';

export type MeQrcodeItem = {
  id: string;
  label: string;
  image: string;
  isActive: boolean;
  expiresAt: string | null;
};

/** 站长区里看二维码：带过期状态，点进去到二维码看板改 */
export default function MeQrcodeList({ items }: { items: MeQrcodeItem[] }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {items.map((item) => {
        const expired = item.expiresAt ? new Date(item.expiresAt).getTime() < Date.now() : false;

        return (
          <li key={item.id} className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt={`${item.label}二维码`} className="size-24 rounded border border-neutral-200 object-contain" />
            <span className="text-xs">{item.label}</span>
            <span className={expired ? 'text-[11px] text-rose-600' : 'text-[11px] text-neutral-400'}>
              {expired ? '已过期' : item.isActive ? '启用中' : '已停用'}
            </span>
          </li>
        );
      })}
      <li className="self-center text-xs">
        <Link href="/admin/qrcodes" className="text-primary hover:underline">
          去二维码看板
        </Link>
      </li>
    </ul>
  );
}
