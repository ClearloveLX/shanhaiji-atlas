/**
 * 站标：墨黑圆角块 + 山形等高线 + 一点电光蓝。
 * 纯 SVG，不用 emoji / 不引图片（离线、深浅色都跟着 currentColor 走）。
 */
export default function AtlasMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={
        className ??
        'flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground'
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 17.5c2.6-5.6 5-8.4 8.5-8.4s5.9 2.8 8.5 8.4" />
        <path d="M7.6 17.5c1.5-2.9 2.7-4.3 4.4-4.3s2.9 1.4 4.4 4.3" />
        <circle cx="12" cy="5.6" r="1.5" className="fill-brand text-brand" stroke="none" />
      </svg>
    </span>
  );
}
