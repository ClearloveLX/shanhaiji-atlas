import { diffLines } from 'diff';

/** 该工具专属的纯函数，放在 lib/ 下 */

export type DiffKind = 'added' | 'removed' | 'unchanged';

export type DiffRow = {
  kind: DiffKind;
  text: string;
  /** 左侧原文行号，新增行为 null */
  leftLine: number | null;
  /** 右侧新文行号，删除行为 null */
  rightLine: number | null;
};

export type DiffSummary = {
  added: number;
  removed: number;
  unchanged: number;
};

/** 把两段文本按行对比，展开成可直接渲染的行数组 */
export function buildDiffRows(left: string, right: string): DiffRow[] {
  if (!left && !right) return [];

  const parts = diffLines(left, right);
  const rows: DiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const part of parts) {
    // 末尾的换行会产生一个空字符串，渲染时不要多出一空行
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    for (const line of lines) {
      if (part.added) {
        rows.push({ kind: 'added', text: line, leftLine: null, rightLine: rightLine++ });
      } else if (part.removed) {
        rows.push({ kind: 'removed', text: line, leftLine: leftLine++, rightLine: null });
      } else {
        rows.push({ kind: 'unchanged', text: line, leftLine: leftLine++, rightLine: rightLine++ });
      }
    }
  }

  return rows;
}

export function summarize(rows: DiffRow[]): DiffSummary {
  return rows.reduce<DiffSummary>(
    (acc, row) => {
      if (row.kind === 'added') acc.added += 1;
      else if (row.kind === 'removed') acc.removed += 1;
      else acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}
