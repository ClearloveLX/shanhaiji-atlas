import Link from 'next/link';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** 标签 chip：详情页里是链接，筛选栏里是按钮（由 FilterPanel 用按钮渲染） */
export default function TagChip({
  name,
  color,
  count,
  href,
  className,
}: {
  name: string;
  color: string;
  count?: number;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors duration-150 hover:border-foreground/20 hover:bg-accent',
        className,
      )}
    >
      <span aria-hidden className="tag-dot size-1.5 rounded-full" style={{ '--tint': color } as CSSProperties} />
      <span className="text-foreground">{name}</span>
      {typeof count === 'number' ? <span className="num text-muted-foreground">{count}</span> : null}
    </Link>
  );
}
