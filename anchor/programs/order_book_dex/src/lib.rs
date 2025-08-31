// 导入 Anchor 框架的核心库，提供了构建 Solana 程序所需的大部分工具。
use anchor_lang::prelude::*;
// 导入 Solana 程序库中的 Pubkey 结构体，用于表示账户地址。
use anchor_lang::solana_program::pubkey::Pubkey;
// 导入 Anchor 对 SPL Token 2022 标准（TokenInterface）的支持库。
// use anchor_spl::token_interface::{
//     self as token, Mint, TokenAccount, TokenInterface, TransferChecked,
// };
// 导入与 SPL Token 2022 标准交互所需的特定模块和结构体。
use anchor_spl::{
    // 导入 token_2022 模块中的 transfer_checked 函数，用于安全的代币转账。
    token_2022::{transfer_checked, Transfer, TransferChecked},
    // 导入与代币交互所需的接口和账户类型，如 Mint, Token2022, TokenAccount, TokenInterface。
    token_interface::{Mint, Token2022, TokenAccount, TokenInterface},
};
// 导入 bytemuck 库，用于安全地进行零成本的类型转换，这对于 zero_copy 反序列化至关重要。
use bytemuck::{Pod, Zeroable};
// 导入标准库中的 size_of 函数，用于获取类型的大小。
use std::mem::size_of;

// --- 程序 ID ---
// 声明程序的唯一ID，部署后由 Solana CLI 生成和填充。
declare_id!("6Kw1m5tG9E6Hh9TSzuofdCbjLLtjdRuQGFhiFDuZaJuL");

// --- 常量 ---
// 每个订单簿（买单或卖单）可以容纳的最大订单数量。
const MAX_ORDERS_PER_BOOK: usize = 64;
// 每个用户可以拥有的最大未结订单数量。
const MAX_OPEN_ORDERS_PER_USER: usize = 16;
// 哨兵值，用于表示链表的末尾（类似于 null）。使用 u32 的最大值。
const SENTINEL: u32 = u32::MAX;
// 程序的版本号。
const PROGRAM_VERSION: u8 = 2;
// 默认的最小基础代币下单数量。
const DEFAULT_MIN_BASE_QTY: u64 = 1;
// 默认的最小名义价值（价格 * 数量）。
const DEFAULT_MIN_NOTIONAL: u64 = 1;
// 用于价格计算的缩放因子，避免浮点数运算。
const PRICE_SCALE: u128 = 1_000_000;

// --- 工具结构体与枚举 ---

// PodBool 是一个布尔值的内存安全表示，用于 `zero_copy` 账户。
// Pod 和 Zeroable trait 要求数据类型没有填充字节，并且可以安全地从全零字节初始化。
// Rust 的 `bool` 类型内存布局不确定，所以我们用 `u8` 来代替。
#[derive(
    // 允许结构体被克隆。
    Clone,
    // 允许结构体被复制。
    Copy,
    // 为调试目的，实现 Debug trait。
    Debug,
    // 实现 Default trait，提供默认值。
    Default,
    // 实现 PartialEq trait，用于比较两个实例是否相等。
    PartialEq,
    // 实现 Eq trait，表示相等的传递性。
    Eq,
    // 标记该类型为 Plain Old Data，可以安全地进行字节级复制。
    Pod,
    // 标记该类型可以安全地从全零字节初始化。
    Zeroable,
    // 实现 Anchor 的序列化 trait。
    AnchorSerialize,
    // 实现 Anchor 的反序列化 trait。
    AnchorDeserialize,
)]
// 确保 PodBool 和 u8 有完全相同的内存布局。
#[repr(transparent)]
// 定义 PodBool 结构体，内部包含一个 u8。
pub struct PodBool(u8);
// 为 PodBool 实现 From<bool> trait。
impl From<bool> for PodBool {
    // 实现从 Rust `bool` 到 `PodBool` 的转换。
    fn from(b: bool) -> Self {
        // 将 bool 转换为 u8 (true -> 1, false -> 0) 并包装在 PodBool 中。
        PodBool(b as u8)
    }
}
// 为 bool 实现 From<PodBool> trait。
impl From<PodBool> for bool {
    // 实现从 `PodBool` 到 Rust `bool` 的转换。
    fn from(b: PodBool) -> Self {
        // 将 PodBool 内部的 u8 与 0 比较，非零值为 true。
        b.0 != 0
    }
}

// 订单簿中节点的标签，用于区分节点的状态。
// 指定枚举使用 u8 类型表示。
#[repr(u8)]
// 派生常用的 trait。
#[derive(PartialEq, Debug, Clone, Copy, Eq, Zeroable, AnchorSerialize, AnchorDeserialize)]
// 定义 NodeTag 枚举。
pub enum NodeTag {
    // 未初始化状态
    Uninitialized,
    // 空闲节点，在空闲列表中
    FreeNode,
    // 已被订单占用的节点
    OrderNode,
}
// `unsafe impl Pod` 表示我们向编译器保证这个枚举类型可以安全地进行零成本转换。
unsafe impl Pod for NodeTag {}
// 为 NodeTag 实现 Default trait。
impl Default for NodeTag {
    // 默认值为 Uninitialized。
    fn default() -> Self {
        // 返回 Uninitialized 成员。
        NodeTag::Uninitialized
    }
}

// --- 核心数据结构 (定义在顶层) ---

// `Order` 结构体，存储单个订单的核心信息。
// `Pod` 和 `Zeroable` 使得它可以被包含在 `zero_copy` 账户中。
// 派生常用的 trait。
#[derive(Clone, Copy, Pod, Zeroable, Default, AnchorSerialize, AnchorDeserialize)]
// 确保字段按 C 语言的内存布局排列，避免重排。
#[repr(C)]
// 定义 Order 结构体。
pub struct Order {
    // 订单所有者的 OpenOrders 账户地址
    pub owner_account: Pubkey,
    // 订单的唯一 ID
    pub order_id: u64,
    // 订单价格（整数表示）
    pub price: u64,
    // 订单的基础代币数量
    pub base_qty: u64,
}

// `OrderNode` 结构体，代表订单簿中的一个节点。
// 它包含一个 `Order` 以及用于构成双向链表的指针。
// 派生常用的 trait。
#[derive(Clone, Copy, Pod, Zeroable, Default, AnchorSerialize, AnchorDeserialize)]
// 确保字段按 C 语言的内存布局排列。
#[repr(C)]
// 定义 OrderNode 结构体。
pub struct OrderNode {
    // 包含的订单信息
    pub order: Order,
    // 指向下一个节点的索引
    pub next: u32,
    // 指向前一个节点的索引
    pub prev: u32,
    // 节点的当前状态标签
    pub tag: NodeTag,
    // 填充字节，确保结构体大小对齐，这对于内存操作很重要。
    pub _padding: [u8; 7],
}

// `Market` 账户，存储一个交易对市场的所有配置和状态信息。
// Anchor 宏，为该结构体实现序列化、反序列化和账户所有权检查。
#[account]
// 确保字段按 C 语言的内存布局排列。
#[repr(C)]
// 派生 Default trait 和 Anchor 的 InitSpace trait，用于自动计算账户空间。
#[derive(Default, InitSpace)]
// 定义 Market 结构体。
pub struct Market {
    // 程序版本
    pub version: u8,
    // 基础代币的 mint 地址 (例如: SOL/USDC 中的 SOL)
    pub base_mint: Pubkey,
    // 报价代币的 mint 地址 (例如: SOL/USDC 中的 USDC)
    pub quote_mint: Pubkey,
    // 存储基础代币的程序金库地址
    pub base_vault: Pubkey,
    // 存储报价代币的程序金库地址
    pub quote_vault: Pubkey,
    // 存储手续费的程序金库地址
    pub fee_vault: Pubkey,
    // 市场的管理权限地址
    pub authority: Pubkey,
    // 买单簿账户地址
    pub bids: Pubkey,
    // 卖单簿账户地址
    pub asks: Pubkey,
    // Market PDA 的 bump seed
    pub bump: u8,
    // 用于生成唯一订单 ID 的序列号
    pub order_sequence_number: u64,
    // Maker（挂单者）手续费率（单位：基点, 1 bps = 0.01%）
    pub maker_fee_bps: u16,
    // Taker（吃单者）手续费率（单位：基点）
    pub taker_fee_bps: u16,
    // 基础代币的小数位数
    pub base_decimals: u8,
    // 报价代币的小数位数
    pub quote_decimals: u8,
    // 市场是否暂停交易
    pub paused: bool,
    // 价格的最小变动单位
    pub tick_size: u64,
    // 基础代币数量的最小下单单位
    pub base_lot_size: u64,
    // 最小基础代币下单量
    pub min_base_qty: u64,
    // 最小名义价值（价格 * 数量）
    pub min_notional: u64,
}

// 为 `Market` 实现关联函数。
// impl Market {
//     // 定义账户大小常量，8 字节是 Anchor 添加的 discriminator。
//     pub const LEN: usize = 8 + size_of::<Self>();
// }

