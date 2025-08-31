import { AnchorProvider, BN, setProvider, Wallet, Program, Idl } from '@coral-xyz/anchor' // 导入 Anchor 核心类和工具
import { Connection, Keypair, PublicKey } from '@solana/web3.js' // 导入 Solana Web3.js 核心类
import fs from 'fs' // 导入 Node.js 文件系统模块
import idl from '/Users/chenwei/git_projects/solana_projects/push_git/orderbook-dex/anchor/target/idl/order_book_dex.json' // 导入 OrderBookDex IDL JSON 文件
import { OrderBookDex } from '/Users/chenwei/git_projects/solana_projects/push_git/orderbook-dex/anchor/target/types/order_book_dex' // 导入 OrderBookDex 类型定义
import { AnchorError } from '@coral-xyz/anchor' // 导入 AnchorError 用于解析程序错误

// --- 配置 ---
const RPC_URL = 'http://127.0.0.1:8899' // 定义 Solana RPC 节点 URL（本地节点）
const CRANK_OPERATOR_KEYPAIR_PATH = '/Users/chenwei/.config/solana/id.json' // 定义 Crank 运营者密钥对文件路径
const PROGRAM_ID = new PublicKey('6Kw1m5tG9E6Hh9TSzuofdCbjLLtjdRuQGFhiFDuZaJuL') // 定义 OrderBookDex 程序 ID
const MARKET_TO_CRANK = new PublicKey('AVBzEgKgLggg2XtN9Az1DKz3xo5maarYBP1Rpr85gZK8') // 定义要撮合的市场公钥
const CRANK_INTERVAL_MS = 3000 // 定义撮合间隔时间（3秒）
const MATCH_LIMIT = new BN(5) // 定义每次撮合的最大订单数
const SENTINEL_U32 = 4294967295 // 定义链表末尾哨兵值（u32 最大值）

// --- 设置环境 ---
const connection = new Connection(RPC_URL, 'confirmed') // 创建 Solana 网络连接，确认级别为 'confirmed'
const secretKey = JSON.parse(fs.readFileSync(CRANK_OPERATOR_KEYPAIR_PATH, 'utf-8')) // 从文件读取 Crank 运营者密钥
const crankKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey)) // 从密钥创建 Keypair
const crankWallet = new Wallet(crankKeypair) // 创建 Anchor 钱包实例
const provider = new AnchorProvider(connection, crankWallet, AnchorProvider.defaultOptions()) // 创建 Anchor 提供者
setProvider(provider) // 设置全局 Anchor 提供者

// --- 创建 Program 实例 ---
const program = new Program<OrderBookDex>(idl as Idl as OrderBookDex, provider) // 使用 IDL 和提供者创建程序实例

// --- 辅助函数：从日志解析错误代码 ---
function parseErrorFromLogs(
  logs: string[] | undefined,
  idlErrors: { code: number; name: string; msg: string }[],
): { code: number; name: string; msg: string } | null {
  if (!logs) return null // 如果没有日志，返回 null
  const errorLog = logs.find((log) => log.includes('Program log: Error:')) // 查找包含错误的日志
  if (!errorLog) return null // 如果没有错误日志，返回 null
  const match = errorLog.match(/Error: (\w+)/) // 提取错误名称
  if (!match) return null // 如果无法提取错误名称，返回 null
  const errorName = match[1] // 获取错误名称
  const idlError = idlErrors.find((e) => e.name === errorName) // 在 IDL 中查找匹配的错误
  return idlError || null // 返回错误信息或 null
}

