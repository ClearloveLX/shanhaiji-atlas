'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ThemeMode = 'light' | 'dark' | 'system';

const OPTIONS: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', hint: '始终使用浅色', icon: Sun },
  { value: 'dark', label: '深色', hint: '始终使用深色', icon: Moon },
  { value: 'system', label: '跟随系统', hint: '随系统外观自动切换', icon: Monitor },
];

function toMode(theme: string | undefined): ThemeMode {
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

/**
 * 主题切换：三档显式选择，不做循环。
 * 循环时「跟随系统 → 浅色」在浅色系统下点完毫无变化，会被当成点击失效。
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 服务端渲染时不猜主题，避免 hydration 不一致
  if (!mounted) {
    return <span className="size-8 rounded-md border border-border" aria-hidden />;
  }

  const current = toMode(theme);
  const active = OPTIONS.find((option) => option.value === current) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`主题：${active.label}，点击选择`}
        title={`主题：${active.label}`}
        className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
      >
        <ActiveIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-40 rounded-xl p-1.5">
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => setTheme(value)}>
          {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="cursor-pointer gap-2.5 rounded-lg py-2 pl-8 pr-2.5 text-[13px]"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex flex-col leading-tight">
                <span>{label}</span>
                <span className="text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