// `OpenOrders` 账户，每个用户在特定市场上的订单和资金状态。
// Anchor 宏，标记这是一个账户结构体。
#[account]
// 确保字段按 C 语言的内存布局排列。
#[repr(C)]
// 派生 Default 和 InitSpace traits。
#[derive(Default, InitSpace)]
// 定义 OpenOrders 结构体。
pub struct OpenOrders {
    // 关联的市场地址
    pub market: Pubkey,
    // 该账户的所有者地址
    pub owner: Pubkey,
    // OpenOrders PDA 的 bump seed
    pub bump: u8,
    // 未锁定的基础代币数量（可提取）
    pub base_token_free: u64,
    // 未锁定的报价代币数量（可提取）
    pub quote_token_free: u64,
    // 因挂单而锁定的基础代币数量
    pub base_token_locked: u64,
    // 因挂单而锁定的报价代币数量
    pub quote_token_locked: u64,
    // 存储用户的活动订单 ID
    pub order_ids: [u64; MAX_OPEN_ORDERS_PER_USER],
    // 标记 order_ids 数组中的槽位是否被占用
    pub is_initialized: [bool; MAX_OPEN_ORDERS_PER_USER],
}

// 为 `OpenOrders` 实现方法。
impl OpenOrders {
    // 定义账户大小常量。
    // pub const LEN: usize = 8 + size_of::<Self>();

    // 查找一个未被使用的订单槽位。
    pub fn find_free_slot(&self) -> Option<usize> {
        // 遍历 is_initialized 数组，找到第一个为 false 的元素并返回其索引。
        self.is_initialized.iter().position(|&init| !init)
    }

    // 将一个新订单 ID 添加到用户的活动订单列表中。
    pub fn add_order(&mut self, order_id: u64) -> Result<()> {
        // 找到一个空闲槽位，如果找不到则返回错误。
        let slot = self.find_free_slot().ok_or(ErrorCode::OpenOrdersFull)?;
        // 将订单 ID 存入该槽位。
        self.order_ids[slot] = order_id;
        // 标记该槽位已被占用。
        self.is_initialized[slot] = true;
        // 返回成功。
        Ok(())
    }

    // 从用户的活动订单列表中移除一个订单 ID。
    pub fn remove_order(&mut self, order_id_to_remove: u64) -> Result<()> {
        // 查找指定 order_id 所在的槽位。
        let slot = self
            // 迭代 is_initialized 数组。
            .is_initialized
            .iter()
            // 将其与 order_ids 数组的迭代器配对。
            .zip(self.order_ids.iter())
            // 查找第一个满足条件的元素位置：已初始化且订单ID匹配。
            .position(|(&initialized, &id)| initialized && id == order_id_to_remove)
            // 如果找不到，则返回 OrderNotFoundInOpenOrders 错误。
            .ok_or(ErrorCode::OrderNotFoundInOpenOrders)?;

        // 标记该槽位为空闲。
        self.is_initialized[slot] = false;
        // 重置订单ID为0。
        self.order_ids[slot] = 0;
        // 返回成功。
        Ok(())
    }
}

// `OrderBook` 账户，存储买单簿或卖单簿。
// 使用 zero_copy，避免大数据在堆栈和堆之间复制，提高性能。
#[account(zero_copy)]
// 保证内存布局
#[repr(C)]
// 定义 OrderBook 结构体。
pub struct OrderBook {
    // 关联的市场地址
    pub market: Pubkey,
    // 标记这是买单簿 (true) 还是卖单簿 (false)
    pub is_bids: PodBool,
    // OrderBook PDA 的 bump seed
    pub bump: u8,
    // 填充字节以对齐内存。
    _padding1: [u8; 2],
    // 链表的头节点索引
    pub head: u32,
    // 链表的尾节点索引
    pub tail: u32,
    // 空闲节点链表的头节点索引
    pub free_list_head: u32,
    // 订单簿中的订单总数
    pub count: u32,
    // 填充字节以对齐内存。
    _padding2: [u8; 4],
    // 存储所有订单节点的数组
    pub nodes: [OrderNode; MAX_ORDERS_PER_BOOK],
}

// 为 `OrderBook` 实现方法。
impl OrderBook {
    // 定义账户大小常量。
    pub const LEN: usize = 8 + size_of::<Self>();

    // 初始化订单簿。
    pub fn initialize(&mut self, market: Pubkey, is_bids: bool, bump: u8) -> Result<()> {
        // 设置关联的市场地址。
        self.market = market;
        // 将 bool 转换为 PodBool 并设置。
        self.is_bids = is_bids.into();
        // 设置 PDA 的 bump seed。
        self.bump = bump;
        // 初始时链表为空，头指针指向哨兵值。
        self.head = SENTINEL;
        // 初始时链表为空，尾指针指向哨兵值。
        self.tail = SENTINEL;
        // 初始订单数量为 0。
        self.count = 0;
        // 空闲列表从索引 0 开始。
        self.free_list_head = 0;

        // 遍历所有节点，将它们串成一个空闲列表。
        for i in 0..MAX_ORDERS_PER_BOOK {
            // 设置节点标签为空闲。
            self.nodes[i].tag = NodeTag::FreeNode;
            // 指向下一个节点，形成链表。
            self.nodes[i].next = (i as u32) + 1;
            // 初始时 prev 指向哨兵值。
            self.nodes[i].prev = SENTINEL;
            // 将订单数据重置为默认值。
            self.nodes[i].order = Default::default();
        }
        // 最后一个空闲节点的 next 指向哨兵值，表示列表结束。
        self.nodes[MAX_ORDERS_PER_BOOK - 1].next = SENTINEL;
        // 返回成功。
        Ok(())
    }

    // 从空闲列表中获取一个新节点。
    fn new_node(&mut self) -> Result<u32> {
        // 如果空闲列表为空（头指针为哨兵值），则订单簿已满。
        if self.free_list_head == SENTINEL {
            // 返回 OrderBookFull 错误。
            return err!(ErrorCode::OrderBookFull);
        }
        // 获取当前空闲列表的头节点作为新节点。
        let new_node_index = self.free_list_head;
        // 更新空闲列表的头节点为下一个空闲节点。
        let next_free_node_index = self.nodes[new_node_index as usize].next;
        // 更新空闲列表的头指针。
        self.free_list_head = next_free_node_index;
        // 更新新节点的状态为 OrderNode。
        self.nodes[new_node_index as usize].tag = NodeTag::OrderNode;
        // 新节点的 next 指针初始化为哨兵值。
        self.nodes[new_node_index as usize].next = SENTINEL;
        // 新节点的 prev 指针初始化为哨兵值。
        self.nodes[new_node_index as usize].prev = SENTINEL;
        // 订单数量加一，使用 checked_add 防止溢出。
        self.count = self.count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        // 返回新节点的索引。
        Ok(new_node_index)
    }

    // 将一个节点释放回空闲列表。
    fn release_node(&mut self, node_index: u32) -> Result<()> {
        // 获取当前空闲列表的头节点。
        let current_free_list_head = self.free_list_head;
        // 更新节点状态为 FreeNode。
        self.nodes[node_index as usize].tag = NodeTag::FreeNode;
        // 将此节点的 next 指向原空闲列表的头部。
        self.nodes[node_index as usize].next = current_free_list_head;
        // 更新空闲列表的头指针为此节点。
        self.free_list_head = node_index;
        // 数量减一，saturating_sub 防止下溢（虽然在这里不太可能发生）。
        self.count = self.count.saturating_sub(1);
        // 返回成功。
        Ok(())
    }

