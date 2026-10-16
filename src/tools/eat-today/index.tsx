'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Shuffle, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createDefaultState,
  isDefaultList,
  makeId,
  MAX_NAME_LENGTH,
  normalizeName,
  pickCandidate,
  readState,
  validateName,
  writeState,
  type FoodItem,
} from './lib/foods';

/** 每次至少转这么多圈，保证「转」这件事看得出来 */
const SPIN_TURNS = 4;
const SPIN_MS = 1600;

/** 相邻扇形深浅交替，边界才看得出来 */
function sliceColor(index: number): string {
  return index % 2 === 0
    ? 'color-mix(in oklab, var(--brand) 55%, var(--card))'
    : 'color-mix(in oklab, var(--brand) 12%, var(--card))';
}

export default function EatTodayTool() {
  const [state, setState] = useState(createDefaultState);
  const [hydrated, setHydrated] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);

  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // 缓存只在挂载后读，服务端渲染时拿到的是默认清单，避免水合不一致
  useEffect(() => {
    setState(readState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeState(state);
  }, [state, hydrated]);

  useEffect(() => {
    return () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    };
  }, []);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const items = state.items;
  const step = items.length > 0 ? 360 / items.length : 360;
  const resultIndex = state.lastId ? items.findIndex((item) => item.id === state.lastId) : -1;
  const result = resultIndex >= 0 ? items[resultIndex] : null;
  const defaults = isDefaultList(items);

  /** 指针在正上方（0°），扇形 i 的中心要转到 0° 才叫「指中了」 */
  function angleFor(index: number, slice: number): number {
    return (360 - (index * slice + slice / 2)) % 360;
  }

  // 清单被增删之后扇形角度变了，把转盘悄悄对齐回当前结果，指针才不会指错
  useEffect(() => {
    if (spinning || resultIndex < 0 || items.length === 0) return;

    const slice = 360 / items.length;
    const target = angleFor(resultIndex, slice);

    setRotation((prev) => {
      const current = ((prev % 360) + 360) % 360;
      const delta = (target - current + 360) % 360;
      // 已经对齐（含浮点误差导致差一整圈的情况）就不动，免得白白跳一下
      return delta < 0.01 || delta > 359.99 ? prev : prev + delta;
    });
  }, [items.length, resultIndex, spinning]);

  function commit(next: FoodItem[], lastId: string | null) {
    setState({ items: next, lastId });
  }

  function spin() {
    if (items.length === 0 || spinning) return;

    const target = pickCandidate(items, state.lastId);
    if (!target) return;

    const index = items.findIndex((item) => item.id === target.id);
    if (index < 0) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const current = ((rotation % 360) + 360) % 360;
    const delta = (angleFor(index, step) - current + 360) % 360;
    const turns = reduceMotion ? 0 : SPIN_TURNS;

    setRotation(rotation + turns * 360 + delta);

    const settle = () => {
      setSpinning(false);
      setState((prev) => ({ items: prev.items, lastId: target.id }));
    };

    if (reduceMotion) {
      settle();
      return;
    }

    setSpinning(true);
    spinTimer.current = setTimeout(() => {
      spinTimer.current = null;
      settle();
    }, SPIN_MS);
  }

  function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const error = validateName(draft, items);
    if (error) {
      setAddError(error);
      return;
    }

    commit([...items, { id: makeId(), name: normalizeName(draft) }], state.lastId);
    setDraft('');
    setAddError(null);
  }

  function startEdit(item: FoodItem) {
    setEditingId(item.id);
    setEditDraft(item.name);
    setEditError(null);
  }

  function saveEdit() {
    if (!editingId) return;

    const error = validateName(editDraft, items, editingId);
    if (error) {
      setEditError(error);
      return;
    }

    const name = normalizeName(editDraft);
    commit(
      items.map((item) => (item.id === editingId ? { ...item, name } : item)),
      state.lastId,
    );
    setEditingId(null);
    setEditError(null);
  }

  function removeItem(id: string) {
    commit(
      items.filter((item) => item.id !== id),
      state.lastId === id ? null : state.lastId,
    );

    if (editingId === id) setEditingId(null);
  }

  function resetList() {
    setState(createDefaultState());
    setConfirmReset(false);
    setEditingId(null);
    setAddError(null);
  }

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted" />
        <span className="sr-only">正在读取本机的清单</span>
      </div>
    );
  }

  const wheelBackground =
    items.length === 0
      ? 'var(--secondary)'
      : items.length === 1
        ? sliceColor(0)
        : `conic-gradient(from 0deg, ${items
            .map((_, index) => {
              const from = index * step;
              const to = from + step;
              const color = index === resultIndex && !spinning ? 'var(--brand)' : sliceColor(index);
              return `${color} ${from}deg ${to}deg`;
            })
            .join(', ')})`;

  return (
    <div className="flex flex-col gap-5">
      {/* ── 转盘 ─────────────────────────────── */}
      <section className="surface topo relative overflow-hidden px-4 py-5 sm:px-7 sm:py-8">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-28 -left-20 size-72 rounded-full bg-brand/10 blur-3xl"
        />

        <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-9">
          <button
            type="button"
            onClick={spin}
            disabled={items.length === 0 || spinning}
            aria-label={
              items.length === 0
                ? '清单是空的，转盘用不了'
                : `转一个，从 ${items.length} 个选项里随机挑一个`
            }
            className="relative size-40 shrink-0 rounded-full outline-none transition-transform duration-150 hover:scale-[1.02] focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:hover:scale-100 sm:size-48"
          >
            <span
              aria-hidden
              className="absolute -inset-2 rounded-full ring-1 ring-brand/20"
            />

            <span
              aria-hidden
              className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--border)]"
              style={{
                background: wheelBackground,
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.9, 0.2, 1)` : 'none',
              }}
            />

            {/* 中心轴：不跟着转，所以它既是说明也是按钮标签 */}
            <span
              aria-hidden
              className="absolute inset-[26%] flex flex-col items-center justify-center gap-1 rounded-full bg-background shadow-[inset_0_1px_3px_rgb(0_0_0/0.08)]"
            >
              <Shuffle className={cn('size-5 text-brand', spinning && 'opacity-40')} />
              <span className="text-[11px] leading-none font-medium">
                {spinning ? '正在挑' : result ? '再转一次' : '转一个'}
              </span>
            </span>

            {/* 指针：压在圆环顶端，固定不动 */}
            <span
              aria-hidden
              className="absolute top-[-2px] left-1/2 size-0 -translate-x-1/2 border-x-[7px] border-t-[11px] border-x-transparent border-t-foreground drop-shadow-[0_1px_2px_rgb(0_0_0/0.3)]"
            />
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center text-center sm:items-start sm:text-left">
            <p className="eyebrow">今天的午饭</p>

            <p className="sr-only" aria-live="polite">
              {result ? `选中了 ${result.name}` : '还没有选'}
            </p>

            <p
              aria-hidden={spinning}
              className={cn(
                'mt-3 text-3xl leading-tight font-semibold tracking-tight break-all transition-[opacity,transform] duration-200 sm:text-4xl',
                spinning && 'scale-95 opacity-30',
                !result && !spinning && 'text-muted-foreground',
              )}
            >
              {spinning ? '正在挑…' : result ? result.name : items.length === 0 ? '清单是空的' : '还没决定'}
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              {items.length === 0
                ? '先加一个想吃的，或者恢复默认清单'
                : spinning
                  ? '转盘停下来就出结果'
                  : result
                    ? `从 ${items.length} 个选项里挑的，再转一次不会重复`
                    : `清单里有 ${items.length} 个选项，点转盘开始`}
            </p>

            {result && !spinning ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-4 h-11 sm:h-8"
                onClick={() => commit(items, null)}
              >
                <X className="size-4" aria-hidden />
                清掉这次结果
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 清单 ─────────────────────────────── */}
      <section className="surface flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UtensilsCrossed className="size-4 text-muted-foreground" aria-hidden />
            我的清单
            <span className="num text-xs font-normal text-muted-foreground">{items.length} 项</span>
          </h2>

          {defaults ? (
            <span className="text-xs text-muted-foreground">当前是默认清单</span>
          ) : confirmReset ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">会覆盖现在的清单</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-11 sm:h-8"
                onClick={resetList}
              >
                确认恢复
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 sm:h-8"
                onClick={() => setConfirmReset(false)}
              >
                取消
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 sm:h-8"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="size-4" aria-hidden />
              恢复默认清单
            </Button>
          )}
        </div>

        <form autoComplete="off" spellCheck={false} onSubmit={addItem} className="flex flex-col gap-2">
          <Label htmlFor="food-new" className="sr-only">
            新增一个选项
          </Label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              spellCheck={false}
              id="food-new"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (addError) setAddError(null);
              }}
              maxLength={MAX_NAME_LENGTH}
              placeholder="想吃什么，加进来"
              className="h-11 sm:h-9"
              aria-invalid={addError ? true : undefined}
              aria-describedby={addError ? 'food-new-error' : undefined}
            />
            <Button type="submit" variant="outline" className="h-11 shrink-0 sm:h-9">
              <Plus className="size-4" aria-hidden />
              添加
            </Button>
          </div>
          {addError ? (
            <p id="food-new-error" role="alert" className="text-xs text-destructive">
              {addError}
            </p>
          ) : null}
        </form>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            清单空了。加一个，或者点上面的「恢复默认清单」。
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {items.map((item) => {
              const editing = editingId === item.id;
              const isLast = state.lastId === item.id;

              return (
                <li
                  key={item.id}
                  className={cn(
                    editing ? 'col-span-2 lg:col-span-3' : '',
                    'flex min-h-12 items-center gap-1 rounded-lg border border-border px-2.5 py-1 sm:min-h-11',
                    isLast ? 'border-brand/40 bg-brand-soft/60' : 'bg-background',
                  )}
                >
                  {editing ? (
                    <>
                      <Label htmlFor={`food-edit-${item.id}`} className="sr-only">
                        修改名称
                      </Label>
                      <Input
                        autoComplete="off"
                        spellCheck={false}
                        id={`food-edit-${item.id}`}
                        ref={editInputRef}
                        value={editDraft}
                        onChange={(event) => {
                          setEditDraft(event.target.value);
                          if (editError) setEditError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveEdit();
                          }
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        maxLength={MAX_NAME_LENGTH}
                        aria-invalid={editError ? true : undefined}
                        aria-describedby={editError ? 'food-edit-error' : undefined}
                        className="h-10 flex-1 text-sm sm:h-8"
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-brand sm:size-7"
                        onClick={saveEdit}
                        aria-label={`保存 ${item.name} 的修改`}
                      >
                        <Check className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground sm:size-7"
                        onClick={() => setEditingId(null)}
                        aria-label="放弃修改"
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                      {/* 手机上删除收进编辑态：两颗图标挤在一格里，名字会被截成「黄焖鸡…」，
                          而且小屏幕上删除键和名字挨着，很容易点错 */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-destructive sm:hidden"
                        onClick={() => removeItem(item.id)}
                        aria-label={`删除 ${item.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* 整格就是「改名字」的按钮，名字才能占满整格不被截断（手机上一格只有 ~170px） */}
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35 active:opacity-60"
                        aria-label={`修改 ${item.name}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                        <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      </button>

                      {isLast ? (
                        <>
                          <span className="sr-only">上次选的</span>
                          <span className="hidden shrink-0 text-xs text-brand lg:inline">上次选的</span>
                        </>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="hidden size-7 shrink-0 text-muted-foreground hover:text-destructive sm:inline-flex"
                        onClick={() => removeItem(item.id)}
                        aria-label={`删除 ${item.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editError ? (
          <p id="food-edit-error" role="alert" className="text-xs text-destructive">
            {editError}
          </p>
        ) : null}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        清单存在这台设备的浏览器缓存里，换设备或清空浏览器数据会回到默认清单，也不会同步给别人。
      </p>
    </div>
  );
}
