'use client' // 指定此文件为客户端组件

import { getOrderBookDexProgram, getOrderBookDexProgramId } from '@project/anchor' // 导入获取订单簿程序和程序ID的函数
import { useConnection, useWallet } from '@solana/wallet-adapter-react' // 导入Solana连接和钱包钩子
import { Cluster, PublicKey, SystemProgram, Transaction } from '@solana/web3.js' // 导入Solana Web3.js核心类
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query' // 导入React Query的钩子
import { useMemo } from 'react' // 导入React的useMemo钩子
import { useCluster } from '../cluster/cluster-data-access' // 导入集群数据访问钩子
import { useAnchorProvider } from '../solana/solana-provider' // 导入Anchor提供者钩子
import { useTransactionToast } from '../use-transaction-toast' // 导入交易提示钩子
import { toast } from 'sonner' // 导入提示通知库
import { BN } from '@coral-xyz/anchor' // 导入Anchor的大数类
import {
  // 导入SPL Token相关函数
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token'
import { AnchorProvider } from '@coral-xyz/anchor' // 导入Anchor提供者类

// 辅助函数: 确保ATA账户存在
async function ensureAtaExists( // 定义确保关联代币账户存在的异步函数
  transaction: Transaction, // 交易对象
  provider: AnchorProvider, // Anchor提供者
  mint: PublicKey, // 代币铸造地址
  owner: PublicKey, // 账户所有者地址
  tokenProgramId: PublicKey, // 代币程序ID
): Promise<PublicKey> {
  // 返回关联代币账户地址
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgramId) // 获取关联代币账户地址
  const ataInfo = await provider.connection.getAccountInfo(ata) // 检查账户信息
  if (!ataInfo) {
    // 如果账户不存在
    transaction.add(
      // 添加创建关联代币账户的指令
      createAssociatedTokenAccountInstruction(provider.wallet.publicKey, ata, owner, mint, tokenProgramId),
    )
  }
  return ata // 返回关联代币账户地址
}

// 核心程序交互钩子
export function useOrderBookProgram() {
  // 定义订单簿程序钩子
  const { connection } = useConnection() // 获取Solana连接
  const { cluster } = useCluster() // 获取当前集群信息
  const transactionToast = useTransactionToast() // 获取交易提示函数
  const provider = useAnchorProvider() // 获取Anchor提供者
  const programId = useMemo(() => getOrderBookDexProgramId(cluster.network as Cluster), [cluster]) // 缓存程序ID
  const program = useMemo(() => getOrderBookDexProgram(provider, programId), [provider, programId]) // 缓存程序实例

  const markets = useQuery({
    // 查询所有市场数据
    queryKey: ['order-book', 'all-markets', { cluster }], // 查询键
    queryFn: () => program.account.market.all(), // 查询函数
  })

  const getProgramAccount = useQuery({
    // 查询程序账户信息
    queryKey: ['get-program-account', { cluster }], // 查询键
    queryFn: () => connection.getParsedAccountInfo(programId), // 查询函数
  })

  const initializeMarket = useMutation({
    // 初始化市场
    mutationKey: ['order-book', 'initializeMarket', { cluster }], // 变异键
    mutationFn: async ({ baseMint, quoteMint }: { baseMint: PublicKey; quoteMint: PublicKey }) => {
      // 变异函数
      const [market] = PublicKey.findProgramAddressSync(
        // 派生市场账户地址
        [Buffer.from('market'), baseMint.toBuffer(), quoteMint.toBuffer()],
        program.programId,
      )
      const [bids] = PublicKey.findProgramAddressSync(
        // 派生买单簿地址
        [Buffer.from('bids'), baseMint.toBuffer(), quoteMint.toBuffer()],
        program.programId,
      )
      const [asks] = PublicKey.findProgramAddressSync(
        // 派生卖单簿地址
        [Buffer.from('asks'), baseMint.toBuffer(), quoteMint.toBuffer()],
        program.programId,
      )
      const [baseVault] = PublicKey.findProgramAddressSync(
        // 派生基础代币金库地址
        [Buffer.from('base_vault'), market.toBuffer()],
        program.programId,
      )
      const [quoteVault] = PublicKey.findProgramAddressSync(
        // 派生报价代币金库地址
        [Buffer.from('quote_vault'), market.toBuffer()],
        program.programId,
      )
      const [feeVault] = PublicKey.findProgramAddressSync(
        // 派生费用金库地址
        [Buffer.from('fee_vault'), baseMint.toBuffer(), quoteMint.toBuffer()],
        program.programId,
      )

      const baseMintInfo = await connection.getAccountInfo(baseMint) // 获取基础代币信息
      const tokenProgram = baseMintInfo?.owner ?? TOKEN_2022_PROGRAM_ID // 确定代币程序ID

      return program.methods // 调用初始化市场方法
        .initializeMarket(10, 20, new BN(100), new BN(1_000_000), null, null)
        .accounts({
          market,
          baseMint,
          quoteMint,
          baseVault,
          quoteVault,
          feeVault,
          bids,
          asks,
          authority: provider.wallet.publicKey,
          tokenProgram,
          systemProgram: SystemProgram.programId,
        })
        .rpc() // 执行远程调用
    },
    onSuccess: async (signature) => {
      // 成功回调
      transactionToast(signature) // 显示交易提示
      await markets.refetch() // 刷新市场数据
    },
    onError: (err) => {
      // 错误回调
      toast.error(`Failed to initialize market: ${err.message}`) // 显示错误提示
    },
  })

  return {
    // 返回钩子对象
    program,
    programId,
    markets,
    getProgramAccount,
    initializeMarket,
  }
}