    // 向订单簿中添加一个新订单，并保持价格/时间优先排序。
    pub fn add_order(&mut self, order: Order) -> Result<()> {
        // 1. 从空闲列表分配一个新节点用于存放订单。
        let new_node_index = self.new_node()?;

        // 2. 寻找正确的插入位置。
        // 从头节点开始遍历，寻找第一个“不符合”排序规则的节点，即新订单应该插入到该节点之前。
        let mut insertion_point = self.head;
        while insertion_point != SENTINEL {
            let current_node = &self.nodes[insertion_point as usize];

            // 比较函数，确定新订单是否应该排在当前节点之前。
            let should_insert_before = if self.is_bids.into() {
                // 买单簿(bids)：价格从高到低，时间从早到晚 (order_id 小的优先)。
                order.price > current_node.order.price
                    || (order.price == current_node.order.price
                        && order.order_id < current_node.order.order_id)
            } else {
                // 卖单簿(asks)：价格从低到高，时间从早到晚。
                order.price < current_node.order.price
                    || (order.price == current_node.order.price
                        && order.order_id < current_node.order.order_id)
            };

            if should_insert_before {
                // 找到了插入点，跳出循环。
                break;
            }
            // 继续寻找下一个节点。
            insertion_point = current_node.next;
        }

        // 3. 执行统一的链表插入逻辑。
        // `insertion_point` 现在是新节点将要插入的位置的前一个节点 (即新节点的 next)。
        // 它可以是链表中的一个节点，也可以是 SENTINEL (表示插入到尾部)。

        let prev_node_index;
        let next_node_index = insertion_point;

        if next_node_index == self.head {
            // 情况 A: 插入到链表的最前面 (包括空链表的情况)。
            prev_node_index = SENTINEL;
            self.head = new_node_index;
        } else {
            // 情况 B: 插入到中间或尾部。
            // 此时 `next_node_index` 要么是一个有效节点，要么是 SENTINEL (尾部)。
            // 我们需要找到它的前一个节点。
            if next_node_index == SENTINEL {
                // 如果插入到尾部，前一个节点就是当前的 tail。
                prev_node_index = self.tail;
            } else {
                // 如果插入到中间，前一个节点是 `next_node_index` 的 prev。
                prev_node_index = self.nodes[next_node_index as usize].prev;
            }
            // 更新前一个节点的 `next` 指针。
            self.nodes[prev_node_index as usize].next = new_node_index;
        }

        if next_node_index == SENTINEL {
            // 如果新节点是最后一个节点，更新 tail 指针。
            self.tail = new_node_index;
        } else {
            // 如果新节点后面还有节点，更新后面那个节点的 `prev` 指针。
            self.nodes[next_node_index as usize].prev = new_node_index;
        }

        // 4. 设置新节点自身的指针和数据。
        let new_node = &mut self.nodes[new_node_index as usize];
        new_node.prev = prev_node_index;
        new_node.next = next_node_index;
        new_node.order = order;

        Ok(())
    }
    // 从订单簿中移除一个订单。
    pub fn remove_order(&mut self, node_index: u32) -> Result<()> {
        // 获取要移除节点的引用。
        let node = &self.nodes[node_index as usize];
        // 获取前一个节点的索引。
        let prev_index = node.prev;
        // 获取后一个节点的索引。
        let next_index = node.next;

        // 更新前后节点的指针，将当前节点从链表中"摘除"。
        if prev_index != SENTINEL {
            // 如果存在前一个节点，更新其 next 指针。
            self.nodes[prev_index as usize].next = next_index;
        } else {
            // 如果移除的是头节点，更新链表的头指针。
            self.head = next_index;
        }
        // 如果存在后一个节点。
        if next_index != SENTINEL {
            // 更新其 prev 指针。
            self.nodes[next_index as usize].prev = prev_index;
        } else {
            // 如果移除的是尾节点，更新链表的尾指针。
            self.tail = prev_index;
        }
        // 将节点释放回空闲列表。
        self.release_node(node_index)?;
        // 返回成功。
        Ok(())
    }

    // 根据索引获取一个节点的引用。
    pub fn get_node(&self, node_index: u32) -> Option<&OrderNode> {
        // 如果索引是哨兵值，表示无效节点。
        if node_index == SENTINEL {
            // 返回 None。
            None
        } else {
            // 否则返回该索引处节点的引用。
            Some(&self.nodes[node_index as usize])
        }
    }

    // 获取最优价格的订单（买单簿的最高价，卖单簿的最低价）。
    pub fn get_best_price_order(&self) -> Option<Order> {
        // 获取头节点，并将其中的 order 字段映射出来。
        self.get_node(self.head).map(|n| n.order)
    }

    // 根据订单 ID 查找订单。
    pub fn find_order_by_id(&self, order_id: u64) -> Option<(u32, Order)> {
        // 从头节点开始遍历。
        let mut current_index = self.head;
        // 循环直到链表末尾。
        while current_index != SENTINEL {
            // 获取当前节点。
            let node = self.get_node(current_index)?;
            // 如果找到匹配的订单 ID。
            if node.order.order_id == order_id {
                // 返回节点索引和订单信息。
                return Some((current_index, node.order));
            }
            // 移动到下一个节点。
            current_index = node.next;
        }
        // 如果遍历完都找不到，返回 None。
        None
    }
}

// --- 指令模块 ---
// Anchor 宏，声明这是一个 Solana 程序的主模块。
#[program]
// 定义程序的主模块。
pub mod order_book_dex {
    // 导入父模块（顶层）的所有内容。
    use super::*;

    // `initialize_market` 指令：创建一个新的交易市场。
    pub fn initialize_market(
        // 账户上下文
        ctx: Context<InitializeMarket>,
        // Maker 手续费率
        maker_fee_bps: u16,
        // Taker 手续费率
        taker_fee_bps: u16,
        // 价格最小变动单位
        tick_size: u64,
        // 数量最小变动单位
        base_lot_size: u64,
        // 可选：最小下单数量
        min_base_qty: Option<u64>,
        // 可选：最小名义价值
        min_notional: Option<u64>,
    ) -> Result<()> {
        // 获取 market 账户的可变引用。
        let market = &mut ctx.accounts.market;
        // 验证手续费率是否在有效范围内 (0% - 100%)。10_000 bps = 100%。
        require!(
            maker_fee_bps <= 10_000 && taker_fee_bps <= 10_000,
            ErrorCode::InvalidFee
        );
        // 验证 tick_size 和 lot_size 必须大于 0。
        require!(
            tick_size > 0 && base_lot_size > 0,
            ErrorCode::InvalidMarketParams
        );

        // 初始化 Market 账户的各个字段。
        market.version = PROGRAM_VERSION;
        // 设置基础代币的 mint 地址。
        market.base_mint = ctx.accounts.base_mint.key();
        // 设置报价代币的 mint 地址。
        market.quote_mint = ctx.accounts.quote_mint.key();
        // 设置基础代币金库地址。
        market.base_vault = ctx.accounts.base_vault.key();
        // 设置报价代币金库地址。
        market.quote_vault = ctx.accounts.quote_vault.key();
        // 设置手续费金库地址。
        market.fee_vault = ctx.accounts.fee_vault.key();
        // 设置市场管理员地址。
        market.authority = ctx.accounts.authority.key();
        // 设置买单簿地址。
        market.bids = ctx.accounts.bids.key();
        // 设置卖单簿地址。
        market.asks = ctx.accounts.asks.key();
        // 存储 Market PDA 的 bump seed。
        market.bump = ctx.bumps.market;
        // 初始化订单序列号为 0。
        market.order_sequence_number = 0;
        // 设置 maker 手续费率。
        market.maker_fee_bps = maker_fee_bps;
        // 设置 taker 手续费率。
        market.taker_fee_bps = taker_fee_bps;
        // 初始化市场为未暂停状态。
        market.paused = false;
        // 设置价格的最小变动单位。
        market.tick_size = tick_size;
        // 设置数量的最小变动单位。
        market.base_lot_size = base_lot_size;
        // 设置最小下单数量，如果未提供则使用默认值。
        market.min_base_qty = min_base_qty.unwrap_or(DEFAULT_MIN_BASE_QTY);
        // 设置最小名义价值，如果未提供则使用默认值。
        market.min_notional = min_notional.unwrap_or(DEFAULT_MIN_NOTIONAL);
        // 记录基础代币的小数位数。
        market.base_decimals = ctx.accounts.base_mint.decimals;
        // 记录报价代币的小数位数。
        market.quote_decimals = ctx.accounts.quote_mint.decimals;

        // 初始化买单簿账户。
        ctx.accounts
            // 获取买单簿账户加载器。
            .bids
            // 加载并初始化 zero_copy 账户，这只在创建账户时调用一次。
            .load_init()?
            // 调用 OrderBook 的 initialize 方法。
            .initialize(market.key(), true, ctx.bumps.bids)?;
        // 初始化卖单簿账户。
        ctx.accounts
            // 获取卖单簿账户加载器。
            .asks
            // 加载并初始化 zero_copy 账户。
            .load_init()?
            // 调用 OrderBook 的 initialize 方法，false 表示是卖单簿。
            .initialize(market.key(), false, ctx.bumps.asks)?;

        // 发出一个事件，通知链下客户端市场已成功初始化。
        emit!(MarketInitializedEvent {
            // 市场地址。
            market: market.key(),
            // 基础代币 mint。
            base_mint: market.base_mint,
            // 报价代币 mint。
            quote_mint: market.quote_mint,
            // maker 手续费。
            maker_fee_bps,
            // taker 手续费。
            taker_fee_bps,
            // 价格精度。
            tick_size,
            // 数量精度。
            base_lot_size,
        });

        // 返回成功。
        Ok(())
    }

