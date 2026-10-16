import { eq, or } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryQrcodes } from '@/db/schema';
import { deleteObject } from '@/lib/storage';

/**
 * 换图之后的垃圾回收：把被替换掉的旧文件删掉。
 *
 * 为什么需要它：`putObject` 会把内容指纹写进文件名（`{slug}-{hash8}.png`），
 * 换了图就一定是新文件名 —— 旧文件不删就会一直躺在 data/uploads 里变成孤儿。
 *
 * 删之前先确认没人在用：同一个文件可能被别的条目的图标 / 封面引用，也可能是某张二维码的图。
 * 只删本项目托管的 URL（`/media/*`、`/api/file/*`），别的地址 `deleteObject` 自己会忽略。
 */
export async function deleteIfUnused(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const usedByEntry = db
    .select({ id: entries.id })
    .from(entries)
    .where(or(eq(entries.icon, url), eq(entries.cover, url)))
    .get();
  if (usedByEntry) return;

  const usedByQrcode = db.select({ id: entryQrcodes.id }).from(entryQrcodes).where(eq(entryQrcodes.image, url)).get();
  if (usedByQrcode) return;

  await deleteObject(url);
}
