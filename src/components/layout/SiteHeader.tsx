import Link from 'next/link';
import AtlasMark from '@/components/layout/AtlasMark';
import NavLinks from '@/components/layout/NavLinks';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import CommandPalette, { type PaletteTag } from '@/components/search/CommandPalette';
import SearchBox from '@/components/search/SearchBox';
import SearchHotkey from '@/components/search/SearchHotkey';
import { siteConfig } from '@/lib/site-config';

/** 前台顶栏：站标 + 主导航 + 搜索入口（⌘K 命令面板也挂在这里） */
export default function SiteHeader({ tags }: { tags: PaletteTag[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="shell flex h-16 items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${siteConfig.fullName} 首页`}>
          <AtlasMark />
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight">{siteConfig.name}</span>
            <span className="num text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {siteConfig.nameEn}
            </span>
          </span>
        </Link>

        <NavLinks items={siteConfig.nav} />

        <div className="ml-auto flex items-center gap-2">
          <SearchBox id="site-search" className="hidden w-64 lg:block" showHotkeyHint />
          <SearchHotkey targetId="site-search" />
          <CommandPalette tags={tags} />
          <ThemeToggle />
          <Link
            href="/submit"
            className="hidden h-8 items-center rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/88 lg:inline-flex"
          >
            推荐收录
          </Link>
        </div>
      </div>
    </header>
  );
}