    // `new_limit_order` 指令：下一个新的限价单。
    pub fn new_limit_order(
        // 账户上下文。
        ctx: Context<NewLimitOrder>,
        // 订单方向（买或卖）
        side: Side,
        // 价格
        price: u64,
        // 数量
        quantity: u64,
    ) -> Result<()> {
        // 获取 market 账户的可变引用。
        let market = &mut ctx.accounts.market;
        // 获取 open_orders 账户的可变引用。
        let open_orders = &mut ctx.accounts.open_orders;

        // 验证市场是否暂停。
        require!(!market.paused, ErrorCode::Paused);
        // 验证价格和数量是否大于0。
        require!(price > 0 && quantity > 0, ErrorCode::InvalidOrderInput);
        // 验证价格是否是 tick_size 的整数倍。
        require!(price % market.tick_size == 0, ErrorCode::InvalidTickSize);
        // 验证数量是否是 base_lot_size 的整数倍。
        require!(
            quantity % market.base_lot_size == 0,
            ErrorCode::InvalidLotSize
        );

        // 如果用户的 OpenOrders 账户是首次使用（market 地址为默认值），则进行初始化。
        if open_orders.market == Pubkey::default() {
            // 设置关联的市场地址。
            open_orders.market = market.key();
            // 设置账户所有者地址。
            open_orders.owner = ctx.accounts.owner.key();
            // 存储 OpenOrders PDA 的 bump seed。
            open_orders.bump = ctx.bumps.open_orders;
        }

        // 根据订单方向，锁定相应的代币。
        match side {
            // 如果是买单。
            Side::Bid => {
                // 计算需要锁定的报价代币总额。
                let base_quote_amount = (price as u128)
                    // 价格乘以数量。
                    .checked_mul(quantity as u128)
                    // 除以缩放因子，得到实际金额。
                    .and_then(|v| v.checked_div(PRICE_SCALE))
                    // 如果溢出则返回错误。
                    .ok_or(ErrorCode::MathOverflow)? as u64;

                // 计算可能的最大 taker fee。
                let max_taker_fee =
                    // 报价总额乘以 taker 手续费率。
                    (base_quote_amount as u128 * market.taker_fee_bps as u128 / 10_000) as u64;

                // 锁定的总金额 = 基础金额 + 最大手续费。
                let total_quote_amount_to_lock = base_quote_amount
                    // 使用 checked_add 防止溢出。
                    .checked_add(max_taker_fee)
                    .ok_or(ErrorCode::MathOverflow)?;
                // 通过 CPI 调用 Token Program，将报价代币从用户账户转移到程序的金库账户。
                transfer_checked(
                    // 创建 CPI 上下文。
                    CpiContext::new(
                        // 传入 Token Program 的账户信息。
                        ctx.accounts.token_program.to_account_info(),
                        // 定义转账所需的账户。
                        TransferChecked {
                            // 源账户（用户）。
                            from: ctx.accounts.user_quote_token_account.to_account_info(),
                            // 代币的 mint。
                            mint: ctx.accounts.quote_mint.to_account_info(),
                            // 目标账户（程序金库）。
                            to: ctx.accounts.quote_vault.to_account_info(),
                            // 授权方（用户）。
                            authority: ctx.accounts.owner.to_account_info(),
                        },
                    ),
                    // 转账金额。
                    total_quote_amount_to_lock,
                    // 代币的小数位数。
                    market.quote_decimals,
                )?;
                // 更新 OpenOrders 账户中锁定的报价代币数量。
                open_orders.quote_token_locked = open_orders
                    .quote_token_locked
                    // 使用 checked_add 防止溢出。
                    .checked_add(total_quote_amount_to_lock)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
            // 如果是卖单。
            Side::Ask => {
                // 通过 CPI 调用 Token Program，将基础代币从用户账户转移到程序的金库账户。
                transfer_checked(
                    // 创建 CPI 上下文。
                    CpiContext::new(
                        // 传入 Token Program 的账户信息。
                        ctx.accounts.token_program.to_account_info(),
                        // 定义转账所需的账户。
                        TransferChecked {
                            // 源账户（用户）。
                            from: ctx.accounts.user_base_token_account.to_account_info(),
                            // 代币的 mint。
                            mint: ctx.accounts.base_mint.to_account_info(),
                            // 目标账户（程序金库）。
                            to: ctx.accounts.base_vault.to_account_info(),
                            // 授权方（用户）。
                            authority: ctx.accounts.owner.to_account_info(),
                        },
                    ),
                    // 转账金额（即卖单数量）。
                    quantity,
                    // 代币的小数位数。
                    market.base_decimals,
                )?;
                // 更新 OpenOrders 账户中锁定的基础代币数量。
                open_orders.base_token_locked = open_orders
                    .base_token_locked
                    // 使用 checked_add 防止溢出。
                    .checked_add(quantity)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }

        // 订单序列号加一，以生成新的唯一订单 ID。
        market.order_sequence_number += 1;
        // 获取新的订单 ID。
        let order_id = market.order_sequence_number;

        // 创建新的 Order 对象。
        let new_order = Order {
            // 订单所有者的 OpenOrders 账户地址。
            owner_account: open_orders.key(),
            // 订单 ID。
            order_id,
            // 价格。
            price,
            // 数量。
            base_qty: quantity,
        };

        // 根据订单方向，加载对应的订单簿（可变）。
        let mut order_book = match side {
            // 如果是买单，加载买单簿。
            Side::Bid => ctx.accounts.bids.load_mut()?,
            // 如果是卖单，加载卖单簿。
            Side::Ask => ctx.accounts.asks.load_mut()?,
        };

        // 将新订单添加到订单簿。
        order_book.add_order(new_order)?;
        // 将订单 ID 记录到用户的 OpenOrders 账户。
        open_orders.add_order(order_id)?;

        // 发出下单事件。
        emit!(OrderPlacedEvent {
            // 市场地址。
            market: market.key(),
            // 订单所有者地址。
            owner: ctx.accounts.owner.key(),
            // 订单 ID。
            order_id,
            // 价格。
            price,
            // 数量。
            quantity,
            // 订单方向。
            side,
        });

        // 返回成功。
        Ok(())
    }

    // `cancel_limit_order` 指令：取消一个限价单。
    pub fn cancel_limit_order(ctx: Context<CancelLimitOrder>, order_id: u64) -> Result<()> {
        // 获取 open_orders 账户的可变引用。
        let open_orders = &mut ctx.accounts.open_orders;

        // 查找订单。首先在买单簿查找，如果找不到再去卖单簿查找。
        let (node_index, order, side) = {
            // 加载买单簿（不可变）。
            let bids = ctx.accounts.bids.load()?;
            // 在买单簿中查找订单。
            if let Some((index, order)) = bids.find_order_by_id(order_id) {
                // 如果找到，返回节点索引、订单信息和买单方向。
                (index, order, Side::Bid)
            } else {
                // 如果在买单簿中没找到，加载卖单簿（不可变）。
                let asks = ctx.accounts.asks.load()?;
                // 在卖单簿中查找订单。
                let (index, order) = asks
                    .find_order_by_id(order_id)
                    // 如果在卖单簿也找不到，返回 OrderNotFound 错误。
                    .ok_or(ErrorCode::OrderNotFound)?;
                // 如果找到，返回节点索引、订单信息和卖单方向。
                (index, order, Side::Ask)
            }
        };

        // 验证调用者是否是订单的所有者。
        require_keys_eq!(
            order.owner_account,
            open_orders.key(),
            ErrorCode::Unauthorized
        );

        // 根据订单方向，从对应的订单簿中移除订单。
        match side {
            // 如果是买单，从买单簿移除。
            Side::Bid => ctx.accounts.bids.load_mut()?.remove_order(node_index)?,
            // 如果是卖单，从卖单簿移除。
            Side::Ask => ctx.accounts.asks.load_mut()?.remove_order(node_index)?,
        }

        // 解锁之前锁定的代币，将其从 `locked` 转移到 `free`。
        match side {
            // 如果是买单。
            Side::Bid => {
                // 计算之前锁定的报价代币数量。
                let quote_amount = (order.price as u128)
                    .checked_mul(order.base_qty as u128)
                    .and_then(|v| v.checked_div(PRICE_SCALE))
                    .ok_or(ErrorCode::MathOverflow)? as u64;
                // ‼️‼️ 还有一个潜在的 Bug：这里没有考虑手续费！ ‼️‼️
                // 下单时锁定了 base_amount + fee，但这里只解锁了 base_amount
                // 这会导致 "MathOverflow" on checked_sub.
                // 我们需要用与下单时完全相同的逻辑。
                let max_taker_fee = (quote_amount as u128
                    * ctx.accounts.market.taker_fee_bps as u128
                    / 10_000) as u64;
                let total_quote_to_unlock = quote_amount
                    .checked_add(max_taker_fee)
                    .ok_or(ErrorCode::MathOverflow)?;

                // 从锁定的报价代币中减去该数量。
                open_orders.quote_token_locked = open_orders
                    .quote_token_locked
                    .checked_sub(total_quote_to_unlock)
                    .ok_or(ErrorCode::MathOverflow)?;
                // 将该数量加到可用的报价代币中。
                open_orders.quote_token_free = open_orders
                    .quote_token_free
                    .checked_add(total_quote_to_unlock)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
            // 如果是卖单。
            Side::Ask => {
                // 从锁定的基础代币中减去订单数量。
                open_orders.base_token_locked = open_orders
                    .base_token_locked
                    .checked_sub(order.base_qty)
                    .ok_or(ErrorCode::MathOverflow)?;
                // 将订单数量加到可用的基础代币中。
                open_orders.base_token_free = open_orders
                    .base_token_free
                    .checked_add(order.base_qty)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        }

        // 从用户的 OpenOrders 账户中移除订单 ID。
        open_orders.remove_order(order_id)?;

        // 发出取消订单事件。
        emit!(OrderCancelledEvent {
            // 市场地址。
            market: ctx.accounts.market.key(),
            // 订单所有者地址。
            owner: open_orders.owner,
            // 被取消的订单 ID。
            order_id
        });

        // 返回成功。
        Ok(())
    }

    // 1. 精确计算 Maker 当初为这笔交易实际锁定的金额（基于他自己的出价 `best_bid.price` 和预估的 Taker 手续费）。
    // 2. 从 Maker 的 `quote_token_locked` 中减去上述锁定的总额。
    // 3. 计算 Maker 因价格优待（以更低价成交）和手续费差（支付更低的 Maker 手e费）而应收到的返还金额 (rebate)。
    // 4. 将此返还金额添加到 Maker 的 `quote_token_free` 余额中。
    // 这确保了所有资金流动都是精确和公平的，符合订单簿撮合的原则。
    pub fn match_orders<'info>(
        // 使用特殊的生命周期注解来处理 remaining_accounts。
        ctx: Context<'_, '_, 'info, 'info, MatchOrders<'info>>,
        // 本次调用最多撮合的次数，防止交易消耗过多的计算单元 (CU)。
        match_limit: u64,
    ) -> Result<()> {
        // --- 1. 初始化和前置检查 ---

        // 获取 market 账户的不可变引用，用于读取市场配置。
        let market = &ctx.accounts.market;
        // 获取买单簿的账户加载器。
        let bids_loader = &ctx.accounts.bids;
        // 获取卖单簿的账户加载器。
        let asks_loader = &ctx.accounts.asks;

        // 加载买单簿（不可变），以获取最优买单价。
        let best_bid_price = bids_loader
            .load()?
            // 获取价格最高的买单。
            .get_best_price_order()
            // 如果有订单，则返回其价格；否则返回 0。
            .map_or(0, |o| o.price);

        // 加载卖单簿（不可变），以获取最优卖单价。
        let best_ask_price = asks_loader
            .load()?
            // 获取价格最低的卖单。
            .get_best_price_order()
            // 如果有订单，则返回其价格；否则返回 u64 的最大值，确保比较有效。
            .map_or(u64::MAX, |o| o.price);

        // 如果最优买价低于最优卖价（即买卖盘口存在价差），则没有可撮合的订单，直接返回。
        if best_bid_price < best_ask_price {
            // 记录日志，说明没有可撮合的订单。
            msg!("No orders to match: spread exists.");
            // 提前成功退出。
            return Ok(());
        }

        // --- 2. 准备 PDA 签名 ---

        // 准备 Market PDA 的签名种子，用于后续代表程序进行代币转账（如收取手续费）。
        let seeds = &[
            // "market" 是 PDA 的种子之一。
            b"market".as_ref(),
            // 基础代币 mint 地址作为种子，确保 PDA 的唯一性。
            market.base_mint.as_ref(),
            // 报价代币 mint 地址作为种子。
            market.quote_mint.as_ref(),
            // PDA 的 bump seed。
            &[market.bump],
        ];
        // 将种子包装成签名者数组，用于 CPI 调用。
        let signer = &[&seeds[..]];

        // --- 3. 循环撮合 ---

        // 创建一个迭代器，用于按顺序读取 `remaining_accounts` 中传入的 Maker 们的 OpenOrders 账户。
        let mut remaining_accounts_iter = ctx.remaining_accounts.iter();

        // 循环撮合，直到达到 `match_limit` 或无法再撮合。
        for i in 0..match_limit {
            // 加载买单簿（可变），因为撮合会修改它。
            let mut bids = bids_loader.load_mut()?;
            // 加载卖单簿（可变）。
            let mut asks = asks_loader.load_mut()?;

            // 在循环内部再次获取最优订单，因为上一轮撮合可能已经改变了订单簿。
            let best_bid_opt = bids.get_best_price_order();
            let best_ask_opt = asks.get_best_price_order();

            // 如果买单簿或卖单簿为空，则无法继续撮合，跳出循环。
            if best_bid_opt.is_none() || best_ask_opt.is_none() {
                msg!("Match loop {} stopped: one side of the book is empty.", i);
                break;
            }

            // 解包订单，此时我们确定它们是存在的。
            let mut best_bid = best_bid_opt.unwrap();
            let mut best_ask = best_ask_opt.unwrap();

            // 再次检查价格，确保依然可以撮合。这是一个安全检查。
            if best_bid.price < best_ask.price {
                msg!("Match loop {} stopped: spread exists after a match.", i);
                break;
            }

            // 验证并禁止自我交易（同一个人不能自己和自己成交）。
            require_keys_neq!(
                best_bid.owner_account,
                best_ask.owner_account,
                ErrorCode::SelfTradeForbidden
            );

            // --- 4. 加载 Maker 账户并计算交易参数 ---

            // 从 `remaining_accounts` 中获取买家和卖家的 OpenOrders 账户信息。
            // 链上程序无法动态加载账户，必须由客户端在交易指令中提前提供。
            let bidder_ooa_info = next_account_info(&mut remaining_accounts_iter)?;
            let asker_ooa_info = next_account_info(&mut remaining_accounts_iter)?;
            // 验证传入的买家账户公钥是否与最优买单的 owner_account 匹配。
            require_keys_eq!(
                best_bid.owner_account,
                bidder_ooa_info.key(),
                ErrorCode::InvalidMakerAccount
            );
            // 验证传入的卖家账户公钥是否与最优卖单的 owner_account 匹配。
            require_keys_eq!(
                best_ask.owner_account,
                asker_ooa_info.key(),
                ErrorCode::InvalidMakerAccount
            );

            // 将账户信息反序列化为 `OpenOrders` 结构体，以便修改。
            let mut bidder_ooa: Account<OpenOrders> = Account::try_from(bidder_ooa_info)?;
            let mut asker_ooa: Account<OpenOrders> = Account::try_from(asker_ooa_info)?;

            // 确定成交价格：遵循价格时间优先原则，先挂出的订单（ID更小）价格优先，这对 Maker 有利。
            let trade_price = if best_bid.order_id < best_ask.order_id {
                // 如果买单是 Maker，以 Taker（卖单）的价格成交，对买家有利。
                best_ask.price
            } else {
                // 如果卖单是 Maker，以 Taker（买单）的价格成交，对卖家有利。
                best_bid.price
            };

            // 确定成交数量：取买卖双方订单数量的较小者。
            let trade_base_qty = std::cmp::min(best_bid.base_qty, best_ask.base_qty);

            // 计算成交的报价代币总额 (价格 * 数量 / 缩放因子)。
            let trade_quote_qty = (trade_price as u128)
                .checked_mul(trade_base_qty as u128)
                .and_then(|v| v.checked_div(PRICE_SCALE))
                .ok_or(ErrorCode::MathOverflow)? as u64;

            // 确定谁是 Maker（订单ID小的）和 Taker。
            let maker_is_bid = best_bid.order_id < best_ask.order_id;

            // 根据成交额计算 Maker 和 Taker 的手续费。
            let (maker_fee, taker_fee) = {
                let quote_as_u128 = trade_quote_qty as u128;
                let maker_fee = (quote_as_u128 * market.maker_fee_bps as u128 / 10_000) as u64;
                let taker_fee = (quote_as_u128 * market.taker_fee_bps as u128 / 10_000) as u64;
                (maker_fee, taker_fee)
            };
            // 计算总手续费，用于后续转账。
            let total_fee = maker_fee
                .checked_add(taker_fee)
                .ok_or(ErrorCode::MathOverflow)?;

            // 根据 Maker 是买方还是卖方，确定 maker 和 taker 的账户可变引用，简化后续代码。
            let (maker_ooa, taker_ooa, maker_side) = if maker_is_bid {
                // 如果 Maker 是买家，返回 (买家账户, 卖家账户, 买方标识)。
                (&mut bidder_ooa, &mut asker_ooa, Side::Bid)
            } else {
                // 如果 Maker 是卖家，返回 (卖家账户, 买家账户, 卖方标识)。
                (&mut asker_ooa, &mut bidder_ooa, Side::Ask)
            };

            // --- 5. 核心：资金结算 ---

            // 根据 Maker 的方向（买或卖）来更新双方的 OpenOrders 账户余额。
            match maker_side {
                // 场景 A: Maker 是卖家 (Asker), Taker 是买家 (Bidder)。
                Side::Ask => {
                    // --- Taker (买家) 更新 ---
                    // Taker 需要支付的总额 = 成交额 + Taker手续费。
                    let total_quote_paid_by_taker = trade_quote_qty
                        .checked_add(taker_fee)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // 从 Taker 锁定的报价代币中扣除支付总额。
                    taker_ooa.quote_token_locked = taker_ooa
                        .quote_token_locked
                        .checked_sub(total_quote_paid_by_taker)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // Taker 获得的基础代币进入可用余额。
                    taker_ooa.base_token_free = taker_ooa
                        .base_token_free
                        .checked_add(trade_base_qty)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // --- Maker (卖家)  ---
                    // Maker 获得的净额 = 成交额 - Maker手续费。
                    let quote_received_by_maker = trade_quote_qty
                        .checked_sub(maker_fee)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // 从 Maker 锁定的基础代币中扣除卖出的数量。
                    maker_ooa.base_token_locked = maker_ooa
                        .base_token_locked
                        .checked_sub(trade_base_qty)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // Maker 获得的报价代币进入可用余额。
                    maker_ooa.quote_token_free = maker_ooa
                        .quote_token_free
                        .checked_add(quote_received_by_maker)
                        .ok_or(ErrorCode::MathOverflow)?;
                }

                // 场景 B: Maker 是买家 (Bidder), Taker 是卖家 (Asker)。
                Side::Bid => {
                    // --- Taker (卖家)  ---
                    // 从 Taker 锁定的基础代币中扣除卖出的数量。
                    taker_ooa.base_token_locked = taker_ooa
                        .base_token_locked
                        .checked_sub(trade_base_qty)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // Taker 获得的净额 = 成交额 - Taker手续费。
                    let quote_for_taker = trade_quote_qty
                        .checked_sub(taker_fee)
                        .ok_or(ErrorCode::MathOverflow)?;
                    // Taker 获得的报价代币进入可用余额。
                    taker_ooa.quote_token_free = taker_ooa
                        .quote_token_free
                        .checked_add(quote_for_taker)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // --- Maker (买家) 更新 ---
                    // 1. Maker 获得基础代币。
                    maker_ooa.base_token_free = maker_ooa
                        .base_token_free
                        .checked_add(trade_base_qty)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // 2. 计算 Maker 当初为这部分成交量 `锁定的` 报价代币金额。
                    //    这是基于他自己的出价 `best_bid.price`，而不是最终成交价。
                    let original_quote_locked = (best_bid.price as u128)
                        .checked_mul(trade_base_qty as u128)
                        .and_then(|v| v.checked_div(PRICE_SCALE))
                        .ok_or(ErrorCode::MathOverflow)?
                        as u64;

                    // 3. 计算他当初锁定时，为这部分金额预估的 Taker 手续费。
                    let original_fee_locked = (original_quote_locked as u128
                        * market.taker_fee_bps as u128
                        / 10_000) as u64;

                    // 4. 计算当初锁定的总额。
                    let total_original_locked = original_quote_locked
                        .checked_add(original_fee_locked)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // 5. 从 Maker 的锁定总额中减去这部分被 "消费" 的锁定金额。
                    maker_ooa.quote_token_locked = maker_ooa
                        .quote_token_locked
                        .checked_sub(total_original_locked)
                        .ok_or(ErrorCode::MathOverflow)?;

                    // 6. 计算应返还给 Maker 的金额 (Rebate)。
                    //    返还金额 = 当初锁定的总额 - 实际花费的成交额 - 他自己应付的 Maker 手续费。
                    let rebate_amount = total_original_locked
                        .checked_sub(trade_quote_qty)
                        .and_then(|v| v.checked_sub(maker_fee))
                        .ok_or(ErrorCode::MathOverflow)?;

                    // 7. 将返还的金额（价格优待 + 节省的手续费）加入 Maker 的可用余额。
                    maker_ooa.quote_token_free = maker_ooa
                        .quote_token_free
                        .checked_add(rebate_amount)
                        .ok_or(ErrorCode::MathOverflow)?;
                }
            }

            // --- 6. 手续费转账 ---

            // 如果本笔交易产生了手续费。
            if total_fee > 0 {
                // 通过 CPI 调用 Token Program，将总手续费从程序的 `quote_vault` 转移到 `fee_vault`。
                transfer_checked(
                    // 创建带 PDA 签名的 CPI 上下文。
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from: ctx.accounts.quote_vault.to_account_info(),
                            mint: ctx.accounts.quote_mint.to_account_info(),
                            to: ctx.accounts.fee_vault.to_account_info(),
                            // 授权方是 Market PDA。
                            authority: market.to_account_info(),
                        },
                        // 传入 PDA 签名。
                        signer,
                    ),
                    // 转账金额为总手续费。
                    total_fee,
                    // 报价代币的小数位数。
                    market.quote_decimals,
                )?;
            }

            // --- 7. 更新订单簿和 OpenOrders 账户 ---

            // 更新订单簿中订单的剩余数量。
            best_bid.base_qty = best_bid
                .base_qty
                .checked_sub(trade_base_qty)
                .ok_or(ErrorCode::MathOverflow)?;
            best_ask.base_qty = best_ask
                .base_qty
                .checked_sub(trade_base_qty)
                .ok_or(ErrorCode::MathOverflow)?;

            // 如果买单完全成交（剩余数量为0）。
            if best_bid.base_qty == 0 {
                // 【修正】先将 head 的值存入一个局部变量。
                // 这样对 `bids.head` 的不可变借用会在这里立即结束。
                let head_index = bids.head;
                // 现在，`remove_order` 可以安全地获取对 `bids` 的可变借用，因为不再有活跃的不可变借用。
                bids.remove_order(head_index)?;
                // 从买家的 OpenOrders 账户的活动订单列表中移除该订单 ID。
                bidder_ooa.remove_order(best_bid.order_id)?;
            } else {
                // 【修正】同样地，先读取 head 的值。
                let head_index = bids.head as usize;
                // 然后再用这个值去访问 nodes 数组并修改它。
                bids.nodes[head_index].order = best_bid;
            }

            // 如果卖单完全成交。
            if best_ask.base_qty == 0 {
                // 【修正】对 `asks` 做同样的处理。
                let head_index = asks.head;
                // `asks.remove_order` 现在可以安全地可变借用 `asks`。
                asks.remove_order(head_index)?;
                // 从卖家的 OpenOrders 账户的活动订单列表中移除该订单 ID。
                asker_ooa.remove_order(best_ask.order_id)?;
            } else {
                // 【修正】同样地，先读取 head 的值。
                let head_index = asks.head as usize;
                // 然后再修改。
                asks.nodes[head_index].order = best_ask;
            }

            // --- 8. 写回账户数据 ---

            // 将修改后的买家 OpenOrders 账户数据写回到链上。
            // `exit` 会处理序列化和数据写入。
            bidder_ooa.exit(&ctx.program_id)?;
            // 将修改后的卖家 OpenOrders 账户数据写回到链上。
            asker_ooa.exit(&ctx.program_id)?;
        }

        // 撮合循环结束，返回成功。
        Ok(())
    }

    // `settle_funds` 指令：用户提取其 OpenOrders 账户中的可用资金。
    pub fn settle_funds(ctx: Context<SettleFunds>) -> Result<()> {
        // 获取 market 账户的引用。
        let market = &ctx.accounts.market;
        // 获取 open_orders 账户的可变引用。
        let open_orders = &mut ctx.accounts.open_orders;

        // 准备 PDA 签名种子。
        let seeds = &[
            b"market".as_ref(),
            market.base_mint.as_ref(),
            market.quote_mint.as_ref(),
            &[market.bump],
        ];
        // 将种子包装成签名者。
        let signer = &[&seeds[..]];

        // 获取可用的基础代币数量。
        let base_amount = open_orders.base_token_free;
        // 如果有可用的基础代币。
        if base_amount > 0 {
            // 将可用余额清零。
            open_orders.base_token_free = 0;
            // 通过 CPI 将基础代币从程序金库转移到用户钱包。
            transfer_checked(
                // 创建带签名的 CPI 上下文。
                CpiContext::new_with_signer(
                    // 传入 Token Program。
                    ctx.accounts.token_program.to_account_info(),
                    // 定义转账账户。
                    TransferChecked {
                        // 源账户（基础代币金库）。
                        from: ctx.accounts.base_vault.to_account_info(),
                        // 代币 mint。
                        mint: ctx.accounts.base_mint.to_account_info(),
                        // 目标账户（用户钱包）。
                        to: ctx.accounts.user_base_token_account.to_account_info(),
                        // 授权方（Market PDA）。
                        authority: market.to_account_info(),
                    },
                    // 传入 PDA 签名。
                    signer,
                ),
                // 转账金额。
                base_amount,
                // 代币小数位数。
                market.base_decimals,
            )?;
        }

        // 获取可用的报价代币数量。
        let quote_amount = open_orders.quote_token_free;
        // 如果有可用的报价代币。
        if quote_amount > 0 {
            // 将可用余额清零。
            open_orders.quote_token_free = 0;
            // 通过 CPI 将报价代币从程序金库转移到用户钱包。
            transfer_checked(
                // 创建带签名的 CPI 上下文。
                CpiContext::new_with_signer(
                    // 传入 Token Program。
                    ctx.accounts.token_program.to_account_info(),
                    // 定义转账账户。
                    TransferChecked {
                        // 源账户（报价代币金库）。
                        from: ctx.accounts.quote_vault.to_account_info(),
                        // 代币 mint。
                        mint: ctx.accounts.quote_mint.to_account_info(),
                        // 目标账户（用户钱包）。
                        to: ctx.accounts.user_quote_token_account.to_account_info(),
                        // 授权方（Market PDA）。
                        authority: market.to_account_info(),
                    },
                    // 传入 PDA 签名。
                    signer,
                ),
                // 转账金额。
                quote_amount,
                // 代币小数位数。
                market.quote_decimals,
            )?;
        }

        // 返回成功。
        Ok(())
    }

    // `close_open_orders` 指令：关闭用户的 OpenOrders 账户并回收租金。
    pub fn close_open_orders(ctx: Context<CloseOpenOrders>) -> Result<()> {
        // 获取 open_orders 账户的引用。
        let open_orders = &ctx.accounts.open_orders;
        // 验证账户中没有任何可用的基础代币。
        require!(
            open_orders.base_token_free == 0,
            ErrorCode::OpenOrdersAccountNotEmpty
        );
        // 验证账户中没有任何可用的报价代币。
        require!(
            open_orders.quote_token_free == 0,
            ErrorCode::OpenOrdersAccountNotEmpty
        );
        // 验证账户中没有任何锁定的基础代币。
        require!(
            open_orders.base_token_locked == 0,
            ErrorCode::OpenOrdersAccountNotEmpty
        );
        // 验证账户中没有任何锁定的报价代币。
        require!(
            open_orders.quote_token_locked == 0,
            ErrorCode::OpenOrdersAccountNotEmpty
        );
        // Anchor 的 `close` 约束会自动处理账户关闭和租金返还的逻辑。
        // 这里不需要写额外的代码，只需验证前提条件即可。
        // 返回成功。
        Ok(())
    }

    // `set_pause` 指令：管理员暂停或恢复市场交易。
    pub fn set_pause(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        // 设置 market 账户的 paused 字段。
        ctx.accounts.market.paused = paused;
        // 发出市场暂停/恢复事件。
        emit!(PauseEvent {
            // 市场地址。
            market: ctx.accounts.market.key(),
            // 新的暂停状态。
            paused
        });
        // 返回成功。
        Ok(())
    }

    // `set_fees` 指令：管理员设置新的手续费率。
    pub fn set_fees(ctx: Context<AdminOnly>, maker_fee_bps: u16, taker_fee_bps: u16) -> Result<()> {
        // 验证手续费率在有效范围内。
        require!(
            maker_fee_bps <= 10_000 && taker_fee_bps <= 10_000,
            ErrorCode::InvalidFee
        );
        // 获取 market 账户的可变引用。
        let market = &mut ctx.accounts.market;
        // 更新 maker 手续费率。
        market.maker_fee_bps = maker_fee_bps;
        // 更新 taker 手续费率。
        market.taker_fee_bps = taker_fee_bps;
        // 发出手续费更新事件。
        emit!(FeesUpdatedEvent {
            // 市场地址。
            market: market.key(),
            // 新的 maker 手续费率。
            maker_fee_bps,
            // 新的 taker 手续费率。
            taker_fee_bps
        });
        // 返回成功。
        Ok(())
    }
}

// --- 账户上下文 (正确地定义在顶层) ---

// `InitializeMarket` 指令的账户上下文。
#[derive(Accounts)]
// 定义 InitializeMarket 结构体。
pub struct InitializeMarket<'info> {
    // `market` 账户: 将被创建和初始化的 PDA 账户。
    #[account(
        // `init` 表示这是一个新账户，需要被创建。
        init,
        // `payer` 指定由谁支付创建账户所需的租金。
        payer = authority,
        // `space` 分配账户所需的空间大小。8字节是Anchor的discriminator。
        space = 8 + Market::INIT_SPACE,
        // `seeds` 定义用于派生 PDA 地址的种子。
        seeds = [b"market", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        // `bump` 告诉 Anchor 存储找到的 bump seed。
        bump
    )]
    // 账户类型是 Market，使用 Box 避免堆栈溢出。
    pub market: Box<Account<'info, Market>>,
    // 基础代币的 Mint 账户。
    pub base_mint: InterfaceAccount<'info, Mint>,
    // 报价代币的 Mint 账户。
    pub quote_mint: InterfaceAccount<'info, Mint>,
    // `base_vault` 账户：将被创建的代币账户，用于存放基础代币。
    #[account(
        init,
        payer = authority,
        // `token::mint` 指定这个代币账户的 mint。
        token::mint = base_mint,
        // `token::authority` 指定这个代币账户的管理者。
        token::authority = market,
        // PDA 种子。
        seeds = [b"base_vault", market.key().as_ref()],
        bump,
    )]
    // 账户类型是 TokenAccount，使用 Box。
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    // `quote_vault` 账户：将被创建的代币账户，用于存放报价代币。
    #[account(
        init,
        payer = authority,
        token::mint = quote_mint,
        token::authority = market,
        seeds = [b"quote_vault", market.key().as_ref()],
        bump
    )]
    // 账户类型是 TokenAccount，使用 Box。
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    // `fee_vault` 账户：将被创建的代币账户，用于存放手续费。
    #[account(
        init,
        payer = authority,
        token::mint = quote_mint,
        token::authority = market,
        seeds = [b"fee_vault", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    // `bids` 账户：买单簿，将被创建和初始化。
    #[account(
        init,
        payer = authority,
        // 空间大小使用常量定义。
        space = OrderBook::LEN,
        seeds = [b"bids", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    // AccountLoader 用于加载 zero_copy 账户。
    pub bids: AccountLoader<'info, OrderBook>,
    // `asks` 账户：卖单簿，将被创建和初始化。
    #[account(
        init,
        payer = authority,
        space = OrderBook::LEN,
        seeds = [b"asks", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub asks: AccountLoader<'info, OrderBook>,
    // `authority` 账户：市场的创建者和管理者，必须签名交易。
    // `mut` 表示该账户的数据是可变的（因为租金会从中扣除）。
    #[account(mut)]
    // `Signer` 类型约束确保该账户已签署交易。
    pub authority: Signer<'info>,
    // 系统程序，用于创建账户。
    pub system_program: Program<'info, System>,
    // Token Program，用于处理代币相关操作。
    pub token_program: Interface<'info, TokenInterface>,
    // Rent Sysvar，用于检查账户是否免租。
    pub rent: Sysvar<'info, Rent>,
}

// `NewLimitOrder` 指令的账户上下文。
#[derive(Accounts)]
pub struct NewLimitOrder<'info> {
    // `market` 账户：必须是可变的，因为它要更新订单序列号。`has_one` 约束验证金库账户的归属。
    #[account(mut, has_one = base_vault, has_one = quote_vault)]
    pub market: Account<'info, Market>,
    // `bids` 买单簿账户。
    #[account(mut, seeds = [b"bids", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub bids: AccountLoader<'info, OrderBook>,
    // `asks` 卖单簿账户。
    #[account(mut, seeds = [b"asks", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub asks: AccountLoader<'info, OrderBook>,

    // `open_orders` 账户：用户的订单状态账户。如果不存在，则自动创建。
    #[account(
        // 如果账户不存在，则使用 payer 和 space 等参数创建它。
        init_if_needed,
        payer = owner,
        space = 8+ OpenOrders::INIT_SPACE,
        seeds = [b"open_orders", market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub open_orders: Account<'info, OpenOrders>,

    // 程序的基础代币金库。
    #[account(mut, address = market.base_vault, seeds = [b"base_vault", market.key().as_ref()],bump)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,
    // 程序的报价代币金库。
    #[account(mut, address = market.quote_vault, seeds = [b"quote_vault", market.key().as_ref()],bump)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,
    // 用户的基础代币账户。
    #[account(mut)]
    pub user_base_token_account: InterfaceAccount<'info, TokenAccount>,
    // 用户的报价代币账户。
    #[account(mut)]
    pub user_quote_token_account: InterfaceAccount<'info, TokenAccount>,
    // `owner` 账户：下单的用户，必须签名交易。
    #[account(mut)]
    pub owner: Signer<'info>,
    // 基础代币 mint。
    pub base_mint: InterfaceAccount<'info, Mint>,
    // 报价代币 mint。
    pub quote_mint: InterfaceAccount<'info, Mint>,
    // Token Program。
    pub token_program: Interface<'info, TokenInterface>,
    // System Program。
    pub system_program: Program<'info, System>,
    // Rent Sysvar。
    pub rent: Sysvar<'info, Rent>,
}

// `CancelLimitOrder` 指令的账户上下文。
#[derive(Accounts)]
pub struct CancelLimitOrder<'info> {
    // 市场账户，可变。
    #[account(mut)]
    pub market: Account<'info, Market>,
    // 买单簿，可变。
    #[account(mut, seeds = [b"bids", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub bids: AccountLoader<'info, OrderBook>,
    // 卖单簿，可变。
    #[account(mut, seeds = [b"asks", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub asks: AccountLoader<'info, OrderBook>,
    // `open_orders` 账户：`has_one = owner` 验证该账户的 owner 字段等于传入的 `owner` 账户的公钥。
    #[account(
        mut,
        seeds = [b"open_orders", market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        has_one = owner,
    )]
    pub open_orders: Account<'info, OpenOrders>,
    // `owner` 账户：订单所有者，必须签名。
    #[account(mut)]
    pub owner: Signer<'info>,
}

