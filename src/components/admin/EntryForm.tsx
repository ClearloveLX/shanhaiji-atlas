'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { Loader2, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { createEntry, updateEntry } from '@/actions/entries';
import { approveSubmission } from '@/actions/submissions';
import BranchEditor, { type BranchDraft } from '@/components/admin/BranchEditor';
import IconUploader from '@/components/admin/IconUploader';
import QrcodeManager, { type QrcodeDraft } from '@/components/admin/QrcodeManager';
import TagPicker, { EMPTY_TAG_SELECTION, type TagOption, type TagSelectionValue } from '@/components/admin/TagPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning';
import { LINK_MODE_LABELS } from '@/lib/tags';
import { cn, suggestSlug } from '@/lib/utils';
import { entryInputSchema } from '@/lib/validation';

type FormInput = z.input<typeof entryInputSchema>;
type FormOutput = z.output<typeof entryInputSchema>;

const LINK_MODE_CARDS = [
  {
    value: 'external' as const,
    title: '外部链接',
    description: '推荐一个别人做的东西：网站、在线工具、软件官网、网店',
  },
  {
    value: 'internal' as const,
    title: '基本自研',
    description: '自己写的工具，跑在站内 /tools/{slug}/app（框架和库是别人的，代码基本上是自己的）',
  },
  {
    value: 'place' as const,
    title: '线下好店',
    description: '有实体地址的店，详情页会给导航按钮',
  },
];

export type EntryFormProps = {
  mode: 'create' | 'edit';
  entryId?: string;
  tags: TagOption[];
  components: Array<{ value: string; label: string }>;
  defaultValues: FormInput;
  /** 编辑页顶部显示「最后更新于 X」 */
  updatedLabel?: string;
  previewHref?: string;
  /** 从投稿审核「通过」跳过来时带上投稿 id，保存成功后把投稿标记为已通过 */
  submissionId?: string;
};

