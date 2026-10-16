'use client';

import { useEffect, useRef } from 'react';
import { incrementToolUsage } from '@/actions/tools';

/**
 * 进入工具运行页时打一次用量。
 * 放在客户端、不阻塞渲染，也不参与任何可见 UI。
 */
export default function UsagePing({ entryId }: { entryId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void incrementToolUsage(entryId).catch(() => {
      // 打点失败不打扰用户
    });
  }, [entryId]);

  return null;
}
