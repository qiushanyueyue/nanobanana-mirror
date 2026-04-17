# Nanobanana Mirror 🍌

一个基于 Google Gemini API 的专业级 AI 图像生成与编辑工具。

![Nanobanana Showcase](file:///Users/qiushanyueyue/.gemini/antigravity/brain/fabbc3c7-59ba-4181-b5db-fb4bdaa46e2e/nanobanana_showcase_1776415185504.png)

## ✨ 特性

- **多模型并行生成**：支持同时调用多个 Gemini 模型进行对比。
- **高分辨率输出**：支持 1K, 2K, 4K 分辨率提示增强。
- **长效会话存储**：本地持久化对话历史。
- **图像到图像 (Img2Img)**：支持上传参考图进行引导生成。
- **极致美学设计**：采用 Glassmorphism 玻璃拟态设计，支持深色/浅色模式切换。

## 🛠️ 技术栈

- **Frontend**: React 19 + TypeScript + Vite + Vanilla CSS
- **Backend**: Python 3.10+ + FastAPI
- **AI Engine**: Google Gemini Image Generation Models

## 🚀 部署

### 环境变量

在生产环境（如 Vercel）中，需要配置以下环境变量：

- `GEMINI_API_KEY`: 您的 Google AI SDK 密钥。
- `GEMINI_API_BASE_URL`: (可选) 默认为 `https://generativelanguage.googleapis.com`。

### 部署到 Vercel

本项目适配 Vercel 的单项目混合构建模式：

1. 连接 GitHub 仓库。
2. 配置环境变量。
3. 部署即可。

## 📄 开源协议

MIT License
