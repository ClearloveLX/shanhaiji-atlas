'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * 通用表格：列头点击排序、复选框多选（含全选）、底部区域（分页）插槽。
 * 用原生 <table> + Tailwind，不装表格库。
 * 因为要传 render 函数，这个组件只给客户端组件用（后台列表的 EntryTable 会包一层）。
 */

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T) => ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSortChange?: (key: string) => void;
  /** 传了它，正在排序的那一列表头会多一个「清除排序」的 × */
  onSortClear?: () => void;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  emptyMessage?: string;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** 追加到 <tr> 上的原生属性：手动排序视图用它挂拖拽事件 */
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>;
};

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  sort,
  onSortChange,
  onSortClear,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  emptyMessage = '没有数据',
  footer,
  rowClassName,
  rowProps,
}: DataTableProps<T>) {
  const allKeys = data.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selectedKeys.includes(key));

  function toggleAll() {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : allKeys);
  }

  function toggleOne(key: string) {
    if (!onSelectionChange) return;
    onSelectionChange(selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key]);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      {selectable && selectedKeys.length > 0 ? (
        <p className="border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">已选 {selectedKeys.length} 条</p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  className="size-4 accent-neutral-900"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="全选当前页"
                />
              </TableHead>
            ) : null}

            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              const alignClass =
                column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left';

              return (
                <TableHead key={column.key} className={cn(alignClass, column.className)}>
                  {column.sortable && onSortChange ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSortChange(column.key)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-neutral-900',
                          isSorted ? 'text-neutral-900' : 'text-neutral-500',
                        )}
                        aria-label={`按${typeof column.header === 'string' ? column.header : column.key}排序`}
                      >
                        {column.header}
                        {isSorted ? (
                          sort?.dir === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>

                      {isSorted && onSortClear ? (
                        <button
                          type="button"
                          onClick={onSortClear}
                          className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                          aria-label="清除排序"
                          title="清除排序，回到手动顺序"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="py-10 text-center text-sm text-neutral-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => {
              const key = rowKey(row);
              const selected = selectedKeys.includes(key);

              return (
                <TableRow
                  key={key}
                  data-state={selected ? 'selected' : undefined}
                  className={cn(rowClassName?.(row))}
                  {...rowProps?.(row)}
                >
                  {selectable ? (
                    <TableCell className="pl-4">
                      <input
                        type="checkbox"
                        className="size-4 accent-neutral-900"
                        checked={selected}
                        onChange={() => toggleOne(key)}
                        aria-label="选择这一行"
                      />
                    </TableCell>
                  ) : null}

                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left',
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {footer ? <div className="border-t border-neutral-200 px-4 py-3">{footer}</div> : null}
    </div>
  );
}
