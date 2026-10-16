'use client';

import { useState, useTransition } from 'react';
import { Loader2, LocateFixed, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { geocodeBranchAddress } from '@/actions/geocode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EMPTY_BRANCH } from '@/lib/entries';
import type { BranchInput } from '@/lib/validation';

export type BranchDraft = BranchInput;

export { EMPTY_BRANCH };

/**
 * 门店编辑器：管理 entry_branches（一个品牌一条 entry，多家门店多条 branch）。
 * 地理编码与地图纠正在 D6 接上，这里先把字段和增删做扎实。
 */
export default function BranchEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: BranchDraft[];
  onChange: (next: BranchDraft[]) => void;
  disabled?: boolean;
}) {
  const [mapUrls, setMapUrls] = useState<Record<number, string | null>>({});
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function update(index: number, patch: Partial<BranchDraft>) {
    onChange(value.map((branch, position) => (position === index ? { ...branch, ...patch } : branch)));
  }

  function locate(index: number) {
    const branch = value[index];
    if (!branch.address.trim()) {
      toast.error('先填地址再自动定位');
      return;
    }

    setBusyIndex(index);
    startTransition(async () => {
      const result = await geocodeBranchAddress(branch.address, branch.city ?? '');

      if (!result.ok) {
        toast.error(result.error);
        setBusyIndex(null);
        return;
      }

      if (!result.data) {
        toast.error('自动定位失败（可能是没配 AMAP_KEY），请手动填写经纬度');
        setBusyIndex(null);
        return;
      }

      update(index, {
        lat: result.data.lat,
        lng: result.data.lng,
        province: result.data.province ?? branch.province ?? '',
        city: result.data.city ?? branch.city,
        district: result.data.district ?? branch.district ?? '',
        poiId: result.data.poiId ?? '',
        poiSource: 'amap',
      });

      setMapUrls((prev) => ({ ...prev, [index]: result.data?.mapUrl ?? null }));
      setBusyIndex(null);
      toast.success('已定位，请在地图上确认位置对不对');
    });
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index));
  }

  function add() {
    onChange([...value, { ...EMPTY_BRANCH, isPrimary: value.length === 0, sort: value.length * 10 }]);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
          一条门店都不填也可以保存：详情页会给「在地图上找最近的」按钮组，搜索词用上面那个地图搜索词（留空则用条目名）。
          独门独店还是建议填地址，访客一眼就知道在哪。
        </p>
      ) : null}

      {value.map((branch, index) => (
        <div key={index} className="rounded-md border border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              <MapPin className="size-3.5" aria-hidden />
              门店 {index + 1}
              {branch.isPrimary ? <span className="text-primary">· 主门店</span> : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              disabled={disabled}
              onClick={() => remove(index)}
            >
              <Trash2 className="size-3.5" aria-hidden />
              删除
            </Button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-name-${index}`}>门店名（选填）</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-name-${index}`}
                value={branch.name ?? ''}
                disabled={disabled}
                placeholder="静安寺店"
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-city-${index}`}>城市（必填）</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-city-${index}`}
                value={branch.city}
                disabled={disabled}
                placeholder="上海"
                onChange={(event) => update(index, { city: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`branch-address-${index}`}>地址（必填）</Label>
              <div className="flex gap-2">
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  id={`branch-address-${index}`}
                  value={branch.address}
                  disabled={disabled}
                  placeholder="上海市静安区南京西路 1601 号"
                  onChange={(event) => update(index, { address: event.target.value })}
                />
                <Button type="button" variant="outline" onClick={() => locate(index)} disabled={disabled || busyIndex === index}>
                  {busyIndex === index ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <LocateFixed className="size-4" aria-hidden />
                  )}
                  自动定位
                </Button>
              </div>
              <p className="text-xs text-neutral-400">
                定位用的是高德地理编码，经常会定到马路对面，**一定要在地图上确认**；不对就手改下面的经纬度。
              </p>
            </div>

            {mapUrls[index] ? (
              <div className="sm:col-span-2">
                {/* 高德静态地图：服务端拼好的 URL，客户端不接触 AMAP_KEY */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapUrls[index] ?? ''}
                  alt="位置示意图"
                  className="h-[180px] w-full rounded-md border border-neutral-200 object-cover"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  标记 A 就是刚才定位到的点。位置不对？改下面两个数字，或者换个更精确的地址再定位一次。
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-district-${index}`}>区县</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-district-${index}`}
                value={branch.district ?? ''}
                disabled={disabled}
                placeholder="静安区"
                onChange={(event) => update(index, { district: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-phone-${index}`}>电话</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-phone-${index}`}
                value={branch.phone ?? ''}
                disabled={disabled}
                onChange={(event) => update(index, { phone: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-hours-${index}`}>营业时间</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-hours-${index}`}
                value={branch.hours ?? ''}
                disabled={disabled}
                placeholder="11:00-22:00，周一休"
                onChange={(event) => update(index, { hours: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-price-${index}`}>价位（1-3）</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-price-${index}`}
                type="number"
                min={1}
                max={3}
                value={branch.priceLevel ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { priceLevel: event.target.value === '' ? null : Number(event.target.value) })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-lat-${index}`}>纬度</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-lat-${index}`}
                inputMode="decimal"
                value={branch.lat ?? ''}
                disabled={disabled}
                onChange={(event) => update(index, { lat: event.target.value === '' ? null : Number(event.target.value) })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`branch-lng-${index}`}>经度</Label>
              <Input
                autoComplete="off"
                spellCheck={false}
                id={`branch-lng-${index}`}
                inputMode="decimal"
                value={branch.lng ?? ''}
                disabled={disabled}
                onChange={(event) => update(index, { lng: event.target.value === '' ? null : Number(event.target.value) })}
              />
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 accent-neutral-900"
                checked={branch.isPrimary ?? false}
                disabled={disabled}
                onChange={(event) => update(index, { isPrimary: event.target.checked })}
              />
              设为该品牌的主门店
            </label>
          </div>
        </div>
      ))}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="size-4" aria-hidden />
          添加门店
        </Button>
      </div>
    </div>
  );
}
