# Solana 高性能中央限价订单簿 DEX (全栈实现)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Powered by Anchor](https://img.shields.io/badge/Powered%20by-Anchor-blue.svg)](https://www.anchor-lang.com/) [![Frontend: React & Next.js](https://img.shields.io/badge/Frontend-React%20%26%20Next.js-cyan.svg)](https://nextjs.org/)

这是一个基于 Solana 和 Anchor 框架构建的企业级、全栈**中央限价订单簿 (CLOB)** 去中心化交易所 (DEX)
。本项目完整复刻了传统金融交易所的核心撮合引擎，并针对 Solana 的高性能环境进行了深度优化，旨在提供一个资本效率高、性能卓越、安全可靠的链上交易解决方案。

项目包含三个核心部分：

1. **Anchor 智能合约**: 实现了一个高性能的链上订单簿和撮合引擎。
2. **React 前端**: 一个功能丰富、用户友好的交易界面。
3. **Crank Bot**: 一个独立的后端撮合机器人，用于自动化市场撮合。

## ✨ 核心功能

- **高性能订单簿**:
    - **`zero-copy` 优化**: 订单簿账户采用 `zero-copy` 反序列化，极大地减少了计算开销和交易延迟。
    - **双向链表结构**: 订单在链上通过双向链表进行组织，实现了 O(1) 复杂度的订单插入和移除（不含查找）。
    - **价格/时间优先**: 严格遵循金融市场的标准撮合原则。
- **完整的交易体验**:
    - **限价单 (Limit Orders)**: 支持用户提交指定价格和数量的限价单。
    - **链上撮合**: 任何人都可以调用 `match_orders` 指令来触发撮合，实现了去中心化的市场执行。
    - **资金结算**: 用户可以随时将其 `OpenOrders` 账户中的可用资金提取回自己的钱包。
- **高效的用户账户模型**:
    - **`OpenOrders` 账户**: 每个用户在每个市场上拥有一个独立的 `OpenOrders` 账户，用于隔离和管理其订单及资金，支持高频交易。
    - **资金锁定与释放**: 智能合约精确管理用户下单时锁定的资金和成交/取消后释放的资金。
- **独立的 Crank Bot**:
    - 提供一个独立的 TypeScript 脚本 (`crank.ts`)，可作为后端服务运行，自动监控并撮合市场订单。
- **全面的管理功能**:
    - 支持管理员设置 **Maker/Taker 手续费**。
    - 支持管理员**暂停/恢复**整个市场的交易活动。

## 🛠️ 技术栈

- **智能合约**: Rust, **Anchor Framework v0.29+**
- **核心数据结构**: **`zero-copy`**, **`Pod` & `Zeroable` (bytemuck)**, **双向链表**
- **区块链**: Solana
- **前端框架**: React, Next.js
- **UI**: Shadcn/UI, Tailwind CSS, Tanstack Table
- **异步状态管理**: **TanStack Query (React Query)**
- **后端脚本**: Node.js, TypeScript
- **钱包集成**: Solana Wallet Adapter
- **测试**: TypeScript, Mocha, Chai, Anchor Tests

## 📂 项目结构

```
.
├── anchor/                  # Anchor 项目
│   ├── programs/order_book_dex/ # DEX 智能合约源码 (lib.rs)
│   └── tests/order_book_dex.ts # 集成测试脚本
├── app/                     # Next.js 前端应用
│   ├── components/order-book/
│   │   ├── orderBookDex-data-access.ts # 核心数据访问层 (React Hooks)
│   │   └── orderBookDex-ui.tsx         # 所有 UI 组件
│   └── app/order-book/page.tsx       # 功能主页/容器组件
├── crank/                   # Crank Bot 目录
│   └── crank.ts             # 独立的撮合机器人脚本
├── package.json
└── README.md
```

## 🚀 快速开始

### 先决条件