// `MatchOrders` 指令的账户上下文。
#[derive(Accounts)]
pub struct MatchOrders<'info> {
    // 市场账户，可变。
    #[account(mut, has_one = base_vault, has_one = quote_vault)]
    pub market: Account<'info, Market>,
    // 买单簿，可变。
    #[account(mut, seeds = [b"bids", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub bids: AccountLoader<'info, OrderBook>,
    // 卖单簿，可变。
    #[account(mut, seeds = [b"asks", market.base_mint.as_ref(), market.quote_mint.as_ref()], bump)]
    pub asks: AccountLoader<'info, OrderBook>,
    // 基础代币金库。`address` 约束验证传入的账户地址是否正确。
    #[account(mut, address = market.base_vault)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,
    // 报价代币金库。
    #[account(mut, address = market.quote_vault)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,
    // 手续费金库。
    #[account(mut, address = market.fee_vault)]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    // 基础代币 mint。
    pub base_mint: InterfaceAccount<'info, Mint>,
    // 报价代币 mint。
    pub quote_mint: InterfaceAccount<'info, Mint>,
    // Token Program。
    pub token_program: Interface<'info, TokenInterface>,
}

// `SettleFunds` 指令的账户上下文。
#[derive(Accounts)]
pub struct SettleFunds<'info> {
    // 市场账户。
    #[account(has_one = base_vault, has_one = quote_vault)]
    pub market: Account<'info, Market>,
    // 用户 OpenOrders 账户。
    #[account(
        mut,
        seeds = [b"open_orders", market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        has_one = owner,
    )]
    pub open_orders: Account<'info, OpenOrders>,
    // 用户账户，必须签名。
    #[account(mut)]
    pub owner: Signer<'info>,
    // 基础代币金库。
    #[account(mut, address = market.base_vault)]
    pub base_vault: InterfaceAccount<'info, TokenAccount>,
    // 报价代币金库。
    #[account(mut, address = market.quote_vault)]
    pub quote_vault: InterfaceAccount<'info, TokenAccount>,
    // 用户的基础代币账户。
    #[account(mut)]
    pub user_base_token_account: InterfaceAccount<'info, TokenAccount>,
    // 用户的报价代币账户。
    #[account(mut)]
    pub user_quote_token_account: InterfaceAccount<'info, TokenAccount>,
    // 基础代币 mint。
    pub base_mint: InterfaceAccount<'info, Mint>,
    // 报价代币 mint。
    pub quote_mint: InterfaceAccount<'info, Mint>,
    // Token Program。
    pub token_program: Interface<'info, TokenInterface>,
}

