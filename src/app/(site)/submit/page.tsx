import type { Metadata } from 'next';
import SubmitForm from '@/components/submit/SubmitForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSiteSettings } from '@/db/queries';
import { trackPageView } from '@/lib/analytics';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: '推荐收录 / 建议反馈',
  description: `把你觉得好用的工具、站点、源码或好店推荐给 ${siteConfig.fullName}，也可以提站点本身的建议和 BUG。`,
  alternates: { canonical: '/submit' },
};

const CRITERIA = [
  '真实可访问、核心功能可用，而非「即将上线」的落地页',
  '无强制弹窗、诱导下载或来源不明的客户端',
  '长期维护优先：近两年内仍在更新',
  '不收录强制安装客户端、频繁更换域名或纯导流的站点',
];

/** 访客投稿入口 */
export default async function SubmitPage() {
  const settings = await getSiteSettings();

  await trackPageView({ path: '/submit', kind: 'other' });

  // 算术验证：服务端生成两个数，跟着表单一起提交，服务端再比对一次
  const captcha = {
    a: 3 + Math.floor(Math.random() * 7),
    b: 2 + Math.floor(Math.random() * 8),
  };

  if (!settings.submissionsOpen) {
    return (
      <div className="shell max-w-[720px] py-20">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">暂停接收投稿</CardTitle>
            <CardDescription>投稿通道暂时关闭，整理完当前批次后重新开放。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="shell max-w-[720px] py-14 sm:py-16">
      <header>
        <p className="eyebrow">投稿</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">推荐收录 / 建议反馈</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          推荐你实际在用的工具、站点、源码或好店，不必写成广告语；站点本身哪里别扭、哪里出错了，也在同一个表单里提。
          两种都会人工看，通过后收录或修掉。
        </p>
      </header>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="text-base">投稿内容</CardTitle>
          <CardDescription>
            上面切换「推荐一个收录」或「网站建议 · BUG」；带 * 的是必填项，同一 IP 每天最多提交 5 条。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmitForm captcha={captcha} />
        </CardContent>
      </Card>

      <section className="mt-14" aria-labelledby="criteria-heading">
        <h2 id="criteria-heading" className="text-lg font-semibold">
          收录标准
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">这一节只针对「推荐一个收录」，建议和 BUG 不受它限制。</p>
        <div className="hairline mt-4" />
        <ul className="mt-2 flex flex-col">
          {CRITERIA.map((item, index) => (
            <li key={item} className="flex items-baseline gap-4 border-b border-border py-3.5">
              <span className="index-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