- [Node.js v18 或更高版本](https://nodejs.org/en/)
- [Rust 工具链](https://www.rust-lang.org/tools/install)
- [Solana CLI v1.17 或更高版本](https://docs.solana.com/cli/install)
- [Anchor CLI v0.29 或更高版本](https://www.anchor-lang.com/docs/installation)

### 1. 部署智能合约

1. **启动本地验证器**:
   ```bash
   solana-test-validator
   ```
2. **构建并部署合约**: 在项目根目录下，打开另一个终端窗口运行：
   ```bash
   anchor build && anchor deploy
   ```
3. **记录程序 ID**: 部署成功后，复制输出的程序 ID。

### 2. 运行前端应用

1. **更新配置**: 将上一步获取的程序 ID 更新到前端代码中（通常在 `anchor/src/` 目录下的导出文件中）。
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **启动开发服务器**:
   ```bash
   npm run dev
   ```
4. 在浏览器中打开 `http://localhost:3000` 即可访问 DEX 前端。

### 3. 运行 Crank Bot

1. **配置 Crank**:
    * 打开 `crank/crank.ts` 文件。
    * 将 `PROGRAM_ID` 更新为您部署的程序 ID。
    * 在前端创建一个新的交易市场后，复制该市场的公钥，并更新 `MARKET_TO_CRANK` 常量。
    * 确保 `CRANK_OPERATOR_KEYPAIR_PATH` 指向一个有充足 SOL 余额的钱包密钥对文件。
2. **运行机器人**:
   ```bash
   npm run crank
   ```
   机器人将开始每隔 `CRANK_INTERVAL_MS`（默认为 3 秒）检查并撮合市场。

## ✅ 运行测试

我们提供了全面的集成测试，覆盖了从市场初始化、下单、撮合、取消、结算到管理的全过程。

```bash
anchor test
```

## 📜 智能合约深度解析

智能合约 (`programs/order_book_dex/src/lib.rs`) 是 DEX 的核心引擎，专为高性能而设计。

- **`zero-copy` 与 `Pod`**: `OrderBook` 账户是合约中最大、最常被访问的数据结构。通过 `zero-copy`
  ，程序在读取订单簿时避免了昂贵的反序列化过程，直接在链上账户的内存缓冲区进行操作，这是实现低延迟撮合的关键。所有嵌套在
  `OrderBook` 中的结构体都使用了 `Pod` 和 `Zeroable` trait 来确保内存安全。
- **链上双向链表**: 订单簿内部不使用简单的数组，而是通过 `next` 和 `prev` 指针将 `OrderNode`
  组织成一个双向链表。这使得在订单簿的任何位置插入或删除一个订单都是 O(1) 的高效操作（不考虑查找定位的时间）。
- **`match_orders` 与 `remaining_accounts`**: 撮合逻辑的核心。由于撮合的对手方 (Maker) 是动态的，无法在指令中硬编码。因此，
  `match_orders` 指令要求调用者（通常是 Crank Bot）在交易的 `remaining_accounts` 列表中提供 Maker 们的 `OpenOrders`
  账户。程序在运行时从这个列表中动态加载和操作这些账户，实现了灵活的撮合。
- **资金流转**: 资金结算主要在用户的 `OpenOrders` 账户内部进行（`locked` 和 `free`
  余额的调整），而不是频繁地进行代币的实际转账 (CPI)。只有在用户调用 `settle_funds` 时，资金才会从程序的金库 (Vault)
  真正转移到用户的钱包，这种模型极大地提高了交易吞吐量。

## 🖥️ 前端架构深度解析

前端应用 (`app/`) 采用分层架构，确保了代码的模块化和可维护性。

- **数据访问层 (`orderBookDex-data-access.ts`)**:
    - **分层 Hooks**:
        - `useOrderBookProgram`: 负责应用级的全局操作，如获取所有市场列表和创建新市场。
        - `useMarket`: 负责**单个市场**的所有数据查询和交互逻辑，包括获取订单簿、用户 `OpenOrders` 账户以及所有交易和管理操作。
    - **数据解析**: UI 组件 `OrderBookDisplay` 包含一个 `parseOrderBook` 辅助函数，负责将从链上获取的 `zero_copy`
      格式的链表数据，解析成 UI 可以渲染的数组格式。
    - **状态管理**: 利用 `TanStack Query` 自动管理所有链上数据的获取、缓存和刷新，确保 UI 数据的实时性。

- **UI 组件层 (`orderBookDex-ui.tsx`)**:
    - **组件化**: UI 被拆分为多个逻辑组件，如市场创建 (`MarketInitialize`)、市场列表 (`MarketList`)、交易主视图 (
      `TradingView`)、订单簿 (`OrderBookDisplay`)、下单表单 (`NewOrderForm`)、用户面板 (`UserPanel`) 和管理员面板 (
      `MarketAdminPanel`)。
    - **上下文感知 UI**: 界面会根据用户的状态和身份（是否为市场管理员）动态显示不同的组件和操作选项。
    - **用户体验**: 实现了自动创建关联代币账户 (ATA)、精确的浮点数到链上整数的转换、清晰的错误提示和交易状态反馈。

## 📄 许可证

本项目采用 [MIT 许可证](https://opensource.org/licenses/MIT)。