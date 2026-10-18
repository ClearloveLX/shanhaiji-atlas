import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SiteNotFound() {
  return (
    <div className="shell flex max-w-[560px] flex-col items-center py-28 text-center">
      <span className="num text-5xl font-medium text-muted-foreground/40">404</span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">没有找到这个页面</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        链接可能已变更，或这条收录已被移除。可以试着搜索一下。
      </p>

      <form autoComplete="off" spellCheck={false} action="/search" method="get" className="mt-8 flex w-full gap-2">
        <label htmlFor="not-found-q" className="sr-only">
          搜索收录
        </label>
        <Input autoComplete="off" spellCheck={false} id="not-found-q" name="q" placeholder="搜工具、站点、源码、好店" className="rounded-full" />
        <Button type="submit">搜索</Button>
      </form>

      <Button asChild variant="outline" className="mt-4">
        <Link href="/">回首页</Link>
      </Button>
    </div>
  );
}
