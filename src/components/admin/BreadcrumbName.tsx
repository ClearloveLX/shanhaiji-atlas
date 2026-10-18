'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type BreadcrumbContextValue = {
  label: string | null;
  setLabel: (value: string | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  label: null,
  setLabel: () => {},
});

/**
 * 顶栏面包屑在布局里、页面在它下面（中间隔着 children），props 传不上来，
 * 所以让页面把「我现在这条叫什么」写进 context，顶栏订阅它。
 */
export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/**
 * 页面里写一句 `<BreadcrumbName>{entry.name}</BreadcrumbName>`，
 * 顶栏里那段 GUID 就换成人看得懂的名字；页面切走时自动清掉。
 */
export function BreadcrumbName({ children }: { children: string }) {
  const { setLabel } = useContext(BreadcrumbContext);

  useEffect(() => {
    setLabel(children);
    return () => setLabel(null);
  }, [children, setLabel]);

  return null;
}

export function useBreadcrumbName(): string | null {
  return useContext(BreadcrumbContext).label;
}
