# nananobanana mirror 进度交接总结

更新时间：2026-04-17

## 1. 项目当前状态

这个项目已经从最初的基础复刻版本，推进到了一个可本地运行、可生成图片、具备多会话和参考图编辑能力的版本。

当前本地结构：

- 前端：`/Users/qiushanyueyue/Documents/mac/nanobabana复刻/frontend`
- 后端：`/Users/qiushanyueyue/Documents/mac/nanobabana复刻/api`
- Vercel 配置：`/Users/qiushanyueyue/Documents/mac/nanobabana复刻/vercel.json`
- 当前交接文档：`/Users/qiushanyueyue/Documents/mac/nanobabana复刻/docs/2026-04-17-handoff-summary.md`

## 2. 已完成的核心功能

### 2.1 基础产品结构

- 网站名称已改为 `nananobanana mirror`
- favicon 已替换为香蕉图标
- 页面为三栏布局：
  - 左侧：会话列表
  - 中间：聊天与生成区
  - 右侧：模型、图幅、分辨率、提示词
- 左右侧边栏支持隐藏/展开
- 左侧历史会话支持自动根据首条对话生成标题

### 2.2 会话与持久化

- 每个会话独立保存聊天记录
- 新建会话会清空会话记忆
- 会话标题自动摘要
- 聊天记录持久化已实现
- 图片二进制不再塞进 `localStorage`
- 图片资源已迁移到 `IndexedDB`
- 这样已经规避了之前“点击生成后页面白屏”的主要根因

### 2.3 生图与图生图

- 支持文生图
- 支持上传参考图后图生图
- 支持多张参考图一起发送
- 支持两个模型：
  - `gemini-3.1-flash-image-preview`
  - `gemini-3-pro-image-preview`
- 支持图幅比例选择
- 支持分辨率选择
- 默认分辨率当前是 `1k`

### 2.4 参考图编辑

- 支持画笔标注
- 支持颜色切换
- 支持撤回
- 支持前进
- 支持清空
- 支持添加文本框
- 文本框逻辑当前已修到：
  - 点击空白处新增文本框
  - 输入后按 `Enter` 提交
  - 点击空白处可结束编辑
  - 提交后保留透明背景纯文字

注意：
- 在这轮最后又修了一次“参考图编辑状态下无法添加文本框”的问题
- 修复点：移除了新建文本框后因 `blur` 导致立即提交/删除的逻辑
- 对应文件：`frontend/src/components/ImageEditorModal.tsx`

### 2.5 图片交互

- 聊天中的参考图支持点击放大
- 聊天中的生成图支持点击放大
- 聊天中的图片支持拖拽回输入区作为参考图
- 输入框支持：
  - 粘贴图片作为参考图
  - 拖入本地图片作为参考图
  - 拖入聊天中的图片作为参考图

### 2.6 图片放大层

已实现：

- 点击图片进入 lightbox 放大层
- 放大层支持复制原图
- 放大层支持下载原图
- 滚轮缩放已加入
- 已修默认行为为：
  - 默认 1x 适配视口
  - 默认不出现滚动条
  - 放大后才出现滚动条
- 已加入拖动浏览：
  - 放大后按住鼠标左键可拖动查看图片各区域

注意：
- 这部分是本轮最后阶段刚改的，建议下一个模型重点再实测一遍
- 对应文件：
  - `frontend/src/components/ImageGenerator.tsx`
  - `frontend/src/index.css`

### 2.7 复制与下载

已实现：

- 聊天文字消息支持复制
- 错误消息支持复制
- 图片原图支持复制
- 图片原图支持下载
- 放大层支持复制与下载

复制成功反馈：

- 已开始统一改成“复制后显示对勾”
- 已修补图片复制时浏览器不支持 `ClipboardItem` 的情况
- 现在复制图片失败时会降级为复制 data URL 文本

注意：
- 用户最后仍反馈“某两个位置没有对勾提示”
- 说明这块虽然已经改动，但还需要完整浏览器实测收尾

涉及文件：

- `frontend/src/components/ImageGenerator.tsx`
- `frontend/src/lib/media.ts`
- `frontend/src/index.css`

## 3. 计费与余额

### 3.1 当前规则

前端展示：

- 当前余额只显示一行：`当前余额 $xx.xx USD`
- 不再显示“预计生成后余额”

后端计费：

- 当前余额保存在后端文件：
  - `api/runtime_state.json`
