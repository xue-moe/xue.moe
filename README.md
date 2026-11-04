# xue.moe ❄️

> 极简、现代、零构建的个人主页与多子域工具集矩阵。

[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Zero_Build-f38020?style=flat-square&logo=cloudflare)](https://pages.cloudflare.com/)
[![License: WTFPL](https://img.shields.io/badge/License-WTFPL-brightgreen?style=flat-square)](LICENSE)
[![Site: xue.moe](https://img.shields.io/badge/Website-xue.moe-0284c7?style=flat-square)](https://xue.moe)

---

## 🌟 项目概览

`xue.moe` 是一套基于 **Cloudflare Pages** 驱动的纯原生、零构建（Zero-Build）静态网页矩阵。项目无需 Node.js 打包、npm 依赖或外部构建脚本，通过原生 HTML5、现代 CSS 与原生 JavaScript 提供极速的加载性能与自包含体验。

通过 Cloudflare Pages Functions 边缘路由，单个代码库统一管理主域名及多个功能子域：

| 子域名 / 路径 | 部署页面 | 功能简介 |
| :--- | :--- | :--- |
| **[xue.moe](https://xue.moe)** | `/index.html` | **个人门户主页**：毛玻璃个人名片、实时 GitHub 活跃日历与项目矩阵导航 |
| **[tools.xue.moe](https://tools.xue.moe)** | `/tools/index.html` | **效率工具箱**：待办清单、标准时间与世界时钟、专注计时与字符排错工坊 |
| **[time.xue.moe](https://time.xue.moe)** | `/tools/index.html` | **标准时间与世界时钟**：多次网络测量估算设备与服务器的时间差 |
| **[duo.xue.moe](https://duo.xue.moe)** | `/duo/index.html` | **多邻国数学求解器**：3x3 幻方九宫格实时辅助求解计算器 |
| **[ip.xue.moe](https://ip.xue.moe)** | `/ip/index.html` | **网络诊断**：本机 IP、国内外查询源与网站分流测试 |
| **[dev.xue.moe](https://dev.xue.moe)** | `/dev/index.html` | **实验工坊**：原型功能试验与灵感孵化空间（目前设为 noindex，待有实质内容后再开放收录） |

---

## ✨ 核心特性

- **纯粹零构建（Zero-Build Static Web）**：
  无需 `npm run build`、`vite` 或构建流水线，代码即产物，推送到仓库即刻完成部署。
- **边缘子域路由（Cloudflare Pages Functions）**：
  利用 `functions/[[path]].js` 在边缘节点实现高性能路由转发：
  - `www.xue.moe` 301 永久重定向至 `xue.moe`
  - `xue-moe.pages.dev` 301 永久重定向至 `xue.moe`；Cloudflare Pages 预览部署默认带有 `X-Robots-Tag: noindex`。
  - `tools.xue.moe/*`、`time.xue.moe/*`、`duo.xue.moe/*`、`dev.xue.moe/*` 映射至对应单页并保持浏览器地址栏整洁。
  - `/robots.txt` 和 `/sitemap.xml` 按请求主机生成；每份 sitemap 只包含该主机的规范 URL。
- **原生现代美学**：
  - 优雅的毛玻璃拟态质感（Frosty Glassmorphism），支持浅色与深色模式（自动感知系统偏好并支持手动切换）。
  - 本地托管开源手写字体（Borel WOFF2），杜绝外部字体源阻塞。
  - 纯 SVG 矢量图标与 Mascot 形象，轻量、锐利且无需额外网络请求。
- **隐私优先 & 本地持久化**：
  待办事项、计时偏好、主题状态均存储于本地 `localStorage`，不依赖后端数据库。

---

## 📁 目录结构

```text
.
├── index.html            # 主站门户 (xue.moe)
├── tools/
│   └── index.html        # 效率工具箱 (tools.xue.moe)
├── duo/
│   └── index.html        # 多邻国数学求解器 (duo.xue.moe)
├── dev/
│   └── index.html        # 实验工坊引导页 (dev.xue.moe)
├── ip/                   # IP 查询与网络诊断 (ip.xue.moe)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── fonts/                # 本地字体资源 (Borel.woff2 等)
├── _headers              # 静态资源安全响应头
├── _routes.json          # 控制 Pages Function 的路由范围
├── robots.txt            # 主域名 robots.txt 静态回退文件
├── sitemap.xml           # 主域名 sitemap 静态回退文件
├── functions/
│   └── [[path]].js       # Cloudflare Pages 边缘子域路由函数
├── contributions-cache.js       # 定时更新 GitHub 贡献缓存
├── wrangler.toml                # Pages 绑定配置
├── wrangler.contributions.toml  # 缓存 Worker 与 Cron 配置
├── LICENSE               # WTFPL 开源协议
└── README.md             # 项目说明文档
```

---

## 🚀 本地运行与部署

### 1. 本地预览

由于是纯静态页面，可使用任意静态服务器预览：

```bash
# 使用 Python 快速启动本地服务
python3 -m http.server 8000

# 或使用 npx serve
npx serve .
```

浏览器访问 `http://localhost:8000` 即可浏览主站，访问 `http://localhost:8000/tools/` 即可调试工具集。

上述静态服务器只预览页面文件，不会运行 Pages Functions 的 API 和子域名路由。需要调试这些边缘功能时，使用 `npx wrangler pages dev .`。

### 2. 部署到 Cloudflare Pages

1. 将本仓库推送到 GitHub / GitLab。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Compute (Workers & Pages)** -> **Create application** -> **Pages**。
3. 连接本仓库，构建配置设置如下：
   - **Build command**：留空（无需构建命令）
   - **Build output directory**：`/`（项目根目录）
4. 在 **Custom domains** 中添加自定义域名：
   - `xue.moe`
   - `www.xue.moe`
   - `tools.xue.moe`
   - `time.xue.moe`
   - `duo.xue.moe`
   - `dev.xue.moe`
   - `ip.xue.moe`

### IP 查询与网络诊断

`ip.xue.moe` 使用同一个 Pages 项目，无需构建、数据库或 API 密钥。在 Pages 的 **Custom domains** 添加 `ip.xue.moe` 并完成 DNS 绑定，也可在主域名 `/ip/` 预览。

- **本机 IP**：`/api/ip` 返回 Cloudflare 实际看到的连接 IP、归属地与 ASN，按协议填入 IPv4 或 IPv6 卡片，另一协议显示“本次未使用”。点击地址即可复制。
- **国内查询源**：IP.cn、IPIP、IPW.cn。
- **国际查询源**：IP.SB、Cloudflare、ipify。各源由浏览器直连获取真实出口；IPW.cn 与 ipify 提供地址，不虚构归属地。服务地域标签不保证实际节点位置。
- **首页连通性**：检测小红书、Bilibili、腾讯、淘宝、GitHub、Google、Cloudflare、YouTube 的 HTTP 请求耗时，并按 100 / 300 / 1000 ms 分档着色。跨域响应不代表完整可用性，数值不是 ICMP Ping。
- **网站分流测试**：独立 Tab 展示访问目标网站时的出口 IP 和国家 / 地区。读取目标网站的 Cloudflare trace，接口受限时单独标明失败。

仅保留本机 IP 与网站分流两个 Tab，进入时自动检测，运行中不重复发起。页面沿用主站配色与共享 `xue-theme` 偏好，使用独立的工具布局。

`GET /api/ipcn-session` 仅取得 IP.cn 公开页面提供的临时查询 ticket，访客浏览器直接请求 `my.ip.cn` 获取出口；不会在服务端代查访客 IP。`/api/ip` 响应为 `private, no-store`，不使用访客统计 KV。普通静态服务器不运行这两个 API；本地 Functions 预览也不保证有生产 IP 元数据。

数据来源：[IP.cn](https://ip.cn/)、[IPIP](https://www.ipip.net/myip.html)、[IPW.cn](https://ipw.cn/)、[IP.SB](https://ip.sb/api/)、[ipify](https://www.ipify.org/)。功能灵感来自 [ip.skk.moe](https://ip.skk.moe/)。

### 附加：部署贡献日历缓存任务

主页贡献日历由单独的 Cron Worker 每小时抓取一次，并写入 Pages 已使用的 KV 命名空间。访客请求 `/api/contributions` 时读取 KV 缓存；只有缓存为空时才会请求上游 API 来初始化数据。

首次部署 Pages 后，单独部署缓存 Worker 并启用定时触发器：

```bash
npx wrangler deploy --config wrangler.contributions.toml
```

Cron 按 UTC 整点运行。部署后可在 Cloudflare Dashboard 的 Worker 日志中查看 `contributions_cache_refreshed` 和 `contributions_cache_refresh_failed` 事件。请保持 Pages 与缓存 Worker 使用同一个 KV 命名空间。

---

## 📄 开源协议与版权

- 代码基于 [WTFPL](LICENSE) 协议分发。
- Designed by **Ryosetsu** · 萌ICP备20230238号
