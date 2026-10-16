import { Fragment } from 'react';

/**
 * 服务端高亮：把命中的关键词包一层 <mark>。
 * 在前端用正则替换 HTML 是 XSS 的经典入口，这里直接产出 React 节点，不用 dangerouslySetInnerHTML。
 */
export default function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const needle = keyword.trim();
  if (!needle) return <>{text}</>;

  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();

  const parts: Array<{ value: string; hit: boolean }> = [];
  let cursor = 0;

  while (cursor <= text.length) {
    const index = haystack.indexOf(target, cursor);
    if (index === -1) {
      parts.push({ value: text.slice(cursor), hit: false });
      break;
    }
    if (index > cursor) parts.push({ value: text.slice(cursor, index), hit: false });
    parts.push({ value: text.slice(index, index + needle.length), hit: true });
    cursor = index + needle.length;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-[3px] bg-brand-soft px-0.5 font-medium text-brand">
            {part.value}
          </mark>
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        ),
      )}
    </>
  );
}