- 核心逻辑在：
  - `api/billing.py`

当前单价规则：

- `gemini-3.1-flash-image-preview`
  - 输入图：`$0.0005 / 张`
  - 输出图：`$0.0672 / 张`
- `gemini-3-pro-image-preview`
  - 输入图：`$0.002 / 张`
  - 输出图：`$0.134 / 张`

### 3.2 Vercel 部署时余额的风险

这是一个重要未完成项。

当前余额文件 `api/runtime_state.json` 是本地文件存储。  
这在本地开发时可用，但部署到 Vercel 后会有问题：

- Vercel Serverless / Functions 文件系统不是稳定持久数据库
- 即使运行时短期能写文件，也不能依赖它长期保存余额
- 部署后实例切换、冷启动、重新部署，都可能让余额丢失或回到初始值

结论：

如果要在 Vercel 上稳定保留余额，不能只依赖 `runtime_state.json`。

后续建议二选一：

1. 临时方案
   - 用环境变量设置初始余额
   - 每次部署重置余额
   - 适合演示

2. 正式方案
   - 把余额迁移到外部持久存储
   - 例如 Vercel KV / Upstash / Supabase / Neon / Redis / 数据库
   - 这是推荐方案

## 4. 后端生成链路现状

### 4.1 已定位并修复的问题

最开始后端使用 `google-genai` SDK。

已明确定位到的问题：

- SDK 在当前环境下会出现 TLS 握手超时
- 同一机器上直接 `curl` 和原生 `httpx` 请求是能通的
- 因此后端已改为直接调用 Gemini REST API

当前后端文件：

- `api/service.py`

### 4.2 已验证成功的请求

本地真实测试已成功：

1. 直接调用后端 service：
   - prompt: `Generate a simple banana on a white background`
   - 返回成功
   - 有图片数据
   - 一次测试耗时约 `65.32s`

2. 通过本地 API `/api/generate`：
   - 成功返回 `200`
   - 一次测试耗时约 `26.05s`

3. 复杂文生图 prompt：
   - prompt: `生成一个马到成功的海报`
   - 在把读取超时放宽后成功返回 `200`
   - 一次测试耗时约 `74.62s`

### 4.3 已调整的超时策略

已修改：

- 不再用单一的 90 秒总超时
- 当前策略是：
  - connect timeout: `10s`
  - read timeout: `180s`
  - write timeout: `30s`
  - pool timeout: `30s`

对应文件：

- `api/service.py`
- `api/index.py`

### 4.4 当前结论

当前项目已经不是“完全跑不通”，而是：

- 简单 prompt 可出图
- 中等复杂 prompt 也能出图
- 但整体生成速度仍偏慢

这里的主要瓶颈现在是 Gemini 图片生成本身，而不是前端白屏或 SDK 完全不可用。

## 5. 当前仍未彻底收尾的问题

### 5.1 复制对勾反馈仍需完整回归

用户最后明确反馈：

- 某些复制按钮仍然没有对勾提示

特别要复测的位置：

- 聊天文字气泡右侧复制
- 错误消息右侧复制
- 生成图卡片下方“复制原图”按钮
- 放大层右上角“复制原图”按钮

### 5.2 生成图卡片动作区需再次实测

已按要求加入图标按钮：

- 重生成
- 复制原图
- 下载原图

但需要继续确认：

- UI 是否正常显示
- 点击后是否真的执行
- 重生成是否正确带回原 prompt / 原参考图 / 原模型

### 5.3 文本气泡仍可能换行过早

用户多次反馈：

- “短短几个字就两行”

已经做过一次样式优化，但还没有完成彻底回归确认。

重点文件：

- `frontend/src/index.css`

### 5.4 参考图编辑要再做浏览器实测

虽然代码已修：

- 新增文本框
- 回车提交
- 点击空白结束编辑

但因为用户前后多次反馈这里有问题，建议下个模型必须再次打开浏览器实测一遍。

### 5.5 超时错误展示可以再优化

目前后端如果超时，会抛出：

- `模型 xxx 生成超时，请稍后重试。`

但在 `api/index.py` 中：

- 某些 `ValueError` 仍会走 `500`
- 更好的做法是把明确的超时错误映射成 `504`

这属于建议改进项，不是主阻塞。

## 6. GitHub / README / 对外公开状态

### 6.1 当前还没有完成的公开发布工作

仓库还没正式推送到用户的 GitHub 仓库：