// `CloseOpenOrders` 指令的账户上下文。
#[derive(Accounts)]
pub struct CloseOpenOrders<'info> {
    // `open_orders` 账户：将被关闭的账户。`close = sol_destination` 指定账户关闭后，其中的租金返还给 sol_destination。
    #[account(
        mut,
        seeds = [b"open_orders", market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        has_one = owner,
        close = sol_destination
    )]
    pub open_orders: Account<'info, OpenOrders>,
    // 用户账户，必须签名。
    #[account(mut)]
    pub owner: Signer<'info>,
    // 租金接收账户。
    #[account(mut)]
    pub sol_destination: SystemAccount<'info>,
    // 市场账户。
    pub market: Account<'info, Market>,
}

// 管理员指令的通用账户上下文。
#[derive(Accounts)]
pub struct AdminOnly<'info> {
    // `has_one = authority` 验证签名者 `authority` 是 `market` 账户中记录的管理员。
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    // 管理员账户，必须签名。
    pub authority: Signer<'info>,
}

// --- 枚举、事件、错误 ---

// 订单方向枚举。
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    // 买单
    Bid,
    // 卖单
    Ask,
}
// 订单类型枚举（在此示例中未使用，但通常会包含）。
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderType {
    // 限价单
    Limit,
    // 只做 Maker 的限价单
    PostOnly,
}

