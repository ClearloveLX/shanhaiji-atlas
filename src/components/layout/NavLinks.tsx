'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * 主导航（客户端叶子组件）：只为拿到 pathname 做当前项高亮。
 * 高亮条压在顶栏下边框上，和 header 等高，点击区域也更大。
 */
export default function NavLinks({ items }: { items: ReadonlyArray<{ title: string; href: string }> }) {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="hidden items-stretch gap-7 md:flex">
      {items
        .filter((item) => item.href !== '/')
        .map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center text-sm transition-colors duration-150',
                active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.title}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors duration-150',
                  active ? 'bg-brand' : 'bg-transparent',
                )}
              />
            </Link>
          );
        })}
    </nav>
  );
}
