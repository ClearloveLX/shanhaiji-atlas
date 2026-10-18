'use client';

import { useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 搜索框：回车跳到 /search?q=
 * 不做即时联想（那是 CommandPalette 的活），这里只负责把词送到结果页。
 *
 * size='lg' 给首页 hero 用；顶栏用默认尺寸，并按 `/` 全局聚焦（见 SearchHotkey）。
 */
export default function SearchBox({
  className,
  placeholder = '搜工具、站点、源码、好店',
  size = 'sm',
  id,
  showHotkeyHint = false,
}: {
  className?: string;
  placeholder?: string;
  size?: 'sm' | 'lg';
  id?: string;
  showHotkeyHint?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  // 同一页可能出现两个搜索框（顶栏 + hero），id 必须唯一，否则 label 会指错
  const fallbackId = useId();
  const inputId = id ?? `site-search-${fallbackId}`;
  const large = size === 'lg';

  return (
    <form
      autoComplete="off"
      spellCheck={false}
      role="search"
      className={cn('relative', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const keyword = value.trim();
        router.push(keyword ? `/search?q=${encodeURIComponent(keyword)}` : '/search');
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        站内搜索
      </label>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          large ? 'left-4.5 size-5' : 'left-3 size-4',
        )}
        aria-hidden
      />
      <input
        autoComplete="off"
        spellCheck={false}
        id={inputId}
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-full border border-border bg-background outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground',
          'hover:border-foreground/20 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/25',
          large ? 'h-14 pl-12 pr-5 text-base shadow-xs' : 'h-9 pl-9 text-sm',
          !large && (showHotkeyHint ? 'pr-10' : 'pr-3'),
        )}
      />
      {showHotkeyHint ? (
        <kbd
          aria-hidden
          className="num pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block"
        >
          /
        </kbd>
      ) : null}
    </form>
  );
}
