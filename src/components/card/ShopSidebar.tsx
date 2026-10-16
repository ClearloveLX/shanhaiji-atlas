import Link from 'next/link';
import { Clock, ExternalLink, Phone } from 'lucide-react';
import BranchList, { type BranchRow } from '@/components/card/BranchList';
import NearestShopLinks from '@/components/card/NearestShopLinks';
import QrcodeCards, { type QrcodeCardData } from '@/components/card/QrcodeCards';
import type { EntryDetail } from '@/db/queries';
import { amapStaticMapUrl, hasCoords, mapSearchKeyword } from '@/lib/map-links';

/**
 * 线下店的侧栏：门店列表（连锁按城市分组）+ 静态地图 + 「在地图上找最近的」+ 二维码。
 * 地图用高德**静态图 API**（一张图 URL），不加载 JS SDK、不吃 Web 端配额；
 * 没配 AMAP_KEY 就整块不渲染，页面其余部分照常。
 *
 * 门店列表可以为空：连锁品牌不维护地址时，靠 mapQuery / 条目名让访客在地图上找最近的。
 */
export default function ShopSidebar({ detail }: { detail: EntryDetail }) {
  const branches: BranchRow[] = detail.branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    district: branch.district,
    phone: branch.phone,
    hours: branch.hours,
    priceLevel: branch.priceLevel,
    lat: branch.lat,
    lng: branch.lng,
    isPrimary: branch.isPrimary,
  }));

  const primary = branches.find((branch) => branch.isPrimary) ?? branches[0];
  const amapKey = process.env.AMAP_KEY ?? '';
  const searchKeyword = mapSearchKeyword(detail.name, detail.mapQuery);
  /** place 一定有「怎么去」这个出口；线上店只有填了地图搜索词才显示（说明它也有实体店） */
  const showMapSearch = detail.linkMode === 'place' || Boolean(detail.mapQuery);

  const staticMap =
    primary && hasCoords(primary) && amapKey
      ? amapStaticMapUrl({
          name: primary.name ? `${detail.name}（${primary.name}）` : detail.name,
          lng: primary.lng,
          lat: primary.lat,
          key: amapKey,
        })
      : null;

  const activeQrcodes: Array<QrcodeCardData & { kind: string }> = detail.qrcodes
    .filter((qrcode) => qrcode.isActive && (!qrcode.expiresAt || new Date(qrcode.expiresAt).getTime() > Date.now()))
    .sort((a, b) => a.sort - b.sort)
    .map((qrcode) => ({
      id: qrcode.id,
      label: qrcode.label,
      kind: qrcode.kind,
      image: qrcode.image,
      tip: qrcode.tip,
      expiresAt: qrcode.expiresAt ? new Date(qrcode.expiresAt).toISOString() : null,
    }));

  // 三块都没有就别占地方（线上店没填地图搜索词时会走到这里）
  if (branches.length === 0 && activeQrcodes.length === 0 && !showMapSearch) return null;

  return (
    <div className="flex flex-col gap-4">
      {branches.length > 0 ? (
        <section className="surface p-5" aria-labelledby="branches-heading">
          <h2 id="branches-heading" className="text-sm font-medium">
            {branches.length > 1 ? `门店（${branches.length}）` : '地址'}
          </h2>

          <div className="mt-4">
            <BranchList brand={detail.name} branches={branches} cityLabel={primary?.city ?? ''} />
          </div>

          {primary ? (
            <>
              <div className="hairline mt-4" />
              <dl className="text-sm">
                {primary.hours ? (
                  <div className="flex items-center gap-2 border-b border-border py-2.5 last:border-b-0">
                    <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">营业时间</dt>
                    <dd>{primary.hours}</dd>
                  </div>
                ) : null}
                {primary.phone ? (
                  <div className="flex items-center gap-2 border-b border-border py-2.5 last:border-b-0">
                    <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">电话</dt>
                    <dd>
                      <a href={`tel:${primary.phone}`} className="num text-brand hover:underline">
                        {primary.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {primary.priceLevel ? (
                  <div className="flex items-center gap-2 border-b border-border py-2.5 last:border-b-0">
                    <dt className="text-muted-foreground">价位</dt>
                    <dd aria-label={`价位 ${primary.priceLevel} 档`}>{'¥'.repeat(primary.priceLevel)}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : null}
        </section>
      ) : null}

      {staticMap && primary && hasCoords(primary) ? (
        <section className="surface overflow-hidden" aria-label="位置示意图">
          <a
            href={`https://uri.amap.com/marker?position=${primary.lng},${primary.lat}&name=${encodeURIComponent(detail.name)}&src=shanhaiji`}
            target="_blank"
            rel="noopener"
            className="block"
          >
            {/* 高德静态地图：一张图片，不需要 JS SDK */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={staticMap} alt={`${detail.name} 的位置示意图`} className="h-[200px] w-full object-cover" />
          </a>
          <p className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
            <span>位置示意图，点击用高德打开</span>
            <ExternalLink className="size-3.5" aria-hidden />
          </p>
        </section>
      ) : null}

      {/* 连锁品牌不维护门店地址时，这里就是唯一的「怎么去」出口 */}
      {showMapSearch ? (
        <section className="surface p-5" aria-labelledby="nearest-heading">
          <h2 id="nearest-heading" className="text-sm font-medium">
            在地图上找最近的
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {branches.length > 0
              ? '门店较多时地图更准确：打开地图按距离查找最近门店。'
              : '该品牌门店较多，此处不逐条维护地址，请在地图中按位置查找最近门店。'}
          </p>
          <NearestShopLinks keyword={searchKeyword} city={primary?.city ?? null} className="mt-4" />
        </section>
      ) : null}

      <QrcodeCards items={activeQrcodes} />

      {branches.length > 1 ? (
        <Link href="/shops/map" className="text-xs text-brand hover:underline">
          在地图上看看其它店
        </Link>
      ) : null}
    </div>
  );
}