export default function EntryForm({
  mode,
  entryId,
  tags,
  components,
  defaultValues,
  updatedLabel,
  previewHref,
  submissionId,
}: EntryFormProps) {
  const router = useRouter();
  const [linkMode, setLinkMode] = useState<FormInput['linkMode']>(defaultValues.linkMode ?? 'external');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(entryInputSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const { isDirty } = form.formState;
  useUnsavedWarning(isDirty);

  const summary = form.watch('summary') ?? '';
  const summaryLength = summary.trim().length;
  const selectedTags = (form.watch('tags') ?? EMPTY_TAG_SELECTION) as TagSelectionValue;
  const branches = (form.watch('branches') ?? []) as BranchDraft[];
  const qrcodes = (form.watch('qrcodes') ?? []) as QrcodeDraft[];
  const currentType = form.watch('type');
  const currentUrl = form.watch('url') ?? '';
  const currentSlug = form.watch('slug') ?? '';

  const typeOptions = useMemo(
    () => [
      { value: 'tool' as const, label: '工具分享' },
      { value: 'site' as const, label: '站点分享' },
      { value: 'code' as const, label: '源码分享' },
      { value: 'shop' as const, label: '好店分享' },
    ],
    [],
  );

  function chooseLinkMode(next: 'external' | 'internal' | 'place') {
    setLinkMode(next);
    form.setValue('linkMode', next, { shouldDirty: true });

    if (next === 'internal') {
      form.setValue('type', 'tool', { shouldDirty: true });
      form.setValue('url', '', { shouldDirty: true });
      if (!form.getValues('tool.component') && components.length > 0) {
        form.setValue('tool.component', components[0].value, { shouldDirty: true });
      }
    }

    if (next === 'place') {
      form.setValue('type', 'shop', { shouldDirty: true });
      // 不预填门店：连锁品牌一条地址都不用维护，直接留空走「地图搜索」
    }
  }

  const onSubmit: SubmitHandler<FormOutput> = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        url: values.linkMode === 'external' ? values.url : undefined,
      };

      const result = mode === 'create' ? await createEntry(payload) : await updateEntry(entryId ?? '', payload);

      if (!result.ok) {
        const [maybeField] = result.error.split('：');
        const knownFields = ['name', 'slug', 'summary', 'url', 'type', 'tags', 'branches', 'tool', 'mapQuery'];
        if (knownFields.includes(maybeField)) {
          form.setError(maybeField as keyof FormInput & string, { message: result.error });
        }
        toast.error(result.error);
        return;
      }

      toast.success('已保存');
      form.reset(values);

      if (mode === 'create') {
        if (submissionId) {
          const approved = await approveSubmission(submissionId, result.data.id);
          if (approved.ok) toast.success('投稿已标记为「已通过」');
          else toast.error(`条目建好了，但投稿状态没更新：${approved.error}`);
        }
        router.replace(`/admin/entries/${result.data.id}/edit`);
      } else {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form autoComplete="off" spellCheck={false} onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{mode === 'create' ? '新建条目' : '编辑条目'}</h1>
            {mode === 'edit' ? (
              <span className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                {LINK_MODE_LABELS[linkMode] ?? linkMode}（形态不可改）
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-500">
            {updatedLabel ? <span>最后更新于 {updatedLabel}</span> : null}
            {previewHref ? (
              <Link href={previewHref} target="_blank" rel="noopener" className="text-primary hover:underline">
                查看前台
              </Link>
            ) : null}
          </div>
        </div>

        {/* 第一步：只有新建时才问「这是什么」 */}
        {mode === 'create' ? (
          <Card className="rounded-lg py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-sm">这是什么？选完只显示该形态需要的字段</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-5 sm:grid-cols-3">
              {LINK_MODE_CARDS.map((card) => (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => chooseLinkMode(card.value)}
                  aria-pressed={linkMode === card.value}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    linkMode === card.value ? 'border-primary bg-accent' : 'border-neutral-200 hover:bg-neutral-50',
                  )}
                >
                  <span className="block text-sm font-medium">{card.title}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{card.description}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* 基本信息 */}
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
            {linkMode === 'external' ? (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>类型</FormLabel>
                    <div className="flex gap-2">
                      {typeOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={field.value === option.value ? 'default' : 'outline'}
                          onClick={() => field.onChange(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <FormDescription>类型决定进哪个列表（工具 / 站点 / 源码 / 好店），和形态是两件事。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="sm:col-span-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                {linkMode === 'internal'
                  ? '自研工具的 type 固定为「工具分享」，详情页主按钮走站内 /tools/{slug}/app。'
                  : '线下好店的 type 固定为「好店分享」，详情页主按钮是地图导航。'}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>中文名</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} placeholder="Figma" maxLength={60} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>英文名（选填）</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} placeholder="Figma" maxLength={80} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>slug（URL 里用的短名）</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} placeholder="figma" {...field} />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const next = suggestSlug(form.getValues('name') ?? '', form.getValues('nameEn'));
                        field.onChange(next);
                      }}
                    >
                      <Wand2 className="size-4" aria-hidden />
                      根据名字生成
                    </Button>
                  </div>
                  {mode === 'edit' && currentSlug ? (
                    <FormDescription>改 slug = 旧链接失效（/tools/{currentSlug} 会 404），确认后再改。</FormDescription>
                  ) : (
                    <FormDescription>只允许小写字母、数字和连字符，发布后就是对外链接。</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>一句话简介</FormLabel>
                  <FormControl>
                    <Textarea
                      autoComplete="off"
                      spellCheck={false}
                      rows={3}
                      placeholder="说清「是什么 + 适合谁」，20-60 字最好"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className={cn(summaryLength > 60 && 'text-amber-600')}>
                    已写 {summaryLength} 字（要求 20-200 字，建议 20-60 字）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {linkMode === 'external' ? (
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>链接 URL</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} placeholder="https://example.com" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>前台不会直接输出这个地址，所有外链都走 /go/{`{slug}`} 计数后再跳。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>图标</FormLabel>
                  <IconUploader
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    slug={currentSlug}
                    sourceUrl={currentUrl}
                    disabled={submitting}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cover"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>封面图</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} placeholder="/media/covers/figma.webp" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>编辑手记（选填）</FormLabel>
                  <FormControl>
                    <Textarea autoComplete="off" spellCheck={false} rows={3} placeholder="我为什么收录它、用的时候注意什么" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 自研工具专属 */}
        {linkMode === 'internal' ? (
          <Card className="rounded-lg py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-sm">工具信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tool.component"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>组件名</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? ''}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="">请选择已注册的组件</option>
                        {components.map((component) => (
                          <option key={component.value} value={component.value}>
                            {component.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      {components.some((component) => component.value === field.value)
                        ? '该组件已注册 ✓ 保存后 /tools/{slug}/app 立刻可用'
                        : '未注册 ✗ 组件必须先在 src/tools/registry.ts 里注册'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool.runtime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>运行时</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? 'client'}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="client">client（纯浏览器，默认）</option>
                        <option value="server">server（需要服务端计算）</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool.version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>版本号</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} placeholder="1.0.0" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool.requiresLogin"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-neutral-900"
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event.target.checked)}
                      />
                      需要登录才能使用
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* 在哪找得到：type=shop 就有（线上店也能有实体店），门店列表只有 place 才有 */}
        {currentType === 'shop' ? (
          <Card className="rounded-lg py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-sm">在哪找得到</CardTitle>
              <CardDescription>
                连锁品牌不用一条条维护门店地址：填一个地图搜索词，详情页就会给「在地图上找最近的」按钮组。
                只有几家店（或者就一家）时，建议直接填门店地址。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 px-5">
              <FormField
                control={form.control}
                name="mapQuery"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>地图搜索词（选填）</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} placeholder="星巴克" maxLength={60} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>
                      地图 App 里能搜到的名字。条目名带英文时（「小佩 PETKIT」）这里填「小佩」；留空用条目名。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {linkMode === 'place' ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-neutral-700">门店列表（选填）</p>
                  <BranchEditor value={branches} onChange={(next) => form.setValue('branches', next, { shouldDirty: true })} />
                  {form.formState.errors.branches ? (
                    <p className="mt-2 text-xs text-destructive">{form.formState.errors.branches.message}</p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-neutral-300 px-3 py-2.5 text-xs text-neutral-500">
                  这条是「线上店」形态：详情页主按钮指向官网。填了地图搜索词后，侧栏会多出一组「在地图上找最近的」。
                  想改成逐个门店维护地址，新建一条 link_mode=place 的条目（形态保存后不可改）。
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* 二维码：线下店和外部链接都能挂 */}
        {linkMode === 'external' || linkMode === 'place' ? (
          <Card className="rounded-lg py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-sm">二维码（选填）</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <QrcodeManager
                value={qrcodes}
                slug={currentSlug}
                onChange={(next) => form.setValue('qrcodes', next, { shouldDirty: true })}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* 可见性 */}
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">可见性</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-5">
            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { value: 'public', label: '公开', hint: '进列表、搜索、标签页、sitemap' },
                        { value: 'unlisted', label: '不列出', hint: '知道链接能访问，但不进任何列表' },
                        { value: 'private', label: '私密', hint: '只有站长可见，前台直接 404' },
                      ] as const
                    ).map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={field.value === option.value ? 'default' : 'outline'}
                        title={option.hint}
                        onClick={() => field.onChange(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <FormDescription>
                    {field.value === 'private'
                      ? '私密条目在前台一律 404（不是 403，403 等于告诉对方「它存在」），要看去 /me。'
                      : field.value === 'unlisted'
                        ? '不列出的条目不进列表 / 搜索 / sitemap，但直接访问 URL 能打开。'
                        : '公开条目会进列表、搜索、标签页和 sitemap。'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 私密信息：任何可见性都能填，只有站长看得到 */}
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">私密信息（只有站长看得到）</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="privateProfile.rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>我的评分</FormLabel>
                  <FormControl>
                    <select
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                    >
                      <option value="">未评分</option>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <option key={score} value={score}>
                          {'★'.repeat(score)}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateProfile.status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>我的状态</FormLabel>
                  <FormControl>
                    <select
                      value={field.value ?? ''}
                      onChange={(event) => {
                        const option = (
                          [
                            { value: 'todo', label: '想去' },
                            { value: 'visited', label: '去过' },
                            { value: 'verified', label: '已验证' },
                            { value: 'avoid', label: '踩雷' },
                          ] as const
                        ).find((item) => item.value === event.target.value);
                        field.onChange(option ? option.value : null);
                      }}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                    >
                      <option value="">未标记</option>
                      <option value="todo">想去</option>
                      <option value="visited">去过</option>
                      <option value="verified">已验证</option>
                      <option value="avoid">踩雷</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateProfile.contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>不公开的联系方式</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} placeholder="老板微信 / 电话" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateProfile.paid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实际花费</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} placeholder="人均 80" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateProfile.visitedOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>到访日期</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateProfile.note"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>私人备注</FormLabel>
                  <FormControl>
                    <Textarea
                      autoComplete="off"
                      spellCheck={false}
                      rows={3}
                      placeholder="别周末去 / 老板微信 xxx / 实际人均 80 不是 50"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>这一段永远不出现在公开页面，只有 /me 和后台能看到。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 标签与状态 */}
        <Card className="rounded-lg py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">标签与状态</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 px-5">
            <TagPicker
              tags={tags}
              value={selectedTags}
              onChange={(next) => form.setValue('tags', next, { shouldDirty: true, shouldValidate: true })}
            />
            {form.formState.errors.tags ? (
              <p className="text-xs text-destructive">{form.formState.errors.tags.message ?? '标签不合法'}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="featured"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-neutral-900"
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event.target.checked)}
                      />
                      设为精选
                    </label>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? 'active'}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="active">正常</option>
                        <option value="stale">疑似失效</option>
                        <option value="dead">已失效</option>
                      </select>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortWeight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>排序权重</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        spellCheck={false}
                        type="number"
                        value={field.value ?? 0}
                        onChange={(event) => field.onChange(Number(event.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>越大越靠前（全站一条顺序，不分类型）；新建时留 0 会排到最前</FormDescription>
                  </FormItem>
                )}
              />
            </div>

            {linkMode === 'external' && currentUrl ? (
              <p className="text-xs text-neutral-400">外链会走 /go/{currentSlug || '（先填 slug）'}，页面上不出现原始地址。</p>
            ) : null}
          </CardContent>
        </Card>

        {/* 底部固定操作条 */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:pl-[236px]">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
            <span className="text-xs text-neutral-500">
              {isDirty ? '有未保存的改动' : '没有未保存的改动'}
              {currentType === 'shop' && linkMode === 'place'
                ? branches.length > 0
                  ? ` · ${branches.length} 条门店`
                  : ' · 不填门店，走地图搜索'
                : ''}
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isDirty && !window.confirm('有未保存的改动，确定离开吗？')) return;
                  router.push('/admin/entries');
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                {submitting ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
