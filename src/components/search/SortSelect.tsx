'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { value: 'manual', label: '推荐顺序' },
  { value: 'newest', label: '最新收录' },
  { value: 'name', label: '按名称' },
  { value: 'featured', label: '精选优先' },
];

/** 排序下拉：写进 URL query，服务端按它查库 */
export default function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      排序
      <select
        value={value}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value === 'manual') params.delete('sort');
          else params.set('sort', event.target.value);
          params.delete('page');
          const query = params.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        className="h-8 rounded-full border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/25"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
