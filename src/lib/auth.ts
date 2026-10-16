import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { credentialsSchema } from '@/lib/validation';

/**
 * Auth.js v5 —— 单管理员 Credentials 登录，JWT session。
 * 管理员账号存在 settings 表的 'admin' 记录里：{ email, passwordHash }。
 * 没有注册入口、没有找回密码（忘了就改 .env.local 重跑 pnpm db:seed）。
 */

type AdminRecord = {
  email: string;
  passwordHash: string;
};

function isAdminRecord(value: unknown): value is AdminRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { email?: unknown; passwordHash?: unknown };
  return typeof candidate.email === 'string' && typeof candidate.passwordHash === 'string';
}

function readAdminRecord(): AdminRecord | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'admin')).get();
  if (!row) return null;
  return isAdminRecord(row.value) ? row.value : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },
  pages: {
    signIn: '/login',
  },
  trustHost: true,
  providers: [
    Credentials({
      name: '管理员登录',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const admin = readAdminRecord();
        if (!admin) return null;

        const emailMatches = parsed.data.email.toLowerCase() === admin.email.toLowerCase();
        const passwordMatches = bcrypt.compareSync(parsed.data.password, admin.passwordHash);

        if (!emailMatches || !passwordMatches) {
          // 失败统一处理，不区分是邮箱错还是密码错，并停一下防暴力破解
          await sleep(500);
          return null;
        }

        return { id: 'admin', email: admin.email, name: '站长' };
      },
    }),
  ],
  callbacks: {
    // 用 auth 作为 middleware 包装时才会走到这里；自写的 middleware 也在做同样的事
    authorized: ({ auth: session }) => Boolean(session),
  },
});

/** 所有写数据的 Server Action 第一行都要调它 */
export async function requireAdmin() {
  const session = await auth();
  if (!session) redirect('/login');
  return session;
}

/** 需要返回 401 而不是跳转的场景（比如 /api/file）用它 */
export async function getAdminSession() {
  return auth();
}
