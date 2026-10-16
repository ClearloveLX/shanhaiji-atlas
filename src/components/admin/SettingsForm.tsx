'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateSiteSettings } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SiteSettings } from '@/db/queries';

/** 站点设置表单：投稿开关 / 维护模式 / 新建条目的默认可见性 */
export default function SettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(settings);

  function save() {
    startTransition(async () => {
      const result = await updateSiteSettings(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('设置已保存');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">投稿</CardTitle>
          <CardDescription className="text-xs">关掉之后 /submit 会显示「暂停收稿」，已提交的投稿不受影响。</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-neutral-900"
              checked={values.submissionsOpen}
              onChange={(event) => setValues((prev) => ({ ...prev, submissionsOpen: event.target.checked }))}
            />
            接收访客投稿
          </label>
        </CardContent>
      </Card>

      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">维护模式</CardTitle>
          <CardDescription className="text-xs">
            打开后前台显示公告，站长登录后仍能看到完整内容（方便边改边看）。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-neutral-900"
              checked={values.maintenanceMode}
              onChange={(event) => setValues((prev) => ({ ...prev, maintenanceMode: event.target.checked }))}
            />
            开启维护模式
          </label>
        </CardContent>
      </Card>

      <Card className="rounded-lg py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">新建条目的默认可见性</CardTitle>
          <CardDescription className="text-xs">
            三档：公开 / 不列出（知道链接能访问，不进任何列表）/ 私密（只有站长可见，前台直接 404）。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <select
            value={values.defaultVisibility}
            onChange={(event) => setValues((prev) => ({ ...prev, defaultVisibility: event.target.value }))}
            className="h-9 rounded-md border border-input px-2 text-sm outline-none focus-visible:border-ring"
            aria-label="默认可见性"
          >
            <option value="public">公开</option>
            <option value="unlisted">不列出</option>
            <option value="private">私密</option>
          </select>
        </CardContent>
      </Card>

      <div>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          保存设置
        </Button>
      </div>
    </div>
  );
}
