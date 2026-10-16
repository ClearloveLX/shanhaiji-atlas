import type { ComponentType } from 'react';

/**
 * 自研在线工具的**唯一注册处**。
 *
 * 约定（见 docs/DATA-MODEL.md 4.2）：
 * - 每个工具一个目录：index.tsx（默认导出组件，必须 'use client'）+ meta.ts
 * - 数据库里 entry_tools.component 必须能在下面找到，否则后台保存会被拒绝
 * - 必须是静态 import 路径，不能变量拼接，否则打包器会漏掉这些 chunk
 * - 加一个工具 = 建目录 + 这里加一行 + 后台建条目，**不改数据库、不写迁移、不动路由**
 */

export type ToolModule = {
  default: ComponentType;
};

export const TOOL_REGISTRY = {
  'qr-generator': {
    load: (): Promise<ToolModule> => import('./qr-generator'),
  },
  'text-diff': {
    load: (): Promise<ToolModule> => import('./text-diff'),
  },
  'eat-today': {
    load: (): Promise<ToolModule> => import('./eat-today'),
  },
  'farm-planner': {
    load: (): Promise<ToolModule> => import('./farm-planner'),
  },
} as const;

export type ToolSlug = keyof typeof TOOL_REGISTRY;

export const TOOL_SLUGS = Object.keys(TOOL_REGISTRY) as ToolSlug[];

export function isToolSlug(value: string): value is ToolSlug {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, value);
}

/** 后台下拉框用的选项列表（服务端读，客户端只拿结果） */
export function listToolComponents(): Array<{ value: string; label: string }> {
  return TOOL_SLUGS.map((slug) => ({ value: slug, label: slug }));
}
