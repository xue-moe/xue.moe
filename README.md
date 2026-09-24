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
| **[tools.xue.moe](https://tools.xue.moe)** | `/tools/index.html` | **效率工具箱**：待办清单、精准时钟、专注计时与字符排错工坊 |
| **[duo.xue.moe](https://duo.xue.moe)** | `/duo/index.html` | **多邻国数学求解器**：3x3 幻方九宫格实时辅助求解计算器 |
| **[dev.xue.moe](https://dev.xue.moe)** | `/dev/index.html` | **实验工坊**：原型功能试验与灵感孵化空间 |

---

## ✨ 核心特性

- **纯粹零构建（Zero-Build Static Web）**：
  无需 `npm run build`、`vite` 或构建流水线，代码即产物，推送到仓库即刻完成部署。
- **边缘子域路由（Cloudflare Pages Functions）**：
  利用 `functions/[[path]].js` 在边缘节点实现高性能路由转发：
  - `www.xue.moe` 301 永久重定向至 `xue.moe`
  - `tools.xue.moe/*`、`duo.xue.moe/*`、`dev.xue.moe/*` 自动反向映射至对应子目录单页并保持浏览器地址栏整洁。
- **原生现代美学**：
  - 优雅的毛玻璃拟态质感（Frosty Glassmorphism），支持浅色与深色模式（自动感知系统偏好并支持手动切换）。
  - 本地托管开源手写字体（Borel WOFF2），杜绝外部字体源阻塞。
  - 纯 SVG 矢量图标与 Mascot 形象，轻量、锐利且无需额外网络请求。
- **隐私优先 & 本地持久化**：
  待办事项、计时偏好、主题状态均存储于本地 `localStorage`，无追踪、无后端数据库依赖。

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
├── fonts/                # 本地字体资源 (Borel.woff2 等)
├── functions/
│   └── [[path]].js       # Cloudflare Pages 边缘子域路由函数
├── GEMINI.md             # AI 配对编程规则与设计规范
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
   - `duo.xue.moe`
   - `dev.xue.moe`

---

## 📄 开源协议与版权

- 代码基于 [WTFPL](LICENSE) 协议分发。
- Designed by **Ryosetsu** · 萌ICP备20230238号
