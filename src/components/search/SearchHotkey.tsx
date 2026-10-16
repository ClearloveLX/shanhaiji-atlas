'use client';

import { useEffect } from 'react';

/**
 * 全局快捷键：按 `/` 聚焦顶栏搜索框。
 * 只挂在顶栏一处（全站唯一的监听），页面里其它搜索框不重复注册，避免互相抢焦点。
 */
export default function SearchHotkey({ targetId }: { targetId: string }) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement;
      const tagName = active?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || (active as HTMLElement | null)?.isContentEditable) return;

      const target = document.getElementById(targetId);
      if (target instanceof HTMLInputElement) {
        event.preventDefault();
        target.focus();
        target.select();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [targetId]);

  return null;
}
