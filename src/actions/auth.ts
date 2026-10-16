'use server';

import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { signIn, signOut } from '@/lib/auth';
import { credentialsSchema } from '@/lib/validation';

export type LoginState = {
  error?: string;
};

/** 登录：失败统一返回「邮箱或密码不正确」，成功后跳到 from 指定的路径 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: '请填写邮箱和密码' };
  }

  const from = formData.get('from');
  const redirectTo = typeof from === 'string' && from.startsWith('/') ? from : '/admin';

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: '邮箱或密码不正确' };
    }
    // NEXT_REDIRECT 不是错误，必须原样抛出去
    throw error;
  }

  return {};
}

/** 退出登录 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}

/** 退出登录（后台侧边栏用的表单版本，提交后回首页） */
export async function logoutFormAction(): Promise<void> {
  revalidatePath('/');
  await signOut({ redirectTo: '/' });
}