// 市场初始化事件。
#[event]
pub struct MarketInitializedEvent {
    // 市场地址。
    pub market: Pubkey,
    // 基础代币 mint。
    pub base_mint: Pubkey,
    // 报价代币 mint。
    pub quote_mint: Pubkey,
    // maker 手续费率。
    pub maker_fee_bps: u16,
    // taker 手续费率。
    pub taker_fee_bps: u16,
    // 价格精度。
    pub tick_size: u64,
    // 数量精度。
    pub base_lot_size: u64,
}

// 交易成交事件。
#[event]
pub struct TradeEvent {
    // 市场地址。
    pub market: Pubkey,
    // taker 地址。
    pub taker: Pubkey,
    // maker (买方) 地址。
    pub maker_bid: Pubkey,
    // maker (卖方) 地址。
    pub maker_ask: Pubkey,
    // 成交价格。
    pub price: u64,
    // 成交数量。
    pub quantity: u64,
}

// 下单事件。
#[event]
pub struct OrderPlacedEvent {
    // 市场地址。
    pub market: Pubkey,
    // 订单所有者地址。
    pub owner: Pubkey,
    // 订单 ID。
    pub order_id: u64,
    // 价格。
    pub price: u64,
    // 数量。
    pub quantity: u64,
    // 订单方向。
    pub side: Side,
}

