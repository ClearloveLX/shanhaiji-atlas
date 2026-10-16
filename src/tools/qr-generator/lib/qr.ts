import QRCode from 'qrcode';

/** 该工具专属的纯函数，放在 lib/ 下，方便单测和复用 */

export type QrOptions = {
  text: string;
  size: number;
  margin: number;
  level: 'L' | 'M' | 'Q' | 'H';
  dark: string;
  light: string;
};

export const DEFAULT_QR_OPTIONS: QrOptions = {
  text: '',
  size: 320,
  margin: 2,
  level: 'M',
  dark: '#1F2421',
  light: '#FFFFFF',
};

/** 生成 dataURL，供 <img> 预览和下载共用 */
export async function renderQrDataUrl(options: QrOptions): Promise<string> {
  return QRCode.toDataURL(options.text, {
    width: options.size,
    margin: options.margin,
    errorCorrectionLevel: options.level,
    color: { dark: options.dark, light: options.light },
  });
}

/** 校验：空内容不生成，过长的内容给一句人话提示 */
export function validateQrText(text: string): string | null {
  if (!text.trim()) return '先输入要生成二维码的内容';
  if (text.length > 2000) return '内容太长了，二维码装不下这么多字符';
  return null;
}
