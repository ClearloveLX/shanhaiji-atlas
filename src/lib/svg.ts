/**
 * SVG 图标的安全处理。
 *
 * 为什么单独有这么一个文件：SVG 是唯一「能被浏览器当文档打开、里面还能跑脚本」的图片格式。
 * 本项目只在 `<img>` 里用它（浏览器不执行 `<img>` 里的脚本），但文件本身是可以被直接访问的
 * （`/media/icons/x.svg`），所以上传时就得把「执行能力」洗掉。
 *
 * 三层防护，缺一不可（三层都在才算「防住了」）：
 *   ① 上传入口 `requireAdmin()` —— 只有站长能传；
 *   ② 本文件的 `sanitizeSvg()` —— 上传时洗掉执行能力和外链；
 *   ③ 响应头 `CSP: default-src 'none'; sandbox` —— 兜底，漏网的也执行不了。
 *
 * ⚠️ 第 ③ 层必须在**两个地方**都配：本地开发是 `src/app/media/[...path]/route.ts`，
 *    生产环境 `/media` 由 Caddy 直接读盘、那个路由根本不执行，所以要在
 *    `/etc/caddy/Caddyfile` 的 `handle /media/*` 里再写一遍同样的头。
 *    这里踩过一次坑：路由里写了 CSP 就以为有兜底，但生产走的是 Caddy，实际只剩两层。
 *
 * ⚠️ 本文件是基于正则的清洗，不是真正的 XML 解析器 —— 它只负责挡住已知的那几条路径。
 *    所以第 ③ 层不是「锦上添花」，是「正则一定会有洞」的前提下的必要兜底。
 */

export const SVG_MIME = 'image/svg+xml';

/** 连内容一起删掉的元素：脚本、能装 HTML 的容器、SMIL 动画（动画可以把属性改成 javascript:） */
const DANGEROUS_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'embed',
  'object',
  'handler',
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
];

/**
 * 看起来像不像 SVG：跳过 BOM / XML 声明 / 注释 / DOCTYPE 之后，第一个元素必须是 `<svg`。
 *
 * 为什么不能简单地在开头几百字符里搜 `<svg`：SPA 站点对任何路径都返回 200 + index.html，
 * 而首页里往往就内联着 `<svg>` 图标 —— 那样一张 HTML 会被当成 SVG 存成图标。
 */
export function looksLikeSvg(text: string): boolean {
  const stripped = text
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[\s\S]*?\?>/i, '')
    .replace(/^\s*<!--[\s\S]*?-->/g, '')
    .replace(/^\s*<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>/i, '')
    .replace(/^\s+/, '');

  return /^<svg[\s>]/i.test(stripped);
}

export type SanitizeSvgResult = {
  svg: string;
  /** 有没有真的洗掉东西（用来在 toast 里说清楚，而不是偷偷改用户文件） */
  cleaned: boolean;
};

/** `<style>` 里允许保留的 @ 规则：它们不引外链，删了会破坏正常图标 */
const SAFE_AT_RULES = /^(media|supports|keyframes|font-face|layer)$/i;

/**
 * 抹掉一段 CSS 文本里的全部外部引用。
 *
 * ⚠️ 为什么不能只写一条 `url(...)` 正则：CSS 引外链不止一种写法。
 *
 *   url(https://attacker/x.css)        ← 旧版正则能拦
 *   @import "https://attacker/x.css";  ← 不带 url()，旧版**一条都没拦到**
 *   background: image-set("https://…" 1x);  ← 也不带 url()，同样漏
 *
 * 后两种会让浏览器在渲染图标时去请求第三方，把访客的 IP / Referer / UA 送出去 ——
 * 正好是本文件第 5 条注释里说的「等于把访客的 IP 送给第三方」。
 * 图标的样式不需要引入任何外部资源，所以这里按「删注释 → 清 @ 规则 → 删 url() → 清裸字符串」
 * 四步走，把三类写法全盖住。
 *
 * 关于 CSS 转义：`@im\70 ort "…"` 也是合法 CSS（`\70` 就是字母 p），会被浏览器解析成 `@import`。
 * 所以先剥掉关键字里的反斜杠转义再比对白名单 —— 剥完不是白名单里的，一律删掉。
 */
function stripCssExternalRefs(css: string): string {
  return (
    css
      // 1. 注释里可以藏 @import，先删干净
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 2. @ 规则只留白名单，其余整条删掉（含 @import / @namespace / @charset）
      .replace(/@([a-zA-Z\\0-9-]+)/g, (match, raw: string) => {
        const name = raw.replace(/\\[0-9a-fA-F]{1,6}\s?/g, '').replace(/\\/g, '');
        return SAFE_AT_RULES.test(name) ? match : '';
      })
      // 3. url(...) 形式的外部引用
      .replace(/url\(\s*["']?\s*(?:https?:)?\/\/[^)]*\)/gi, 'none')
      // 4. 裸字符串形式（image-set 等），留下空字符串
      .replace(/(["'])\s*(?:https?:)?\/\/[^"'\s)]*\1/gi, '$1$1')
  );
}

export function sanitizeSvg(source: string): SanitizeSvgResult {
  const original = source;
  let svg = source.replace(/^\uFEFF/, '');

  // 1. DOCTYPE / ENTITY：实体展开是 XXE 和「十亿笑声」的来源，直接删
  svg = svg.replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>/gi, '');
  svg = svg.replace(/<!ENTITY[^>]*>/gi, '');

  // 2. 注释：注释里藏标签是绕过朴素正则的常见手法
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');

  // 3. 危险元素：成对的和自闭合的各删一次
  for (const tag of DANGEROUS_ELEMENTS) {
    svg = svg.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    svg = svg.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 4. 事件属性 on* 一律删掉（onload / onclick / onbegin …）
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 5. 引用类属性只留「本文档内部」（#id）和 data:image/；
  //    外链一律去掉 —— 图标不该带外链，那等于把访客的 IP 送给第三方
  svg = svg.replace(/\s(?:xlink:href|href|src|data)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, raw: string) => {
    const value = raw.replace(/^["']|["']$/g, '').trim();
    if (value.startsWith('#') || /^data:image\//i.test(value)) return match;
    return '';
  });

  // 6. 协议层面再抹一遍（属性写法的漏网之鱼）
  svg = svg.replace(/javascript:/gi, '').replace(/vbscript:/gi, '').replace(/expression\s*\(/gi, '(');

  // 7. 样式里的外部引用：@import "https://…" / image-set("https://…") / url(https://…)
  //    三种写法都要盖住，细节见 stripCssExternalRefs 的注释。
  //    覆盖两处载体：<style> 元素的内容，以及 style="..." 属性。
  svg = svg.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_match, open: string, css: string, close: string) => open + stripCssExternalRefs(css) + close,
  );
  svg = svg.replace(/(\sstyle\s*=\s*)("[^"]*"|'[^']*')/gi, (_match, lead: string, quoted: string) => {
    const quote = quoted[0];
    return lead + quote + stripCssExternalRefs(quoted.slice(1, -1)) + quote;
  });
  // 8. 剩下的裸 url(...)（既不在 <style> 里也不在 style 属性里，例如 <rect fill="url(https://…)"/>）
  svg = svg.replace(/url\(\s*["']?\s*(?:https?:)?\/\/[^)]*\)/gi, 'none');

  return { svg: svg.trim(), cleaned: svg.trim() !== original.trim() };
}