async function crankMarket() {
  // 定义异步函数以执行市场订单撮合
  console.log(`[${new Date().toISOString()}] Checking market ${MARKET_TO_CRANK.toBase58()}...`) // 打印当前时间和市场信息

  try {
    const market = await program.account.market.fetch(MARKET_TO_CRANK) // 获取市场账户数据
    const bids = await program.account.orderBook.fetch(market.bids) // 获取买单账户数据
    const asks = await program.account.orderBook.fetch(market.asks) // 获取卖单账户数据

    const bestBid = getBestOrder(bids) // 获取最佳买单
    const bestAsk = getBestOrder(asks) // 获取最佳卖单

    if (!bestBid || !bestAsk) {
      // 检查买单或卖单是否为空
      console.log('  -> One of the order books is empty. Nothing to match.') // 打印无订单可撮合信息
      return
    }

    if (bestBid.price.lt(bestAsk.price)) {
      // 检查买单价格是否低于卖单价格
      console.log(
        `  -> No crossed spread. Best Bid: ${bestBid.price.toNumber()}, Best Ask: ${bestAsk.price.toNumber()}.`,
      ) // 打印无交叉价差信息
      return
    }

    if (bestBid.ownerAccount.equals(bestAsk.ownerAccount)) {
      // 检查是否为自我交易
      console.log(`  -> Self-trade detected between the best bid and ask. Skipping match.`) // 打印自我交易信息
      return
    }

    console.log(
      `🚀 Found crossed spread! Best Bid: ${bestBid.price.toNumber()}, Best Ask: ${bestAsk.price.toNumber()}. Attempting to match...`,
    ) // 打印发现交叉价差，准备撮合

    const remainingAccounts = [
      // 创建额外账户列表
      { pubkey: bestBid.ownerAccount, isSigner: false, isWritable: true }, // 买单拥有者账户
      { pubkey: bestAsk.ownerAccount, isSigner: false, isWritable: true }, // 卖单拥有者账户
    ].filter((item, index, self) => index === self.findIndex((t) => t.pubkey.equals(item.pubkey))) // 去重账户

    const quoteMintInfo = await connection.getAccountInfo(market.quoteMint) // 获取报价代币信息
    if (!quoteMintInfo) {
      // 检查报价代币信息是否存在
      throw new Error('Could not fetch quote mint info to determine token program.') // 抛出错误
    }

    const signature = await program.methods // 调用撮合订单方法
      .matchOrders(MATCH_LIMIT) // 设置撮合限制
      .accounts({
        // 指定账户
        market: MARKET_TO_CRANK, // 市场账户
        bids: market.bids, // 买单账户
        asks: market.asks, // 卖单账户
        baseVault: market.baseVault, // 基础代币金库
        quoteVault: market.quoteVault, // 报价代币金库
        feeVault: market.feeVault, // 费用金库
        baseMint: market.baseMint, // 基础代币 Mint
        quoteMint: market.quoteMint, // 报价代币 Mint
        tokenProgram: quoteMintInfo.owner, // 代币程序
      })
      .remainingAccounts(remainingAccounts) // 添加额外账户
      .rpc({ skipPreflight: true }) // 执行交易，跳过预检

    console.log(`✅ Match transaction sent! Signature: ${signature}`) // 打印交易签名
    const result = await connection.confirmTransaction(signature, 'confirmed') // 确认交易

    if (result.value.err) {
      // 检查交易是否失败
      console.error('  -> Transaction failed to confirm:', result.value.err) // 打印交易失败信息
    } else {
      console.log(`  -> Transaction confirmed.`) // 打印交易确认信息
    }
  } catch (error: any) {
    // 捕获任意错误
    if (error instanceof AnchorError) {
      // 检查是否为 AnchorError
      const idlErrors = (program.idl.errors || []) as { code: number; name: string; msg: string }[] // 获取 IDL 中的错误定义
      const parsedError = parseErrorFromLogs(error.logs, idlErrors) // 解析错误日志
      if (parsedError) {
        // 如果解析出错误信息
        console.error(
          `❌ Crank failed with program error: [${parsedError.code}] ${parsedError.name} - ${parsedError.msg}`,
        ) // 打印错误代码、名称和消息
      } else {
        // 如果无法解析
        console.error(`❌ Crank failed with Anchor error: ${error.message}`) // 打印 Anchor 错误消息
        if (error.logs) {
          // 检查错误是否包含日志
          console.error('  Error logs:', error.logs.join('\n')) // 打印错误日志
        }
      }
      console.error(error) // 打印详细错误信息
    } else {
      console.error('❌ Crank failed with unknown error:', error) // 打印未知错误
      if (error.logs) {
        // 检查未知错误是否包含日志
        console.error('  Error logs:', error.logs.join('\n')) // 打印错误日志
      }
    }
  }
}

function getBestOrder(orderBook: any) {
  // 获取最佳订单的函数
  if (!orderBook || orderBook.head === SENTINEL_U32) {
    // 检查订单簿是否为空或到达末尾
    return null // 返回 null
  }
  const bestNode = orderBook.nodes[orderBook.head] // 获取头部节点
  return bestNode.tag.orderNode ? bestNode.order : null // 返回订单数据或 null
}

function runCrank() {
  // 执行 Crank 主函数
  if (!fs.existsSync(CRANK_OPERATOR_KEYPAIR_PATH)) {
    // 检查密钥对文件是否存在
    console.error(`Error: Crank operator keypair file not found at '${CRANK_OPERATOR_KEYPAIR_PATH}'`) // 打印文件缺失错误
    console.error('Please run `solana-keygen new --outfile ./crank-keypair.json` to create one.') // 提供创建密钥对建议
    return
  }

  if (MARKET_TO_CRANK.toBase58() === 'MarketPublicKeyHere') {
    // 检查市场公钥是否为默认值
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!') // 打印警告
    console.error('!!! PLEASE EDIT `crank.ts` AND SET THE `MARKET_TO_CRANK` !!!') // 提示编辑市场公钥
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!') // 打印警告
    return
  }

  console.log('🔥 Crank bot started!') // 打印 Crank 启动信息
  console.log(`   Operator: ${crankWallet.publicKey.toBase58()}`) // 打印运营者公钥
  console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`) // 打印程序 ID
  console.log(`   Cranking Market: ${MARKET_TO_CRANK.toBase58()}`) // 打印撮合市场公钥

  setInterval(crankMarket, CRANK_INTERVAL_MS) // 每隔指定时间调用撮合函数
}

runCrank() // 启动 Crank 程序