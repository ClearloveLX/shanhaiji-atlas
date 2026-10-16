'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Hash, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { listSegment } from '@/lib/tags';

export type PaletteTag = { slug: string; name: string; dim: string };

type SearchItem = {
  id: string;
  name: string;
  type: string;
  slug: string;
  summary: string;
};

const PAGES = [
  { label: '首页', href: '/' },
  { label: '在线工具', href: '/tools' },
  { label: '常用站点', href: '/sites' },
  { label: '推荐店铺', href: '/shops' },
  { label: '标签总览', href: '/tags' },
  { label: '推荐收录', href: '/submit' },
];

const TYPE_LABELS: Record<string, string> = { tool: '工具', site: '站点', shop: '店铺' };

/**
 * ⌘K / Ctrl+K 命令面板：搜条目、跳标签、跳页面。
 * 数据走 /api/search（只返回 id/name/type/slug，限 20 条），本地不做全量过滤。
 */
export default function CommandPalette({ tags }: { tags: PaletteTag[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, 250);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  // cmdk 的 onSelect 只给 value，不给事件，所以自己记一下 ⌘/Ctrl 是否按着 —— 用来支持 ⌘+回车新标签页打开
  const modifierHeld = useRef(false);

  useEffect(() => {
    function trackDown(event: KeyboardEvent) {
      modifierHeld.current = event.metaKey || event.ctrlKey;
    }
    function trackUp() {
      modifierHeld.current = false;
    }

    window.addEventListener('keydown', trackDown);
    window.addEventListener('keyup', trackUp);
    return () => {
      window.removeEventListener('keydown', trackDown);
      window.removeEventListener('keyup', trackUp);
    };
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (!open) return;

    const query = debounced.trim();
    if (!query) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: SearchItem[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  function go(href: string, newTab = false) {
    setOpen(false);
    if (newTab) window.open(href, '_blank', 'noopener');
    else router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-foreground/20 hover:bg-accent md:flex"
        aria-label="打开命令面板"
      >
        <Search className="size-3.5 lg:hidden" aria-hidden />
        <span className="lg:hidden">搜索</span>
        <kbd className="num rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={keyword}
          onValueChange={setKeyword}
          placeholder="搜工具、站点、店铺，或者跳标签"
        />

        <CommandList>
          <CommandEmpty>{loading ? '搜索中…' : '没有匹配结果，请更换关键词'}</CommandEmpty>

          {items.length > 0 ? (
            <CommandGroup heading="收录">
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.slug}`}
                  onSelect={() => go(`/${listSegment(item.type)}/${item.slug}`)}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{item.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{TYPE_LABELS[item.type] ?? item.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {tags.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="标签">
                {tags.map((tag) => (
                  <CommandItem
                    key={`${tag.dim}/${tag.slug}`}
                    value={`${tag.name} ${tag.dim} ${tag.slug}`}
                    onSelect={() => go(`/tags/${tag.dim}/${tag.slug}`)}
                  >
                    <Hash className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {tag.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
          <CommandGroup heading="页面">
            {PAGES.map((page) => (
              <CommandItem key={page.href} value={page.label} onSelect={() => go(page.href, modifierHeld.current)}>
                {page.label}
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
