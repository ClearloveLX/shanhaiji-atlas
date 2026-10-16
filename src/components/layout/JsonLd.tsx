import type { JsonLdValue } from '@/lib/seo';

/**
 * 结构化数据注入。
 * ⚠️ 这是 AGENTS.md「禁止 dangerouslySetInnerHTML」的**唯一例外**：
 *    JSON-LD 必须是 <script> 的原始文本，React 没有别的写法。
 *    这里做了两件事保证安全：只注入自己 JSON.stringify 出来的数据 + 转义 `<` 防止提前闭合标签。
 */
export default function JsonLd({ data }: { data: JsonLdValue }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
