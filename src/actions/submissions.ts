'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { entries, submissions } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { revalidateSiteWide } from '@/lib/revalidate';
import { rejectSubmissionInputSchema, submissionInputSchema } from '@/lib/validation';
import type { ActionResult } from '@/types';

/**
 * 投稿相关。
 * createSubmission 是公开写入口（访客提交），所以它**不能** requireAdmin —— 靠 IP 哈希限流 + 算术验证防刷。
 * 审核通过 / 拒绝走后台，第一行都是 requireAdmin()。
 */

const DAILY_LIMIT = 5;

function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? 'atlas-dev-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
  return hashIp(ip);
}

export async function createSubmission(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = submissionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '投稿内容不合法' };
  }

  const data = parsed.data;

  // 算术验证在服务端比对，前端那次只是即时反馈
  if (data.captchaA + data.captchaB !== data.captchaAnswer) {
    return { ok: false, error: '验证答案不对，再算一次' };
  }

  const ipHash = await clientIpHash();

  // 同一个 IP 哈希 24 小时内最多 5 条
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = db
    .select({ count: sql<number>`count(*)` })
    .from(submissions)
    .where(and(eq(submissions.ipHash, ipHash), gte(submissions.createdAt, since)))
    .get();

  if ((recent?.count ?? 0) >= DAILY_LIMIT) {
    return { ok: false, error: '今天提交得有点多了，明天再来吧' };
  }

  const inserted = db
    .insert(submissions)
    .values({
      kind: data.kind,
      name: data.name,
      url: data.url ?? null,
      // type 是「推荐人猜的类型」，只对推荐收录有意义
      type: data.kind === 'entry' ? (data.type ?? null) : null,
      reason: data.reason,
      contact: data.contact ?? null,
      status: 'pending',
      ipHash,
    })
    .returning({ id: submissions.id })
    .get();

  revalidateSiteWide();
  return { ok: true, data: { id: inserted.id } };
}

/**
 * 审核通过。
 * - 推荐收录：传 entryId，把投稿和它生成的条目关联起来
 * - 建议 / BUG：不传 entryId，这里只表示「已处理」
 */
export async function approveSubmission(id: string, entryId?: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const current = db.select().from(submissions).where(eq(submissions.id, id)).get();
  if (!current) return { ok: false, error: '投稿不存在' };

  if (entryId) {
    const entry = db.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId)).get();
    if (!entry) return { ok: false, error: '关联的条目不存在' };
  }

  db.update(submissions)
    .set({ status: 'approved', resultId: entryId ?? current.resultId, reviewedAt: new Date() })
    .where(eq(submissions.id, id))
    .run();

  revalidateSiteWide();
  return { ok: true, data: undefined };
}

export async function rejectSubmission(id: string, reason: string): Promise<ActionResult<undefined>> {
  await requireAdmin();

  const parsed = rejectSubmissionInputSchema.safeParse({ id, reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '请选择拒绝原因' };
  }

  const current = db.select().from(submissions).where(eq(submissions.id, id)).get();
  if (!current) return { ok: false, error: '投稿不存在' };

  db.update(submissions)
    .set({ status: 'rejected', reason: `${parsed.data.reason}${current.reason ? ` · 原推荐理由：${current.reason}` : ''}`, reviewedAt: new Date() })
    .where(eq(submissions.id, id))
    .run();

  revalidateSiteWide();
  return { ok: true, data: undefined };
}
