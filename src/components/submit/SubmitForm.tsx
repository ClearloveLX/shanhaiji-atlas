'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Bug, Lightbulb, Loader2, Send } from 'lucide-react';
import { createSubmission } from '@/actions/submissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type SubmitState = { ok?: boolean; error?: string };
type Kind = 'entry' | 'feedback';

const initialState: SubmitState = {};

const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors duration-150 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/25';

const KINDS: Array<{ value: Kind; label: string; icon: typeof Lightbulb }> = [
  { value: 'entry', label: '推荐一个收录', icon: Lightbulb },
  { value: 'feedback', label: '网站建议 · BUG', icon: Bug },
];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
      {pending ? '提交中…' : label}
    </Button>
  );
}

/**
 * 访客投稿表单，两种模式共用一套字段：
 * entry 推荐收录（会变成一条收录） / feedback 网站建议与 BUG（只进后台，不生成条目）。
 * 不用 JS 也能用：算术验证的两个数字放在隐藏字段里，答案由用户手填，服务端比对。
 */
export default function SubmitForm({ captcha }: { captcha: { a: number; b: number } }) {
  const [state, formAction] = useActionState(
    async (_prev: SubmitState, formData: FormData): Promise<SubmitState> => {
      const rawKind = String(formData.get('kind') ?? 'entry');
      const result = await createSubmission({
        kind: rawKind === 'feedback' ? 'feedback' : 'entry',
        name: String(formData.get('name') ?? ''),
        url: String(formData.get('url') ?? '') || undefined,
        type: formData.get('type') ? String(formData.get('type')) : undefined,
        reason: String(formData.get('reason') ?? ''),
        contact: String(formData.get('contact') ?? '') || undefined,
        captchaA: formData.get('captchaA'),
        captchaB: formData.get('captchaB'),
        captchaAnswer: formData.get('captchaAnswer'),
      });

      if (!result.ok) return { error: result.error };
      return { ok: true };
    },
    initialState,
  );

  const [kind, setKind] = useState<Kind>('entry');
  const [answer, setAnswer] = useState('');

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-600/20 bg-emerald-600/[0.07] p-5 dark:bg-emerald-400/10">
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          {kind === 'feedback'
            ? '已收到。处理完之前不用再提一次，需要回你的话会走联系方式。'
            : '已收到。审核通过后将出现在站内，无需重复提交。'}
        </p>
      </div>
    );
  }

  const isEntry = kind === 'entry';

  return (
    <form autoComplete="off" spellCheck={false} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />

      <div role="group" aria-label="投稿类型" className="flex flex-wrap gap-2">
        {KINDS.map((item) => {
          const Icon = item.icon;
          const active = kind === item.value;

          return (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              onClick={() => setKind(item.value)}
            >
              <Icon className="size-3.5" aria-hidden />
              {item.label}
            </Button>
          );
        })}
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {isEntry ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="submit-name">推荐名称</Label>
            <Input autoComplete="off" spellCheck={false} id="submit-name" name="name" required maxLength={60} placeholder="比如「某某图片压缩」" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="submit-url">链接</Label>
            <Input autoComplete="off" spellCheck={false} id="submit-url" name="url" type="url" required placeholder="https://example.com" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="submit-type">类型</Label>
            <select id="submit-type" name="type" className={SELECT_CLASS} defaultValue="">
              <option value="">不确定</option>
              <option value="tool">工具分享</option>
              <option value="site">站点分享</option>
              <option value="code">源码分享</option>
              <option value="shop">好店分享</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="submit-contact">联系方式（选填）</Label>
            <Input autoComplete="off" spellCheck={false} id="submit-contact" name="contact" maxLength={100} placeholder="邮箱或微信，只在需要回访时用" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="submit-name">一句话标题</Label>
            <Input
              autoComplete="off"
              spellCheck={false}
              id="submit-name"
              name="name"
              required
              maxLength={60}
              placeholder="比如「手机上护肝农场的时间轴溢出了」"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-url">出问题的页面（选填）</Label>
              <Input autoComplete="off" spellCheck={false} id="submit-url" name="url" type="url" placeholder="直接粘地址栏里的链接就行" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-contact">联系方式（选填）</Label>
              <Input autoComplete="off" spellCheck={false} id="submit-contact" name="contact" maxLength={100} placeholder="邮箱或微信，需要回你的时候用" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-reason">{isEntry ? '推荐理由（20-300 字）' : '具体描述（5-1000 字）'}</Label>
        <Textarea
          autoComplete="off"
          spellCheck={false}
          id="submit-reason"
          name="reason"
          rows={isEntry ? 4 : 6}
          required
          minLength={isEntry ? 20 : 5}
          maxLength={isEntry ? 300 : 1000}
          placeholder={
            isEntry
              ? '说明它解决了什么问题、你如何使用，比「很好用」这类评价更有参考价值'
              : '在哪一步出的问题、你期望看到什么、实际看到什么。有截图的话留个联系方式，我们回你'
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-captcha">
          验证：{captcha.a} + {captcha.b} = ?
        </Label>
        <input type="hidden" name="captchaA" value={captcha.a} />
        <input type="hidden" name="captchaB" value={captcha.b} />
        <Input
          autoComplete="off"
          spellCheck={false}
          id="submit-captcha"
          name="captchaAnswer"
          inputMode="numeric"
          required
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          className="w-32"
        />
      </div>

      <div>
        <SubmitButton label={isEntry ? '提交推荐' : '提交反馈'} />
      </div>
    </form>
  );
}
