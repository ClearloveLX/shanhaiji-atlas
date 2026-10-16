import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = {
  title: '这个链接还没被收录',
  robots: { index: false, follow: false },
};

/** 外链跳转的兜底页之一：slug 在库里找不到 */
export default async function GoNotFoundPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;

  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-[560px] self-center">
        <div className="surface p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <SearchX className="size-5" aria-hidden />
          </span>

          <h1 className="mt-5 text-xl font-semibold tracking-tight">这个跳转尚未收录</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {from ? (
              <>
                跳转编号 <code className="num rounded-md bg-muted px-1.5 py-0.5 text-xs">{from}</code>{' '}
                没有对应条目：可能已被移除，也可能链接抄错了一个字符。
              </>
            ) : (
              '该跳转编号没有对应条目。'
            )}
          </p>

          <form autoComplete="off" spellCheck={false} action="/search" method="get" className="mt-6 flex gap-2">
            <label htmlFor="go-not-found-q" className="sr-only">
              搜索收录
            </label>
            <Input autoComplete="off" spellCheck={false} id="go-not-found-q" name="q" placeholder="搜索其它关键词，如「图片压缩」" />
            <Button type="submit">搜索</Button>
          </form>

          <div className="hairline mt-6" />

          <div className="mt-5 flex gap-4 text-sm">
            <Link href="/" className="text-brand hover:underline">
              回首页
            </Link>
            <Link href="/submit" className="text-brand hover:underline">
              提交收录
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
