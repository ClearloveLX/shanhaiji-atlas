import type { Metadata } from 'next';
import ShopMap, { type MapBranch } from '@/components/card/ShopMap';
import { getPublicEntries, getPublicPlaceBranches } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';

export const metadata: Metadata = {
  title: '好店地图',
  description: '一张图看全部线下好店，按城市、场景、价位筛，支持「我在这附近」。',
  alternates: { canonical: '/shops/map' },
};

/** 地图页必须由客户端渲染地图，但数据在服务端取好再传进去 */
export default async function ShopsMapPage() {
  await trackPageView({ path: '/shops/map', kind: 'list' });

  const [branches, shops] = await Promise.all([getPublicPlaceBranches(), getPublicEntries({ type: 'shop', pageSize: 500 })]);

  const sceneMap = new Map<string, string[]>();
  for (const shop of shops.items) {
    sceneMap.set(
      shop.id,
      shop.tags.filter((tag) => tag.dim === 'scene').map((tag) => tag.name),
    );
  }

  const items: MapBranch[] = branches
    .filter((branch) => branch.status === 'active')
    .map((branch) => ({
      id: branch.id,
      entryId: branch.entryId,
      entryName: branch.entryName,
      entrySlug: branch.entrySlug,
      name: branch.name,
      address: branch.address,
      city: branch.city,
      district: branch.district,
      lat: branch.lat,
      lng: branch.lng,
      priceLevel: branch.priceLevel,
      scenes: sceneMap.get(branch.entryId) ?? [],
    }));

  return <ShopMap branches={items} amapKey={process.env.NEXT_PUBLIC_AMAP_JS_KEY ?? ''} />;
}
