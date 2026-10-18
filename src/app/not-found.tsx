import Link from 'next/link';
import AtlasMark from '@/components/layout/AtlasMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * 根级 404：任何没匹配到路由的地址都会落到这里。
 *
 * 为什么根级和 (site) 各有一份：
 *   · (site)/not-found.tsx —— 页面内部调 notFound() 时用（比如标签不存在），带顶栏和页脚
 *   · 这一份 —— 地址压根没匹配上路由时用，此时还没进 (site) 布局，拿不到顶栏，
 *     所以做成居中的独立卡片；不查数据库，保证任何情况下都能渲染出来
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-20">
      <div className="w-full max-w-[520px]">
        <div className="surface p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            <AtlasMark />
            <span className="text-[15px] font-semibold tracking-tight">山海集 · Atlas</span>
          </div>

          <p className="num mt-6 text-4xl font-medium text-muted-foreground/40">404</p>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">没有找到这个页面</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            地址可能有误，或该页面已下线。可以换个关键词搜索。
          </p>

          <form autoComplete="off" spellCheck={false} action="/search" method="get" className="mt-6 flex gap-2">
            <label htmlFor="root-not-found-q" className="sr-only">
              搜索收录
            </label>
            <Input autoComplete="off" spellCheck={false} id="root-not-found-q" name="q" placeholder="搜索工具、站点、源码、好店" className="rounded-full" />
            <Button type="submit">搜索</Button>
          </form>

          <div className="hairline mt-6" />

          <div className="mt-5 flex gap-4 text-sm">
            <Link href="/" className="text-brand hover:underline">
              回首页
            </Link>
            <Link href="/tags" className="text-brand hover:underline">
              标签总览
            </Link>
            <Link href="/submit" className="text-brand hover:underline">
              推荐收录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