// 特定市场数据和操作的钩子
export function useMarket({ market: marketKey }: { market: PublicKey }) {
  // 定义市场特定钩子
  const { program } = useOrderBookProgram() // 获取订单簿程序
  const { publicKey: owner } = useWallet() // 获取用户公钥
  const transactionToast = useTransactionToast() // 获取交易提示函数
  const provider = useAnchorProvider() // 获取Anchor提供者
  const queryClient = useQueryClient() // 获取React Query客户端

  const marketQuery = useQuery({
    // 查询市场数据
    queryKey: ['order-book', 'market', { marketKey }], // 查询键
    queryFn: () => program.account.market.fetch(marketKey), // 查询函数
  })
  const market = marketQuery.data // 获取市场数据

  const bidsQuery = useQuery({
    // 查询买单簿数据
    queryKey: ['order-book', 'bids', { marketKey }], // 查询键
    queryFn: () => program.account.orderBook.fetch(market?.bids as PublicKey), // 查询函数
    enabled: !!market, // 仅在市场数据存在时启用
  })

  const asksQuery = useQuery({
    // 查询卖单簿数据
    queryKey: ['order-book', 'asks', { marketKey }], // 查询键
    queryFn: () => program.account.orderBook.fetch(market?.asks as PublicKey), // 查询函数
    enabled: !!market, // 仅在市场数据存在时启用
  })

  const openOrdersAddress = useMemo(() => {
    // 缓存开放订单地址
    if (!owner) return // 如果用户不存在，返回undefined
    const [address] = PublicKey.findProgramAddressSync(
      // 派生开放订单地址
      [Buffer.from('open_orders'), marketKey.toBuffer(), owner.toBuffer()],
      program.programId,
    )
    return address // 返回地址
  }, [marketKey, owner, program.programId])

  const openOrdersQuery = useQuery({
    // 查询开放订单数据
    queryKey: ['order-book', 'openOrders', { marketKey, owner }], // 查询键
    queryFn: () => program.account.openOrders.fetch(openOrdersAddress as PublicKey), // 查询函数
    enabled: !!owner && !!openOrdersAddress, // 仅在用户和地址存在时启用
    retry: false, // 不重试
  })

  const handleSuccess = async (tx: string) => {
    // 处理交易成功
    transactionToast(tx) // 显示交易提示
    await Promise.all([marketQuery.refetch(), bidsQuery.refetch(), asksQuery.refetch(), openOrdersQuery.refetch()]) // 刷新所有相关查询
    toast.success('Transaction successful. Market data refreshed.') // 显示成功提示
  }

  const newLimitOrderMutation = useMutation({
    // 创建限价订单
    mutationKey: ['order-book', 'newLimitOrder', { marketKey, owner }], // 变异键
    mutationFn: async ({ side, price, quantity }: { side: 'bid' | 'ask'; price: BN; quantity: BN }) => {
      // 变异函数
      if (!market || !owner || !openOrdersAddress || !provider) throw new Error('Market, user or provider not ready') // 检查必要条件
      const transaction = new Transaction() // 创建新交易
      const mintsInfo = await provider.connection.getMultipleAccountsInfo([market.baseMint, market.quoteMint]) // 获取代币信息
      const baseMintInfo = mintsInfo[0] // 基础代币信息
      const quoteMintInfo = mintsInfo[1] // 报价代币信息
      if (!baseMintInfo || !quoteMintInfo) throw new Error('Could not fetch mint info') // 检查代币信息
      const baseTokenProgramId = baseMintInfo.owner // 基础代币程序ID
      const quoteTokenProgramId = quoteMintInfo.owner // 报价代币程序ID
      const userBaseTokenAccount = await ensureAtaExists(
        // 确保基础代币账户存在
        transaction,
        provider,
        market.baseMint,
        owner,
        baseTokenProgramId,
      )
      const userQuoteTokenAccount = await ensureAtaExists(
        // 确保报价代币账户存在
        transaction,
        provider,
        market.quoteMint,
        owner,
        quoteTokenProgramId,
      )
      const tokenProgramForInstruction = side === 'bid' ? quoteTokenProgramId : baseTokenProgramId // 确定指令的代币程序
      const orderSide = side === 'bid' ? { bid: {} } : { ask: {} } // 设置订单方向
      const placeOrderInstruction = await program.methods // 创建限价订单指令
        .newLimitOrder(orderSide, price, quantity)
        .accounts({
          market: marketKey,
          bids: market.bids,
          asks: market.asks,
          openOrders: openOrdersAddress,
          baseVault: market.baseVault,
          quoteVault: market.quoteVault,
          userBaseTokenAccount,
          userQuoteTokenAccount,
          owner,
          baseMint: market.baseMint,
          quoteMint: market.quoteMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgramForInstruction,
        })
        .instruction()
      transaction.add(placeOrderInstruction) // 添加指令到交易
      return provider.sendAndConfirm(transaction) // 发送并确认交易
    },
    onSuccess: handleSuccess, // 成功回调
    onError: (err: Error) => toast.error(`Error placing order: ${err.message}`), // 错误回调
  })

  const cancelLimitOrderMutation = useMutation({
    // 取消限价订单
    mutationKey: ['order-book', 'cancelLimitOrder', { marketKey, owner }], // 变异键
    mutationFn: async ({ orderId }: { orderId: BN }) => {
      // 变异函数
      if (!market || !owner || !openOrdersAddress) throw new Error('Market or user not ready') // 检查必要条件
      return program.methods // 调用取消限价订单方法
        .cancelLimitOrder(orderId)
        .accounts({
          market: marketKey,
          bids: market.bids,
          asks: market.asks,
          openOrders: openOrdersAddress,
          owner,
        })
        .rpc() // 执行远程调用
    },
    onSuccess: handleSuccess, // 成功回调
    onError: (err: Error) => toast.error(`Error cancelling order: ${err.message}`), // 错误回调
  })

  const settleFundsMutation = useMutation({
    // 结算资金
    mutationKey: ['order-book', 'settleFunds', { marketKey, owner }], // 变异键
    mutationFn: async () => {
      // 变异函数
      if (!market || !owner || !openOrdersAddress || !provider) throw new Error('Market, user or provider not ready') // 检查必要条件
      const transaction = new Transaction() // 创建新交易
      const mintsInfo = await provider.connection.getMultipleAccountsInfo([market.baseMint, market.quoteMint]) // 获取代币信息
      const baseMintInfo = mintsInfo[0] // 基础代币信息
      const quoteMintInfo = mintsInfo[1] // 报价代币信息
      if (!baseMintInfo || !quoteMintInfo) throw new Error('Could not fetch mint info') // 检查代币信息
      const baseTokenProgramId = baseMintInfo.owner // 基础代币程序ID
      const quoteTokenProgramId = quoteMintInfo.owner // 报价代币程序ID
      const userBaseTokenAccount = await ensureAtaExists(
        // 确保基础代币账户存在
        transaction,
        provider,
        market.baseMint,
        owner,
        baseTokenProgramId,
      )
      const userQuoteTokenAccount = await ensureAtaExists(
        // 确保报价代币账户存在
        transaction,
        provider,
        market.quoteMint,
        owner,
        quoteTokenProgramId,
      )
      const tokenProgramForInstruction = // 确定指令的代币程序
        baseTokenProgramId.equals(TOKEN_2022_PROGRAM_ID) || quoteTokenProgramId.equals(TOKEN_2022_PROGRAM_ID)
          ? TOKEN_2022_PROGRAM_ID
          : baseTokenProgramId
      const settleFundsInstruction = await program.methods // 创建结算资金指令
        .settleFunds()
        .accounts({
          market: marketKey,
          openOrders: openOrdersAddress,
          owner,
          baseVault: market.baseVault,
          quoteVault: market.quoteVault,
          userBaseTokenAccount,
          userQuoteTokenAccount,
          baseMint: market.baseMint,
          quoteMint: market.quoteMint,
          tokenProgram: tokenProgramForInstruction,
        })
        .instruction()
      transaction.add(settleFundsInstruction) // 添加指令到交易
      return provider.sendAndConfirm(transaction) // 发送并确认交易
    },
    onSuccess: handleSuccess, // 成功回调
    onError: (err: Error) => toast.error(`Error settling funds: ${err.message}`), // 错误回调
  })

  const closeOpenOrdersMutation = useMutation({
    // 关闭开放订单账户
    mutationKey: ['order-book', 'closeOpenOrders', { marketKey, owner }], // 变异键
    mutationFn: () => {
      // 变异函数
      if (!market || !owner || !openOrdersAddress) throw new Error('Market or user not ready') // 检查必要条件
      return program.methods // 调用关闭开放订单方法
        .closeOpenOrders()
        .accounts({ openOrders: openOrdersAddress, owner, solDestination: owner, market: marketKey })
        .rpc() // 执行远程调用
    },
    onSuccess: (tx) => {
      // 成功回调
      transactionToast(tx) // 显示交易提示
      toast.success('OpenOrders account closed successfully.') // 显示成功提示
      queryClient.setQueryData(['order-book', 'openOrders', { marketKey, owner }], null) // 手动清除开放订单缓存
    },
    onError: (err: Error) => toast.error(`Error closing account: ${err.message}`), // 错误回调
  })

  const matchOrdersMutation = useMutation({
    // 匹配订单
    mutationKey: ['order-book', 'matchOrders', { marketKey }], // 变异键
    mutationFn: async ({ matchLimit }: { matchLimit: BN }) => {
      // 变异函数
      if (!market || !provider) throw new Error('Market or provider not ready') // 检查必要条件
      const bids = await program.account.orderBook.fetch(market.bids) // 获取买单簿
      const asks = await program.account.orderBook.fetch(market.asks) // 获取卖单簿
      const SENTINEL = 4294967295 // 定义哨兵值
      if (bids.head === SENTINEL || asks.head === SENTINEL) {
        // 检查是否有订单可匹配
        toast.info('No orders to match.') // 显示无订单提示
        return
      }
      const bestBidNode = bids.nodes[bids.head] // 获取最佳买单
      const bestAskNode = asks.nodes[asks.head] // 获取最佳卖单
      if (bestBidNode.order.price.lt(bestAskNode.order.price)) {
        // 检查价格是否交叉
        toast.info('No matching orders found (spread is not crossed).') // 显示无匹配订单提示
        return
      }
      if (bestBidNode.order.ownerAccount.equals(bestAskNode.order.ownerAccount)) {
        // 检查是否为自交易
        toast.error('Cannot match orders from the same user (self-trade).') // 显示自交易错误
        return
      }
      const remainingAccounts = [
        // 设置剩余账户
        { pubkey: bestBidNode.order.ownerAccount, isWritable: true, isSigner: false },
        { pubkey: bestAskNode.order.ownerAccount, isWritable: true, isSigner: false },
      ]
      const quoteMintInfo = await provider.connection.getAccountInfo(market.quoteMint) // 获取报价代币信息
      if (!quoteMintInfo) throw new Error('Cannot find quote mint info') // 检查报价代币信息
      return program.methods // 调用匹配订单方法
        .matchOrders(matchLimit)
        .accounts({
          market: marketKey,
          bids: market.bids,
          asks: market.asks,
          baseVault: market.baseVault,
          quoteVault: market.quoteVault,
          feeVault: market.feeVault,
          baseMint: market.baseMint,
          quoteMint: market.quoteMint,
          tokenProgram: quoteMintInfo.owner,
        })
        .remainingAccounts(remainingAccounts) // 添加剩余账户
        .rpc() // 执行远程调用
    },
    onSuccess: handleSuccess, // 成功回调
    onError: (err: Error) => toast.error(`Error matching orders: ${err.message}`), // 错误回调
  })

  const setPauseMutation = useMutation({
    // 设置市场暂停状态
    mutationKey: ['order-book', 'setPause', { marketKey }], // 变异键
    mutationFn: (
      paused: boolean, // 变异函数
    ) => program.methods.setPause(paused).accounts({ market: marketKey, authority: owner }).rpc(), // 调用设置暂停方法
    onSuccess: (tx) => {
      // 成功回调
      transactionToast(tx) // 显示交易提示
      marketQuery.refetch() // 刷新市场数据
      toast.success(`Market status updated successfully.`) // 显示成功提示
    },
    onError: (err: Error) => toast.error(`Error setting pause: ${err.message}`), // 错误回调
  })

  const setFeesMutation = useMutation({
    // 设置市场费用
    mutationKey: ['order-book', 'setFees', { marketKey }], // 变异键
    mutationFn: (
      { makerFeeBps, takerFeeBps }: { makerFeeBps: number; takerFeeBps: number }, // 变异函数
    ) => program.methods.setFees(makerFeeBps, takerFeeBps).accounts({ market: marketKey, authority: owner }).rpc(), // 调用设置费用方法
    onSuccess: (tx) => {
      // 成功回调
      transactionToast(tx) // 显示交易提示
      marketQuery.refetch() // 刷新市场数据
      toast.success('Market fees updated successfully.') // 显示成功提示
    },
    onError: (err: Error) => toast.error(`Error setting fees: ${err.message}`), // 错误回调
  })

  return {
    // 返回钩子对象
    marketQuery,
    bidsQuery,
    asksQuery,
    openOrdersQuery,
    openOrdersAddress,
    newLimitOrderMutation,
    cancelLimitOrderMutation,
    settleFundsMutation,
    closeOpenOrdersMutation,
    matchOrdersMutation,
    setFeesMutation,
    setPauseMutation,
  }
}
