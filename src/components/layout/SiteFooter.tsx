import Link from 'next/link';
import AtlasMark from '@/components/layout/AtlasMark';
import { siteConfig } from '@/lib/site-config';

const COLUMNS = [
  {
    title: '浏览',
    links: siteConfig.nav.filter((item) => item.href !== '/'),
  },
  {
    title: '参与',
    links: [
      { title: '推荐收录', href: '/submit' },
      { title: '标签总览', href: '/tags' },
      { title: '好店地图', href: '/shops/map' },
      { title: '站长登录', href: '/login' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-border bg-background">
      <div aria-hidden className="gridlines gridlines-fade absolute inset-0" />

      <div className="shell relative py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <AtlasMark />
              <span className="text-[15px] font-semibold tracking-tight">{siteConfig.fullName}</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{siteConfig.slogan}</p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <span className="eyebrow">{column.title}</span>
              <ul className="flex flex-col gap-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>收录内容均为第三方服务，外链经站内跳转并记录点击。信息有误欢迎通过「推荐收录」反馈。</p>
          <div className="flex items-center gap-4">
            <Link href="/feed.xml" className="transition-colors duration-150 hover:text-foreground">
              RSS
            </Link>
            <span className="num uppercase tracking-[0.18em]">Atlas</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
