# Nanobanana Mirror 项目总结报告 (Premium Edition)

本报告详细记录了 **Nanobanana Mirror** 项目的开发历程、核心功能实现以及为适配生产环境所做的关键修复。

---

## 1. 项目概览 (Overview)
**项目名称**：Nanobanana Mirror
**定位**：复刻并升级 Gemini 官方生图体验的专业 AI 生图平台。
**核心特点**：对话式交互、多模型对比、官方参数对齐、全中文本地化、持久化存储。

---

## 2. 已实现功能 (Feature List)

### 🎨 核心生图
- **图生图 (Image-to-Image)**：支持同时上传多张参考图，后端将所有图片合入 Prompt Part 发送给 Gemini。
- **官方参数对齐**：全面支持 `1:1`, `9:16`, `16:9`, `3:4`, `21:9` 等 11 种官方比例。
- **分辨率控制**：内置 `1K/2K/4K` 精度选择，通过 Prompt 文本引导模型生成对应素质。
- **双模型并发**：支持在左侧同时勾选 `Nanobanana 2` 和 `Nanobanana Pro`，一键对比生成效果。

### 💬 交互与 UI/UX
- **对话式界面**：类 Gemini 官方的白金简约设计，生图以消息气泡形式展现。
- **多会话管理**：
  - 支持 **“新建对话”** 功能，隔离不同创作场景。
  - **自动标题生成**：新对话第一条 Prompt 自动设为历史记录标题。
- **历史记录持久化**：使用 `localStorage`，所有聊天记录和生成的图片均能跨会话保存。
- **图片放大 (Lightbox)**：点击任何图片即可全屏预览并支持下载。

---

## 3. 技术架构 (Architecture)

### 后端 (api/ 目录)
- **框架**：FastAPI (Python 3.10+)。
- **Vercel 适配**：入口文件设为 `index.py`，兼容 Vercel Serverless Functions。
- **线程优化**：使用 `ThreadPoolExecutor` 并行调用多模型接口，提高响应速度。
- **安全性**：支持环境变量 `GEMINI_API_KEY` 注入。

### 前端 (frontend/ 目录)
- **框架**：React 18 + TypeScript + Vite。
- **样式**：Vanilla CSS 实现的现代白金主题。
- **代理**：配置 `vite.config.ts` 在本地开发时自动转发 API 请求至 8000 端口。

---

## 4. 关键修复与优化记录 (Fix Logs)

| 模块 | 问题描述 | 解决方案 | 状态 |
| :--- | :--- | :--- | :--- |
| **生图接口** | 旧版 SDK 比例参数不生效 | 接入官方 `ImageConfig.aspect_ratio` 原生参数 | ✅ 已解决 |
| **环境变量** | API Key 路径报错 | 实现多路径搜寻及 `os.getenv` 环境变量优先读取 | ✅ 已解决 |
| **循环依赖** | Vite 报错 `ChatSession` 未导出 | 抽离 `types.ts` 定义，使用 `import type` 打破循环 | ✅ 已解决 |
| **部署适配** | 前后端跨域及路由映射 | 精准配置 `vercel.json` 处理 `api/*` 转发 | ✅ 已解决 |
| **本地服务** | 端口冲突与虚拟环境失效 | 强制 `lsof` 清理端口，并重建 `api/venv` 路径 | ✅ 已解决 |

---

## 5. 部署说明 (Deployment)

### GitHub 推送
1. 手动创建 `nanobanana-mirror` 仓库。
2. 运行：
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/nanobanana-mirror.git
   git push -u origin main
   ```

### Vercel 自动化部署
- **环境变量**：部署时需配置 `GEMINI_API_KEY`。
- **域名**：绑定您的自定义域名（如 `banana.your-domain.xyz`），并在 Cloudflare 中添加 CNAME 记录。

---

## 6. 后续建议 (Recommendations)
- **版本更新**：Gemini 开发版模型变动较快，建议定期检查 `google-genai` SDK 更新。
- **性能优化**：如果生成 4K 图片较多，可以考虑在前端增加图片渐进式加载或 WebP 压缩展示。

---
*文档生成日期：2026-04-16*
