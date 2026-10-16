import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAdmin } from '@/lib/auth';

/**
 * 后台占位页：路由骨架先立起来，功能按 docs/PROMPTS.md 的阶段逐步填。
 * D3 / D4 / D5 / D6 做到对应页面时，直接把 page.tsx 的内容换掉即可。
 */
export default async function PlaceholderPage({
  title,
  step,
  description,
}: {
  title: string;
  step: string;
  description: string;
}) {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">{title}</h1>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">这个页面还没实现</CardTitle>
          <CardDescription>计划在 {step} 完成：{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            现在数据库和后台框架已经可用，先把路由占住，避免点菜单掉进 404。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
