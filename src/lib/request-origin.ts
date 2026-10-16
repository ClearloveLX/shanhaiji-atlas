/**
 * 反向代理后面「正确的站点 origin」。
 *
 * ★ 为什么不能直接用 `request.url` 取 origin
 *
 *   Next 的 standalone server 启动时会把 `process.env.__NEXT_PRIVATE_ORIGIN`
 *   设成**自己监听的地址**：
 *
 *     node_modules/next/dist/server/lib/start-server.js:294
 *       const appUrl = `${protocol}://${formattedHostname}:${port}`;
 *     node_modules/next/dist/server/lib/start-server.js:303
 *       process.env.__NEXT_PRIVATE_ORIGIN = appUrl;
 *
 *   而本项目只监听回环（systemd 里 `HOSTNAME=127.0.0.1` / `PORT=4000`，
 *   公网流量一律经 Caddy 转发）。于是 `request.url` 的 origin 是
 *   `http://localhost:4000` —— 拿它拼 307 跳转，
 *   **访客浏览器会去访问访客自己机器上的 localhost:4000**，必然打不开。
 *
 *   实测症状（部署后第一次跑才发现）：
 *     访客未登录访问 /admin
 *       → 307 Location: http://localhost:4000/login?from=%2Fadmin   ← 打不开
 *     访客点了失效外链 /go/xxx
 *       → 307 Location: http://localhost:4000/go/gone               ← 打不开
 *   这两个都是真实用户会走到的路径，所以必须修。
 *
 *   注意 `__NEXT_PRIVATE_ORIGIN` 是**无条件赋值**的，在 systemd 里设同名环境变量
 *   会被覆盖，改不动。正确做法就是这里：从代理转发头里取 origin。
 *
 * 正确的 origin 在转发头里 —— Caddy 的 `reverse_proxy` **默认就会带**
 * `X-Forwarded-Host` 和 `X-Forwarded-Proto`，不用额外配置。
 *
 * 本地开发没有这些头，自动回落到 `Host`（也就是 localhost:4000），行为不变。
 */

type OriginCarrier = {
  headers: Headers;
  nextUrl?: { origin: string };
};

/**
 * 取请求的 origin，形如 `https://atlas.example.com`（不带尾斜杠）。
 * 拿不到任何线索时返回空串，调用方应按相对路径处理。
 */
export function requestOrigin(request: OriginCarrier): string {
  // x-forwarded-host 可能是逗号分隔的链路（多级代理），第一个才是原始客户端访问的主机
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();

  if (host) {
    // 同理，x-forwarded-proto 也可能是 `https, http` 这种链路
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const proto = forwardedProto || 'http';
    return `${proto}://${host}`;
  }

  return request.nextUrl?.origin ?? '';
}

/**
 * 拼一个绝对 URL 字符串给 NextResponse.redirect 用。
 *
 * 为什么优先返回绝对 URL 而不是相对路径：
 *   HTTP 的 Location 允许相对值（RFC 7231），但老爬虫和部分客户端处理得不好；
 *   而且跳转目标站点和当前站点是同一个，绝对 URL 不会出错。
 */
export function absoluteUrl(request: OriginCarrier, pathname: string): string {
  const origin = requestOrigin(request);
  return origin ? new URL(pathname, origin).toString() : pathname;
}
