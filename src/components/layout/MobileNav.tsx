'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import SearchBox from '@/components/search/SearchBox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/site-config';

/**
 * 手机端菜单（md 以下才出现）。
 *
 * 顶栏上的主导航是 `hidden md:flex`、搜索框是 `hidden lg:block`、推荐收录是 `hidden lg:inline-flex`，
 * 所以在手机上顶栏原来只剩「站标 + 主题按钮」：/tools、/sites、/shops、/tags 一个都进不去，也搜不了。
 * 这个抽屉把那几件事补回来，顺带让自研工具运行页（那套布局故意没有全站导航）有个出口。
 */
export default function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="打开菜单"
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 md:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </DialogTrigger>

      {/* 贴右侧的抽屉：把 DialogContent 的居中/缩放盖掉，只留淡入 + 从右滑入 */}
      <DialogContent
        showCloseButton={false}
        className={cn(
          'left-auto right-0 top-0 flex h-dvh max-h-dvh w-[86vw] max-w-[340px] translate-x-0 translate-y-0 flex-col',
          'gap-0 rounded-none rounded-l-2xl border-y-0 border-r-0 p-0 sm:max-w-[340px]',
          'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-semibold">菜单</DialogTitle>
          <DialogClose
            aria-label="关闭菜单"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            <X className="size-4" aria-hidden />
          </DialogClose>
        </div>

        <nav className="flex shrink-0 flex-col gap-0.5 p-2">
          {items.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center rounded-lg px-3 text-[15px] outline-none transition-colors duration-150',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  active ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-accent',
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
          <SearchBox className="w-full" placeholder="搜工具、站点、店铺" />
          <Button asChild className="h-11 w-full">
            <Link href="/submit" onClick={() => setOpen(false)}>
              推荐收录
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
