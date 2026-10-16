'use server';

import { requireAdmin } from '@/lib/auth';
import { geocodeAddress, hasAmapKey } from '@/lib/geocode';
import { amapStaticMapUrl } from '@/lib/map-links';
import type { ActionResult } from '@/types';

export type GeocodeBranchResult = {
  lng: number;
  lat: number;
  province: string | null;
  city: string | null;
  district: string | null;
  poiId: string | null;
  formattedAddress: string;
  /** 服务端拼好的高德静态图 URL（客户端不接触 AMAP_KEY） */
  mapUrl: string | null;
};

/**
 * 后台门店地址 → 经纬度。
 * 高德经常把地址定到马路对面或同名小区，所以界面上必须让人工在地图上确认后再保存（D6【2】）。
 */
export async function geocodeBranchAddress(address: string, city: string): Promise<ActionResult<GeocodeBranchResult | null>> {
  await requireAdmin();

  if (!hasAmapKey()) {
    return { ok: true, data: null };
  }

  const result = await geocodeAddress(address, city || undefined);
  if (!result) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      ...result,
      mapUrl: amapStaticMapUrl({
        name: result.formattedAddress || address,
        lng: result.lng,
        lat: result.lat,
        key: process.env.AMAP_KEY ?? '',
        zoom: 16,
        size: '600*300',
      }),
    },
  };
}

/** 把「位置不对，手动调整」后的坐标重新画一张静态图 */
export async function buildStaticMapUrl(name: string, lng: number, lat: number): Promise<ActionResult<{ mapUrl: string | null }>> {
  await requireAdmin();

  if (!hasAmapKey()) return { ok: true, data: { mapUrl: null } };

  return {
    ok: true,
    data: {
      mapUrl: amapStaticMapUrl({ name, lng, lat, key: process.env.AMAP_KEY ?? '', zoom: 16, size: '600*300' }),
    },
  };
}