- GitHub repo: `qiushanyueyue/nanobanana-mirror`

截至交接时状态：

- 本地 `git` 还没有配置 `origin`
- 根目录还没有正式 README
- `frontend/README.md` 还是 Vite 默认模板
- `api/runtime_state.json` 目前是未跟踪文件

### 6.2 发布前建议补的内容

1. 新建根 README，内容建议包括：
   - 项目介绍
   - 功能截图
   - 技术栈
   - 本地启动方法
   - Vercel 部署方法
   - 环境变量说明

2. 替换 `frontend/README.md` 或保留但不作为主文档

3. 把运行态文件加入 `.gitignore`
   - 建议加入：
     - `api/runtime_state.json`

4. 补 `.env.example`
   - 例如：
     - `GEMINI_API_KEY=`
     - 可选：`GENERATION_TIMEOUT_SECONDS=180`

5. 确认仓库中不会提交以下敏感内容：
   - `gemini api key`
   - 各种 `.env*`

## 7. Vercel 部署现状

### 7.1 还没完成

用户希望：

- 上传 GitHub
- 部署到 Vercel
- 绑定您的自定义域名

这部分在交接时还没有真正执行完成。

### 7.2 需要注意的关键点

1. 当前 `vercel.json` 已存在
2. 前端为 Vite 静态构建
3. 后端为 Python Function
4. 自定义域名依赖 Cloudflare DNS

### 7.3 域名绑定的最小操作

大概率最终仍需要用户在 Cloudflare 做一条 DNS：

- 对您的自定义域名
- 按 Vercel 提示添加 `CNAME`
- 指向 Vercel 提供的目标值

如果 Vercel 后台能够自动校验成功，则说明 DNS 已生效。

## 8. 当前关键文件清单

### 后端

- `api/index.py`
- `api/service.py`
- `api/billing.py`

### 前端核心

- `frontend/src/App.tsx`
- `frontend/src/components/ImageGenerator.tsx`
- `frontend/src/components/ImageEditorModal.tsx`
- `frontend/src/components/OptionsPanel.tsx`
- `frontend/src/components/PromptPresetPanel.tsx`
- `frontend/src/components/SessionSidebar.tsx`
- `frontend/src/index.css`

### 前端数据层

- `frontend/src/types.ts`
- `frontend/src/lib/imageStore.ts`
- `frontend/src/lib/media.ts`
- `frontend/src/lib/memory.ts`
- `frontend/src/lib/sessions.ts`
- `frontend/src/lib/costs.ts`
- `frontend/src/lib/editor.ts`

## 9. 已做过的本地验证

已经验证过的命令：

- `frontend/npm run build`
- `frontend/npm run lint`
- `api/python -m py_compile index.py service.py billing.py`

以及多次本地真实 API 调用验证：

- `/api/balance`
- `/api/generate`

## 10. 下一个模型建议的执行顺序

建议下一个模型按这个顺序继续：

1. 先做浏览器回归测试
   - 重点测：
     - 参考图编辑文本框
     - 复制对勾反馈
     - 生成图下方三个图标按钮
     - 放大层滚轮缩放 + 左键拖动

2. 再补 GitHub 公共发布准备
   - 根 README
   - `.env.example`
   - `.gitignore` 增加 `api/runtime_state.json`
   - 截图/配图

3. 再推送到 GitHub
   - 配 `origin`
   - commit
   - push 到 `qiushanyueyue/nanobanana-mirror`

4. 再部署到 Vercel
   - 配环境变量 `GEMINI_API_KEY`
   - 验证线上生图
   - 绑定您的自定义域名

5. 最后再决定余额持久化方案
   - 如果只是演示，可接受部署后余额重置
   - 如果要正式稳定运行，必须接外部持久化存储

## 11. 最重要的交接结论

这次开发最大的进展不是“UI 改了很多”，而是以下三个关键问题已经有明确答案：

1. 项目现在不是完全不能生成
   - 本地已经多次真实出图成功

2. 之前白屏的主要根因已经解决
   - 图片持久化已改为 `IndexedDB`

3. Vercel 部署前最大的真实风险不是 API key 暴露
   - 而是：
     - 余额持久化目前仍是本地文件方案
     - 复杂 prompt 生成时间较长

如果切换模型后要继续推进发布，优先处理：

- 浏览器交互回归
- GitHub 公共仓库整理
- Vercel 持久化余额方案

