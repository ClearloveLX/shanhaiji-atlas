const meta = {
  slug: 'qr-generator',
  name: '二维码生成器',
  description: '把一段文字或链接变成二维码，可调尺寸和容错等级，直接下载 PNG。全程在浏览器里完成。',
  version: '1.0.0',
  /** 纯客户端，不需要服务器 */
  usesServer: false,
  needsWorker: false,
} as const;

export default meta;
