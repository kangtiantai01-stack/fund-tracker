# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI) + 自定义金融风格组件
- **Styling**: Tailwind CSS 4（深色金融App主题）

## 项目说明

基金持仓实时跟踪 Web 应用，支持持仓管理、实时估值查看、交易记录录入等功能。

### 核心功能
- 资产总览（总资产、持有收益、当日收益等）
- 持仓列表（卡片/表格双视图）
- 实时估值（fundgz.1234567.com.cn，60秒自动刷新）
- 新增交易（买入/卖出，自动计算份额和手续费）
- AI识图（上传交易截图，视觉大模型识别基金名称/金额/方向/日期，确认后写入持仓）
- 基金排行榜（全市场公募基金实时涨跌幅，按类型筛选）
- 板块涨跌（行业板块 + 基金类型板块统计）
- 交易记录查看
- localStorage 数据持久化

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/
│   │   ├── api/fund/[code]/route.ts     # 基金估值 API 代理（JSONP→JSON）
│   │   ├── api/fund-ranking/route.ts    # 基金排行榜 API 代理（东方财富）
│   │   ├── api/sector/route.ts          # 板块涨跌 API 代理（新浪+东方财富）
│   │   ├── api/recognize/route.ts       # AI识图 API（视觉大模型识别交易截图）
│   │   ├── globals.css                  # 全局样式（深色金融主题）
│   │   ├── layout.tsx                   # 根布局（dark mode）
│   │   └── page.tsx                     # 主页面（状态管理+数据刷新）
│   ├── components/
│   │   ├── ui/                          # Shadcn UI 组件库
│   │   ├── AssetSummary.tsx             # 资产总览卡片
│   │   ├── HoldingList.tsx              # 持仓列表（卡片+表格视图）
│   │   ├── TransactionForm.tsx          # 交易输入表单
│   │   ├── TransactionHistory.tsx       # 交易记录列表
│   │   ├── AIImageRecognizer.tsx        # AI识图组件（上传+识别+确认）
│   │   ├── FundRanking.tsx              # 基金排行榜组件
│   │   └── SectorBoard.tsx              # 板块涨跌组件
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/
│   │   ├── types.ts        # 类型定义（Holding, Transaction, FundRealtimeData 等）
│   │   ├── store.ts        # localStorage 操作 + 工具函数
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── DESIGN.md               # 设计规范
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 关键数据流

1. **初始化**：从 localStorage 加载持仓/交易数据，若无则使用 `INITIAL_HOLDINGS` 默认数据
2. **实时估值**：前端调用 `/api/fund/{code}` → API Route 代理请求 fundgz.1234567.com.cn → 解析 JSONP 返回 JSON
3. **交易处理**：提交交易表单 → 获取当前净值 → 计算份额/手续费 → 更新持仓 → 保存 localStorage
4. **自动刷新**：useEffect + setInterval 每60秒调用 refreshFundData

## 配色约定

- 涨（正收益）：`#e54d42`（红）
- 跌（负收益）：`#07c160`（绿）
- 主背景：`#0c0f1a`
- 卡片背景：`#161b2e`

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
