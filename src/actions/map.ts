'use server';

import { findPublicNearbyBranches, getPublicPlaceBranches, type BranchBoardRow } from '@/db/queries';

/**
 * 「我在这附近」：浏览器拿到坐标后调这里排序（服务端做 bounding box 粗筛 + 哈弗辛精排）。
 * 用的是后台同一份门店数据读取函数，但**这里不需要 requireAdmin**：
 * 前台访客点「我在这附近」就会调它，返回的是公开的门店信息。
 * 所以只返回排序后的门店，不返回任何私密字段。
 */
export async function nearbyBranches(
  lat: number,
  lng: number,
): Promise<{ ok: true; items: Array<BranchBoardRow & { distanceKm: number }> } | { ok: false; error: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: '定位坐标不合法' };
  }

  const items = await findPublicNearbyBranches(lat, lng, 20);
  return { ok: true, items };
}

/** 地图页初始数据（服务端渲染用，公开信息） */
export async function allPlaceBranches(): Promise<BranchBoardRow[]> {
  return getPublicPlaceBranches();
}
