/**
 * 自研工具运行页专属布局：只有底色，没有全站导航、页脚、推荐位。
 * URL 还是 /tools/{slug}/app，但走的是和前台页面不同的布局树
 * （路由组 (tool)，和 (site) 不冲突：一个是 /tools/{slug}，一个是 /tools/{slug}/app）。
 */
export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
