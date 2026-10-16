import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { getPublicTagTree } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { TAG_DIMS, TAG_DIM_LABELS } from '@/lib/tags';

export const metadata: Metadata = {
  title: '标签总览',
  description: '按场景、属性、平台、价格、质量浏览全部收录。',
  alternates: { canonical: '/tags' },
};

export default async function TagsPage() {
  const tagTree = await getPublicTagTree();

  await trackPageView({ path: '/tags', kind: 'list' });

  return (
    <div className="shell py-14 sm:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">索引</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">标签总览</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          标签是收录的骨架：每条内容通常带 1-3 个场景标签与若干属性标签。计数为 0 的标签同样保留。
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-14">
        {TAG_DIMS.map((dim) => {
          const items = tagTree.filter((tag) => tag.dim === dim);
          if (items.length === 0) return null;

          return (
            <section key={dim} aria-labelledby={`tags-${dim}`}>
              <div className="flex items-baseline gap-3">
                <h2 id={`tags-${dim}`} className="text-lg font-semibold">
                  {TAG_DIM_LABELS[dim]}
                </h2>
                <span className="num text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="hairline mt-4" />

              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((tag) => (
                  <li key={tag.id}>
                    <Link href={`/tags/${tag.dim}/${tag.slug}`} className="surface surface-hover flex h-full flex-col gap-2 p-4">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="tag-dot size-2 rounded-full"
                          style={{ '--tint': tag.color } as CSSProperties}
                        />
                        <span className="text-sm font-medium">{tag.name}</span>
                        <span className="num ml-auto text-xs text-muted-foreground">{tag.count}</span>
                      </span>
                      {tag.desc ? (
                        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tag.desc}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
