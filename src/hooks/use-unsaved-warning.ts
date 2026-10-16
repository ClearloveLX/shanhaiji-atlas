'use client';

import { useEffect } from 'react';

/**
 * 未保存提醒：表单改动后关闭标签页 / 刷新时由浏览器弹确认。
 * 站内跳转的拦截交给页面上的「取消」按钮做二次确认，避免全局拦截把正常的链接也拦掉。
 */
export function useUnsavedWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}