// 取消订单事件。
#[event]
pub struct OrderCancelledEvent {
    // 市场地址。
    pub market: Pubkey,
    // 订单所有者地址。
    pub owner: Pubkey,
    // 被取消的订单 ID。
    pub order_id: u64,
}

// 手续费收取事件。
#[event]
pub struct FeeCollectedEvent {
    // 市场地址。
    pub market: Pubkey,
    // 手续费金额。
    pub amount: u64,
}

// 市场暂停/恢复事件。
#[event]
pub struct PauseEvent {
    // 市场地址。
    pub market: Pubkey,
    // 新的暂停状态。
    pub paused: bool,
}

// 手续费更新事件。
#[event]
pub struct FeesUpdatedEvent {
    // 市场地址。
    pub market: Pubkey,
    // 新的 maker 手续费率。
    pub maker_fee_bps: u16,
    // 新的 taker 手续费率。
    pub taker_fee_bps: u16,
}

// 自定义错误码。
#[error_code]
pub enum ErrorCode {
    // 订单簿已满。
    #[msg("The order book is full.")]
    OrderBookFull,
    // 订单未找到。
    #[msg("Order not found.")]
    OrderNotFound,
    // 在节点数组中未找到节点。
    #[msg("Node not found in slab.")]
    NodeNotFound,
    // 未授权的操作。
    #[msg("Unauthorized action.")]
    Unauthorized,
    // 无效的订单输入。
    #[msg("Order input is invalid.")]
    InvalidOrderInput,
    // 订单会穿过价差，违反了 PostOnly 规则。
    #[msg("Order would cross the spread, violating PostOnly.")]
    OrderWouldCross,
    // 禁止自我交易。
    #[msg("Self-trading is forbidden.")]
    SelfTradeForbidden,
    // 算术运算溢出。
    #[msg("An arithmetic operation overflowed.")]
    MathOverflow,
    // 无效的手续费率值。
    #[msg("Fee bps value is invalid.")]
    InvalidFee,
    // 订单簿为空。
    #[msg("Order book is empty.")]
    OrderBookEmpty,
    // 提供了无效的 maker 账户。
    #[msg("Invalid maker account provided.")]
    InvalidMakerAccount,
    // 市场已暂停。
    #[msg("Market is paused.")]
    Paused,
    // 无效的价格精度。
    #[msg("Invalid tick size.")]
    InvalidTickSize,
    // 无效的基础代币下单单位。
    #[msg("Invalid base lot size.")]
    InvalidLotSize,
    // 低于最小基础代币下单量。
    #[msg("Below minimal base quantity.")]
    BelowMinBaseQty,
    // 低于最小名义价值。
    #[msg("Below minimal notional")]
    BelowMinNotional,
    // 无效的 mint 账户。
    #[msg("Invalid mint account.")]
    InvalidMint,
    // 无效的金库账户。
    #[msg("Invalid vault account.")]
    InvalidVault,
    // 无效的市场配置参数。
    #[msg("Invalid market config params.")]
    InvalidMarketParams,
    // 用户的 OpenOrders 账户已满。
    #[msg("This user's OpenOrders account is full.")]
    OpenOrdersFull,
    // 在用户的 OpenOrders 账户中未找到订单ID。
    #[msg("Order ID not found in the user's OpenOrders account.")]
    OrderNotFoundInOpenOrders,
    // 无法关闭仍持有资金或有未结订单的 OpenOrders 账户。
    #[msg("Cannot close an OpenOrders account that still holds funds or has open orders.")]
    OpenOrdersAccountNotEmpty,
}
