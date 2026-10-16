'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, LogIn } from 'lucide-react';
import { loginAction, type LoginState } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
      {pending ? '登录中…' : '登录'}
    </Button>
  );
}

export default function LoginForm({ from }: { from: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form autoComplete="off" spellCheck={false} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="from" value={from} />

      {state.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          required
          // ★ 别把真实管理员邮箱写在这里当示例：这个 placeholder 会随页面
          //   发给每一个匿名访客，等于在登录页挂了个「本后台管理员是谁」的招牌，
          //   顺便还把它提交进了公开仓库。用通用示例值。
          placeholder="admin@example.com"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
