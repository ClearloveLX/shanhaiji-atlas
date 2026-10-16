'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { revalidateSiteWide } from '@/lib/revalidate';
import { siteSettingsSchema } from '@/lib/validation';
import type { ActionResult } from '@/types';

/** 站点设置写入（settings 表按 key 存） */
export async function updateSiteSettings(input: unknown): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const parsed = siteSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '设置不合法' };
  }

  const entriesToWrite: Array<[string, boolean | string]> = [
    ['submissionsOpen', parsed.data.submissionsOpen],
    ['maintenanceMode', parsed.data.maintenanceMode],
    ['defaultVisibility', parsed.data.defaultVisibility],
  ];

  for (const [key, value] of entriesToWrite) {
    const existing = db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get();

    if (existing) {
      db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value }).run();
    }
  }

  revalidateSiteWide();
  return { ok: true, data: undefined };
}
