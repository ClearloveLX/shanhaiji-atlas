import type { Metadata } from 'next';
import Link from 'next/link';
import LoginForm from '@/components/admin/LoginForm';
import AtlasMark from '@/components/layout/AtlasMark';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: '登录',
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const target = typeof from === 'string' && from.startsWith('/') ? from : '/admin';

  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-4 py-16">
      <div className="surface w-full max-w-sm self-center p-8">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label={`${siteConfig.fullName} 首页`}>
          <AtlasMark />
          <span className="text-[15px] font-semibold tracking-tight">{siteConfig.fullName}</span>
        </Link>

        <h1 className="mt-7 text-2xl font-semibold tracking-tight">站长登录</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">登录后可维护条目、标签与投稿。</p>

        <div className="hairline my-6" />

        <LoginForm from={target} />
      </div>
    </main>
  );
}
