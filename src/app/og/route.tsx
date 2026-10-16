import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { siteConfig } from '@/lib/site-config';

export const runtime = 'nodejs';

/**
 * 动态分享图（1200x630）。
 *
 * ⚠️ 中文字体的问题：satori 不会内置中文字形，不喂字体文件的话中文会渲染成空白。
 *    解决办法是把一份中文 TTF/OTF 放到 data/fonts/NotoSansSC-Regular.ttf
 *    （Google Fonts 搜 Noto Sans SC，下载 ttf 即可，越小越好）。
 *    没放也能跑：会退化成只渲染英文站名 + 主色带，不会 500。
 */
const FONT_CANDIDATES = [
  process.env.OG_FONT_PATH ?? '',
  './data/fonts/NotoSansSC-Regular.ttf',
  './public/fonts/NotoSansSC-Regular.ttf',
].filter(Boolean);

function loadFont(): ArrayBuffer | null {
  for (const candidate of FONT_CANDIDATES) {
    const filePath = path.resolve(process.cwd(), candidate);
    if (!existsSync(filePath)) continue;

    try {
      const buffer = readFileSync(filePath);
      // ArrayBuffer 视图交给 satori，注意要拷成独立的 ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    } catch {
      continue;
    }
  }
  return null;
}

function clampTitle(value: string): string {
  return value.length > 20 ? `${value.slice(0, 19)}…` : value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = clampTitle(searchParams.get('title') ?? siteConfig.fullName);
  const subtitle = (searchParams.get('subtitle') ?? siteConfig.slogan).slice(0, 60);
  const font = loadFont();

  const base = {
    width: 1200,
    height: 630,
  } as const;

  const content = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px',
        backgroundColor: '#0B0D12',
        color: '#FFFFFF',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, color: '#7C9BFF', letterSpacing: 2 }}>
        {font ? siteConfig.fullName : 'SHANHAIJI ATLAS'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', fontSize: font ? 76 : 64, fontWeight: 700, lineHeight: 1.2 }}>
          {font ? title : 'Shanhaiji Atlas'}
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#98A3B4', lineHeight: 1.4 }}>
          {font ? subtitle : siteConfig.slogan}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', width: 120, height: 8, backgroundColor: '#2B59FF', borderRadius: 4 }} />
        <div style={{ display: 'flex', fontSize: 24, color: '#98A3B4' }}>{new URL(siteConfig.url).host}</div>
      </div>
    </div>
  );

  return new ImageResponse(content, {
    ...base,
    ...(font
      ? {
          fonts: [
            {
              name: 'Noto Sans SC',
              data: font,
              style: 'normal' as const,
              weight: 400 as const,
            },
            {
              name: 'Noto Sans SC',
              data: font,
              style: 'normal' as const,
              weight: 700 as const,
            },
          ],
        }
      : {}),
  });
}
