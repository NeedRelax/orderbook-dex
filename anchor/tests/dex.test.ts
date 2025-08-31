import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { OrderBookDex } from '../target/types/order_book_dex' // 导入 OrderBookDex 程序类型
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from '@solana/spl-token'

// Jest 测试套件，测试 Order Book DEX 功能
describe('order_book_dex', () => {
  // 配置 Anchor 提供者
  const provider = anchor.AnchorProvider.env() // 获取测试环境中的 Anchor 提供者
  anchor.setProvider(provider) // 设置 Anchor 提供者
  const program = anchor.workspace.OrderBookDex as Program<OrderBookDex> // 加载 OrderBookDex 程序
  const connection = provider.connection // 获取 Solana 连接对象

  // 定义测试账户和变量
  const authority = Keypair.generate() // 市场管理员的密钥对
  const userA = Keypair.generate() // 买家（Taker）的密钥对
  const userB = Keypair.generate() // 卖家（Maker）的密钥对

  // 代币 Mint 地址
  let baseMint: PublicKey // 基础代币（例如 SOL）
  let quoteMint: PublicKey // 报价代币（例如 USDC）

  // 用户的代币账户
  let userABaseTokenAccount: PublicKey // 用户 A 的基础代币账户
  let userAQuoteTokenAccount: PublicKey // 用户 A 的报价代币账户
  let userBBaseTokenAccount: PublicKey // 用户 B 的基础代币账户
  let userBQuoteTokenAccount: PublicKey // 用户 B 的报价代币账户

  // 程序派生地址（PDAs）
  let marketPda: PublicKey // 市场账户 PDA
  let bidsPda: PublicKey // 买单簿 PDA
  let asksPda: PublicKey // 卖单簿 PDA
  let baseVaultPda: PublicKey // 基础代币金库 PDA
  let quoteVaultPda: PublicKey // 报价代币金库 PDA
  let feeVaultPda: PublicKey // 费用金库 PDA
  let openOrdersA: PublicKey // 用户 A 的开放订单账户 PDA
  let openOrdersB: PublicKey // 用户 B 的开放订单账户 PDA

  // 市场参数
  const makerFeeBps = new BN(20) // Maker 费用：0.2%
  const takerFeeBps = new BN(40) // Taker 费用：0.4%
  const tickSize = new BN(100) // 价格最小单位：1.00
  const baseLotSize = new BN(1_000_000) // 数量最小单位：0.001（假设 9 位小数）

  // 在所有测试前执行的初始化设置
  beforeAll(async () => {
    // 给测试账户空投 SOL 以支付交易费用
    const airdropSigs = await Promise.all([
      connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL), // 给管理员空投 10 SOL
      connection.requestAirdrop(userA.publicKey, 10 * LAMPORTS_PER_SOL), // 给用户 A 空投 10 SOL
      connection.requestAirdrop(userB.publicKey, 10 * LAMPORTS_PER_SOL), // 给用户 B 空投 10 SOL
    ])

    // 等待空投交易确认
    const latestBlockhash = await connection.getLatestBlockhash()
    await Promise.all(airdropSigs.map((sig) => connection.confirmTransaction({ ...latestBlockhash, signature: sig })))

    // 创建基础代币和报价代币的 Mint
    baseMint = await createMint(
      connection,
      authority, // 支付者
      authority.publicKey, // Mint 权限
      null, // 冻结权限
      9, // 基础代币小数位数（例如 SOL）
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID, // 使用 Token 2022 程序
    )
    quoteMint = await createMint(
      connection,
      authority, // 支付者
      authority.publicKey, // Mint 权限
      null, // 冻结权限
      6, // 报价代币小数位数（例如 USDC）
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )

    // 计算市场相关的 PDA
    ;[marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId,
    ) // 市场账户 PDA
    ;[baseVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('base_vault'), marketPda.toBuffer()],
      program.programId,
    ) // 基础代币金库 PDA
    ;[quoteVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('quote_vault'), marketPda.toBuffer()],
      program.programId,
    ) // 报价代币金库 PDA
    ;[bidsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bids'), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId,
    ) // 买单簿 PDA
    ;[asksPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('asks'), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId,
    ) // 卖单簿 PDA
    ;[feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault'), baseMint.toBuffer(), quoteMint.toBuffer()],
      program.programId,
    ) // 费用金库 PDA
    ;[openOrdersA] = PublicKey.findProgramAddressSync(
      [Buffer.from('open_orders'), marketPda.toBuffer(), userA.publicKey.toBuffer()],
      program.programId,
    ) // 用户 A 的开放订单 PDA
    ;[openOrdersB] = PublicKey.findProgramAddressSync(
      [Buffer.from('open_orders'), marketPda.toBuffer(), userB.publicKey.toBuffer()],
      program.programId,
    ) // 用户 B 的开放订单 PDA

    // 为用户 A 创建代币账户并铸造代币
    userABaseTokenAccount = await createAssociatedTokenAccount(
      connection,
      userA, // 支付者
      baseMint,
      userA.publicKey, // 账户拥有者
      {},
      TOKEN_2022_PROGRAM_ID,
    ) // 用户 A 的基础代币账户
    userAQuoteTokenAccount = await createAssociatedTokenAccount(
      connection,
      userA, // 支付者
      quoteMint,
      userA.publicKey, // 账户拥有者
      {},
      TOKEN_2022_PROGRAM_ID,
    ) // 用户 A 的报价代币账户
    await mintTo(
      connection,
      authority, // 支付者
      quoteMint,
      userAQuoteTokenAccount,
      authority, // Mint 权限
      1_000_000 * 1e6, // 铸造 1,000,000 USDC
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )

    // 为用户 B 创建代币账户并铸造代币
    userBBaseTokenAccount = await createAssociatedTokenAccount(
      connection,
      userB, // 支付者
      baseMint,
      userB.publicKey, // 账户拥有者
      {},
      TOKEN_2022_PROGRAM_ID,
    ) // 用户 B 的基础代币账户
    userBQuoteTokenAccount = await createAssociatedTokenAccount(
      connection,
      userB, // 支付者
      quoteMint,
      userB.publicKey, // 账户拥有者
      {},
      TOKEN_2022_PROGRAM_ID,
    ) // 用户 B 的报价代币账户
    await mintTo(
      connection,
      authority, // 支付者
      baseMint,
      userBBaseTokenAccount,
      authority, // Mint 权限
      100 * 1e9, // 铸造 100 SOL
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )
  }, 60000) // 设置 60 秒超时以处理异步操作

  // 测试用例：初始化市场
  it('✅ Initializes the market', async () => {
    // 调用程序的 initializeMarket 方法
    await program.methods
      .initializeMarket(
        makerFeeBps.toNumber(), // Maker 费用（0.2%）
        takerFeeBps.toNumber(), // Taker 费用（0.4%）
        tickSize, // 价格最小单位
        baseLotSize, // 数量最小单位
        null, // 最小基础数量（未设置）
        null, // 最小名义价值（未设置）
      )
      .accounts({
        market: marketPda, // 市场账户
        baseMint: baseMint, // 基础代币 Mint
        quoteMint: quoteMint, // 报价代币 Mint
        baseVault: baseVaultPda, // 基础代币金库
        quoteVault: quoteVaultPda, // 报价代币金库
        feeVault: feeVaultPda, // 费用金库
        bids: bidsPda, // 买单簿
        asks: asksPda, // 卖单簿
        authority: authority.publicKey, // 管理员公钥
        systemProgram: SystemProgram.programId, // 系统程序
        tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, // 关联代币程序
        rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
      })
      .signers([authority]) // 管理员签名
      .rpc() // 发送交易

    // 验证市场状态
    const marketAccount = await program.account.market.fetch(marketPda) // 获取市场账户数据
    expect(marketAccount.authority).toEqual(authority.publicKey) // 验证管理员公钥
    expect(marketAccount.baseMint).toEqual(baseMint) // 验证基础代币 Mint
    expect(marketAccount.quoteMint).toEqual(quoteMint) // 验证报价代币 Mint
    expect(marketAccount.makerFeeBps).toBe(makerFeeBps.toNumber()) // 验证 Maker 费用
    expect(marketAccount.takerFeeBps).toBe(takerFeeBps.toNumber()) // 验证 Taker 费用
    expect(marketAccount.tickSize.eq(tickSize)).toBe(true) // 验证价格最小单位
    expect(marketAccount.paused).toBe(false) // 验证市场未暂停
    expect(marketAccount.baseVault).toEqual(baseVaultPda) // 验证基础代币金库
    expect(marketAccount.quoteVault).toEqual(quoteVaultPda) // 验证报价代币金库

    // 验证金库账户
    const baseVaultAccount = await getAccount(connection, baseVaultPda, 'confirmed', TOKEN_2022_PROGRAM_ID) // 获取基础代币金库账户
    expect(baseVaultAccount.owner).toEqual(marketPda) // 验证金库账户的拥有者是市场账户
  })

  // 测试用例：用户 B 放置限价卖单
  it('✅ User B (Maker) places a new limit ask order', async () => {
    const price = new BN(150 * 100) // 卖单价格：150.00 USDC
    const quantity = new BN(10 * 1e9) // 卖单数量：10 SOL

    // 调用程序的 newLimitOrder 方法放置卖单
    await program.methods
      .newLimitOrder({ ask: {} }, price, quantity)
      .accounts({
        market: marketPda, // 市场账户
        bids: bidsPda, // 买单簿
        asks: asksPda, // 卖单簿
        openOrders: openOrdersB, // 用户 B 的开放订单账户
        baseVault: baseVaultPda, // 基础代币金库
        quoteVault: quoteVaultPda, // 报价代币金库
        userBaseTokenAccount: userBBaseTokenAccount, // 用户 B 的基础代币账户
        userQuoteTokenAccount: userBQuoteTokenAccount, // 用户 B 的报价代币账户
        owner: userB.publicKey, // 用户 B 公钥
        baseMint: baseMint, // 基础代币 Mint
        quoteMint: quoteMint, // 报价代币 Mint
        tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        systemProgram: SystemProgram.programId, // 系统程序
        rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
      })
      .signers([userB]) // 用户 B 签名
      .rpc() // 发送交易

    // 验证开放订单账户状态
    const openOrdersBAccount = await program.account.openOrders.fetch(openOrdersB) // 获取用户 B 的开放订单账户
    expect(openOrdersBAccount.baseTokenLocked.eq(quantity)).toBe(true) // 验证锁定的基础代币数量
  })

  // 测试用例：用户 A 放置限价买单并跨越价差
  it('✅ User A (Taker) places a new limit bid order that crosses the spread', async () => {
    const price = new BN(151 * 100) // 买单价格：151.00 USDC
    const quantity = new BN(5 * 1e9) // 买单数量：5 SOL

    try {
      console.log("--> [TEST] Building transaction for user A's bid...") // 调试日志：开始构建交易
      // 构建限价买单交易
      const tx = await program.methods
        .newLimitOrder({ bid: {} }, price, quantity)
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersA, // 用户 A 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userABaseTokenAccount, // 用户 A 的基础代币账户
          userQuoteTokenAccount: userAQuoteTokenAccount, // 用户 A 的报价代币账户
          owner: userA.publicKey, // 用户 A 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .transaction() // 生成交易对象

      console.log('--> [TEST] Transaction built. Sending and confirming...') // 调试日志：发送交易
      // 发送并确认交易
      const signature = await anchor.web3.sendAndConfirmTransaction(connection, tx, [userA]) // 用户 A 签名
      console.log('--> [TEST] Transaction confirmed with signature:', signature) // 调试日志：交易确认

      // 获取交易日志
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      console.log('--> [TEST] On-chain logs:', txDetails?.meta?.logMessages) // 调试日志：链上日志

      // 验证买单簿状态
      console.log('--> [TEST] Fetching account states for verification...') // 调试日志：获取账户状态
      const bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      expect(bidsAccount.count).toBe(1) // 验证买单簿有一个订单
      console.log('--> [TEST] ✅ PASSED') // 调试日志：测试通过
    } catch (error) {
      // 错误处理
      console.error('--> [TEST] ❌ FAILED with error object:', error) // 调试日志：测试失败
      if (error && error.logs) {
        console.error('--> [TEST] Program Logs:', error.logs) // 打印程序日志
      } else {
        console.error(
          '--> [TEST] No program logs found. This might be a client-side error before sending the transaction.',
        ) // 客户端错误提示
      }
      throw error // 抛出错误以停止测试
    }
  }, 60000) // 设置 60 秒超时

  // 测试用例：撮合订单
  it('✅ Matches the orders', async () => {
    try {
      console.log('--> [TEST] Building matchOrders transaction...') // 调试日志：构建撮合交易
      // 构建撮合订单指令
      const matchOrdersIx = await program.methods
        .matchOrders(new BN(5)) // 撮合 5 个订单
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          feeVault: feeVaultPda, // 费用金库
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .remainingAccounts([
          { pubkey: openOrdersA, isSigner: false, isWritable: true }, // 用户 A 的开放订单账户（Taker）
          { pubkey: openOrdersB, isSigner: false, isWritable: true }, // 用户 B 的开放订单账户（Maker）
        ])
        .instruction() // 生成指令

      // 创建交易对象
      const tx = new anchor.web3.Transaction()
      tx.add(matchOrdersIx) // 添加撮合指令到交易

      console.log('--> [TEST] Transaction built. Sending and confirming...') // 调试日志：发送交易
      // 发送并确认交易
      const signature = await anchor.web3.sendAndConfirmTransaction(connection, tx, [authority]) // 管理员签名
      console.log('--> [TEST] Transaction confirmed with signature:', signature) // 调试日志：交易确认

      // 获取交易日志
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      console.log('--> [TEST] On-chain logs:', txDetails?.meta?.logMessages) // 调试日志：链上日志

      console.log('--> [TEST] ✅ PASSED (after confirmation)') // 调试日志：测试通过

      // 验证买单簿状态
      const bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      expect(bidsAccount.count).toBe(0) // 验证买单簿为空（订单已撮合）
    } catch (error) {
      console.error('--> [TEST] ❌ FAILED with error object:', error) // 调试日志：测试失败
      if (error && error.logs) {
        console.error('--> [TEST] Program Logs:', error.logs) // 打印程序日志
      } else {
        console.error(
          '--> [TEST] No program logs found. This might be a client-side error or pre-flight simulation error.',
        ) // 客户端错误提示
      }
      throw error // 抛出错误以停止测试
    }
  }, 60000) // 设置 60 秒超时

  // 测试用例：用户 B 取消剩余订单
  it('✅ User B cancels the remaining order', async () => {
    // 获取卖单簿数据以找到要取消的订单
    const asksAccountBefore = await program.account.orderBook.fetch(asksPda) // 获取卖单簿数据
    const orderToCancel = asksAccountBefore.nodes[asksAccountBefore.head].order // 获取第一个订单
    const orderId = orderToCancel.orderId // 获取订单 ID

    // 调用取消限价订单方法
    await program.methods
      .cancelLimitOrder(orderId)
      .accounts({
        market: marketPda, // 市场账户
        bids: bidsPda, // 买单簿
        asks: asksPda, // 卖单簿
        openOrders: openOrdersB, // 用户 B 的开放订单账户
        owner: userB.publicKey, // 用户 B 公钥
      })
      .signers([userB]) // 用户 B 签名
      .rpc() // 发送交易

    // 验证卖单簿状态
    const asksAccountAfter = await program.account.orderBook.fetch(asksPda) // 获取更新后的卖单簿
    expect(asksAccountAfter.count).toBe(0) // 验证卖单簿为空
  })

  // 测试用例：用户结算资金
  it('✅ Users settle their funds', async () => {
    // 为用户 A 结算资金
    try {
      console.log('--> [TEST] Settling funds for User A...') // 调试日志：为用户 A 结算
      // 构建结算资金交易
      const txA = await program.methods
        .settleFunds()
        .accounts({
          market: marketPda, // 市场账户
          openOrders: openOrdersA, // 用户 A 的开放订单账户
          owner: userA.publicKey, // 用户 A 公钥
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userABaseTokenAccount, // 用户 A 的基础代币账户
          userQuoteTokenAccount: userAQuoteTokenAccount, // 用户 A 的报价代币账户
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .transaction() // 生成交易对象

      // 发送并确认交易
      const signatureA = await anchor.web3.sendAndConfirmTransaction(connection, txA, [userA]) // 用户 A 签名
      console.log('--> [TEST] User A settled funds with signature:', signatureA) // 调试日志：用户 A 结算完成
    } catch (error) {
      console.error('--> [TEST] ❌ FAILED to settle for User A:', error) // 调试日志：用户 A 结算失败
      if (error && error.logs) {
        console.error('--> [TEST] Program Logs:', error.logs) // 打印程序日志
      }
      throw error // 抛出错误以停止测试
    }

    // 为用户 B 结算资金
    try {
      console.log('--> [TEST] Settling funds for User B...') // 调试日志：为用户 B 结算
      // 构建结算资金交易
      const txB = await program.methods
        .settleFunds()
        .accounts({
          market: marketPda, // 市场账户
          openOrders: openOrdersB, // 用户 B 的开放订单账户
          owner: userB.publicKey, // 用户 B 公钥
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userBBaseTokenAccount, // 用户 B 的基础代币账户
          userQuoteTokenAccount: userBQuoteTokenAccount, // 用户 B 的报价代币账户
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .transaction() // 生成交易对象

      // 发送并确认交易
      const signatureB = await anchor.web3.sendAndConfirmTransaction(connection, txB, [userB]) // 用户 B 签名
      console.log('--> [TEST] User B settled funds with signature:', signatureB) // 调试日志：用户 B 结算完成
    } catch (error) {
      console.error('--> [TEST] ❌ FAILED to settle for User B:', error) // 调试日志：用户 B 结算失败
      if (error && error.logs) {
        console.error('--> [TEST] Program Logs:', error.logs) // 打印程序日志
      }
      throw error // 抛出错误以停止测试
    }

    // 验证结算后账户状态
    console.log('--> [TEST] ✅ PASSED') // 调试日志：测试通过
    const openOrdersA_afterSettle = await program.account.openOrders.fetch(openOrdersA) // 获取用户 A 的开放订单账户
    expect(openOrdersA_afterSettle.baseTokenFree.toNumber()).toBe(0) // 验证无剩余基础代币
    expect(openOrdersA_afterSettle.quoteTokenFree.toNumber()).toBe(0) // 验证无剩余报价代币

    const openOrdersB_afterSettle = await program.account.openOrders.fetch(openOrdersB) // 获取用户 B 的开放订单账户
    expect(openOrdersB_afterSettle.baseTokenFree.toNumber()).toBe(0) // 验证无剩余基础代币
    expect(openOrdersB_afterSettle.quoteTokenFree.toNumber()).toBe(0) // 验证无剩余报价代币
  }, 60000) // 设置 60 秒超时

  // 测试用例：用户关闭开放订单账户
  it('✅ Users close their open orders accounts', async () => {
    // 为用户 A 关闭开放订单账户
    await program.methods
      .closeOpenOrders()
      .accounts({
        openOrders: openOrdersA, // 用户 A 的开放订单账户
        owner: userA.publicKey, // 用户 A 公钥
        solDestination: userA.publicKey, // 退还 SOL 的目标账户
        market: marketPda, // 市场账户
      })
      .signers([userA]) // 用户 A 签名
      .rpc() // 发送交易

    // 验证账户已关闭
    const closedAccountA = await connection.getAccountInfo(openOrdersA) // 获取账户信息
    expect(closedAccountA).toBeNull() // 验证账户已不存在

    // 为用户 B 关闭开放订单账户
    await program.methods
      .closeOpenOrders()
      .accounts({
        openOrders: openOrdersB, // 用户 B 的开放订单账户
        owner: userB.publicKey, // 用户 B 公钥
        solDestination: userB.publicKey, // 退还 SOL 的目标账户
        market: marketPda, // 市场账户
      })
      .signers([userB]) // 用户 B 签名
      .rpc() // 发送交易

    // 验证账户已关闭
    const closedAccountB = await connection.getAccountInfo(openOrdersB) // 获取账户信息
    expect(closedAccountB).toBeNull() // 验证账户已不存在
  })

  // 测试用例：管理员暂停和恢复市场
  it('✅ Admin can pause and unpause the market', async () => {
    // 暂停市场
    await program.methods
      .setPause(true)
      .accounts({
        market: marketPda, // 市场账户
        authority: authority.publicKey, // 管理员公钥
      })
      .signers([authority]) // 管理员签名
      .rpc() // 发送交易

    // 验证市场状态
    let marketAccount = await program.account.market.fetch(marketPda) // 获取市场账户数据
    expect(marketAccount.paused).toBe(true) // 验证市场已暂停

    // 恢复市场
    await program.methods
      .setPause(false)
      .accounts({
        market: marketPda, // 市场账户
        authority: authority.publicKey, // 管理员公钥
      })
      .signers([authority]) // 管理员签名
      .rpc() // 发送交易

    // 验证市场状态
    marketAccount = await program.account.market.fetch(marketPda) // 获取更新后的市场账户数据
    expect(marketAccount.paused).toBe(false) // 验证市场已恢复
  })

  // 测试用例：管理员更新费用
  it('✅ Admin can update fees', async () => {
    const newMakerFee = 50 // 新 Maker 费用：0.5%
    const newTakerFee = 100 // 新 Taker 费用：1.0%

    // 调用更新费用方法
    await program.methods
      .setFees(newMakerFee, newTakerFee)
      .accounts({
        market: marketPda, // 市场账户
        authority: authority.publicKey, // 管理员公钥
      })
      .signers([authority]) // 管理员签名
      .rpc() // 发送交易

    // 验证费用更新
    const marketAccount = await program.account.market.fetch(marketPda) // 获取市场账户数据
    expect(marketAccount.makerFeeBps).toBe(newMakerFee) // 验证新 Maker 费用
    expect(marketAccount.takerFeeBps).toBe(newTakerFee) // 验证新 Taker 费用
  })

  // 高级测试用例套件
  describe('Advanced Scenarios', () => {
    // 定义新用户
    const userC = Keypair.generate() // 新用户 C（买家）
    const userD = Keypair.generate() // 新用户 D（卖家）
    let userCBaseTokenAccount: PublicKey // 用户 C 的基础代币账户
    let userCQuoteTokenAccount: PublicKey // 用户 C 的报价代币账户
    let userDBaseTokenAccount: PublicKey // 用户 D 的基础代币账户
    let userDQuoteTokenAccount: PublicKey // 用户 D 的报价代币账户
    let openOrdersC: PublicKey // 用户 C 的开放订单账户 PDA
    let openOrdersD: PublicKey // 用户 D 的开放订单账户 PDA

    // 在高级测试套件开始前设置新用户
    beforeAll(async () => {
      // 给新用户空投 SOL
      const airdropSigs = await Promise.all([
        connection.requestAirdrop(userC.publicKey, 5 * LAMPORTS_PER_SOL), // 给用户 C 空投 5 SOL
        connection.requestAirdrop(userD.publicKey, 5 * LAMPORTS_PER_SOL), // 给用户 D 空投 5 SOL
      ])
      const latestBlockhash = await connection.getLatestBlockhash()
      await Promise.all(airdropSigs.map((sig) => connection.confirmTransaction({ ...latestBlockhash, signature: sig }))) // 确认空投交易

      // 为用户 C 创建代币账户并铸造代币
      userCBaseTokenAccount = await createAssociatedTokenAccount(
        connection,
        userC,
        baseMint,
        userC.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID,
      ) // 用户 C 的基础代币账户
      userCQuoteTokenAccount = await createAssociatedTokenAccount(
        connection,
        userC,
        quoteMint,
        userC.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID,
      ) // 用户 C 的报价代币账户
      await mintTo(
        connection,
        authority,
        quoteMint,
        userCQuoteTokenAccount,
        authority,
        500_000 * 1e6, // 铸造 500,000 USDC
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )

      // 为用户 D 创建代币账户并铸造代币
      userDBaseTokenAccount = await createAssociatedTokenAccount(
        connection,
        userD,
        baseMint,
        userD.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID,
      ) // 用户 D 的基础代币账户
      userDQuoteTokenAccount = await createAssociatedTokenAccount(
        connection,
        userD,
        quoteMint,
        userD.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID,
      ) // 用户 D 的报价代币账户
      await mintTo(
        connection,
        authority,
        baseMint,
        userDBaseTokenAccount,
        authority,
        50 * 1e9, // 铸造 50 SOL
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )

      // 计算新用户的开放订单 PDA
      ;[openOrdersC] = PublicKey.findProgramAddressSync(
        [Buffer.from('open_orders'), marketPda.toBuffer(), userC.publicKey.toBuffer()],
        program.programId,
      ) // 用户 C 的开放订单 PDA
      ;[openOrdersD] = PublicKey.findProgramAddressSync(
        [Buffer.from('open_orders'), marketPda.toBuffer(), userD.publicKey.toBuffer()],
        program.programId,
      ) // 用户 D 的开放订单 PDA
    }, 60000) // 设置 60 秒超时

    // 测试用例：部分成交（Taker 订单大于最佳 Maker 订单）
    it('✅ Partial fill: Taker order is larger than the best Maker order', async () => {
      // 用户 D 放置 10 SOL 的卖单，价格 160 USDC
      const priceD = new BN(160 * 100) // 卖单价格：160.00 USDC
      const quantityD = new BN(10 * 1e9) // 卖单数量：10 SOL
      await program.methods
        .newLimitOrder({ ask: {} }, priceD, quantityD)
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersD, // 用户 D 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userDBaseTokenAccount, // 用户 D 的基础代币账户
          userQuoteTokenAccount: userDQuoteTokenAccount, // 用户 D 的报价代币账户
          owner: userD.publicKey, // 用户 D 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .signers([userD]) // 用户 D 签名
        .rpc() // 发送交易

      // 验证卖单簿状态
      let asksAccount = await program.account.orderBook.fetch(asksPda) // 获取卖单簿数据
      expect(asksAccount.count).toBe(1) // 验证有一个卖单

      // 用户 C 放置 20 SOL 的买单，价格 161 USDC
      const priceC = new BN(161 * 100) // 买单价格：161.00 USDC
      const quantityC = new BN(20 * 1e9) // 买单数量：20 SOL
      await program.methods
        .newLimitOrder({ bid: {} }, priceC, quantityC)
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersC, // 用户 C 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userCBaseTokenAccount, // 用户 C 的基础代币账户
          userQuoteTokenAccount: userCQuoteTokenAccount, // 用户 C 的报价代币账户
          owner: userC.publicKey, // 用户 C 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .signers([userC]) // 用户 C 签名
        .rpc() // 发送交易

      // 验证买单簿状态
      let bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      expect(bidsAccount.count).toBe(1) // 验证有一个买单

      // 撮合订单
      await program.methods
        .matchOrders(new BN(5)) // 撮合 5 个订单
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          feeVault: feeVaultPda, // 费用金库
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .remainingAccounts([
          { pubkey: openOrdersC, isSigner: false, isWritable: true }, // 用户 C 的开放订单账户（Taker）
          { pubkey: openOrdersD, isSigner: false, isWritable: true }, // 用户 D 的开放订单账户（Maker）
        ])
        .rpc() // 发送交易

      // 验证状态
      asksAccount = await program.account.orderBook.fetch(asksPda) // 获取更新后的卖单簿
      expect(asksAccount.count).toBe(0) // 验证卖单簿为空（卖单已成交）

      bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取更新后的买单簿
      expect(bidsAccount.count).toBe(1) // 验证买单簿有一个剩余订单
      const remainingBidOrder = bidsAccount.nodes[bidsAccount.head].order // 获取剩余买单
      expect(remainingBidOrder.baseQty.eq(new BN(10 * 1e9))).toBe(true) // 验证剩余数量为 10 SOL
      expect(remainingBidOrder.ownerAccount).toEqual(openOrdersC) // 验证订单拥有者
    })

    // 测试用例：一个 Taker 订单撮合多个 Maker 订单
    it('✅ Multi-match: One Taker order fills multiple Maker orders', async () => {
      // 清理用户 C 的剩余买单
      const bidsAccountBefore = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      const orderToCancelId = bidsAccountBefore.nodes[bidsAccountBefore.head].order.orderId // 获取订单 ID
      await program.methods
        .cancelLimitOrder(orderToCancelId)
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersC, // 用户 C 的开放订单账户
          owner: userC.publicKey, // 用户 C 公钥
        })
        .signers([userC]) // 用户 C 签名
        .rpc() // 发送交易

      // 用户 B 放置 5 SOL 的卖单，价格 158 USDC
      await program.methods
        .newLimitOrder({ ask: {} }, new BN(158 * 100), new BN(5 * 1e9))
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersB, // 用户 B 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userBBaseTokenAccount, // 用户 B 的基础代币账户
          userQuoteTokenAccount: userBQuoteTokenAccount, // 用户 B 的报价代币账户
          owner: userB.publicKey, // 用户 B 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .signers([userB]) // 用户 B 签名
        .rpc() // 发送交易

      // 用户 D 放置 8 SOL 的卖单，价格 159 USDC
      await program.methods
        .newLimitOrder({ ask: {} }, new BN(159 * 100), new BN(8 * 1e9))
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersD, // 用户 D 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userDBaseTokenAccount, // 用户 D 的基础代币账户
          userQuoteTokenAccount: userDQuoteTokenAccount, // 用户 D 的报价代币账户
          owner: userD.publicKey, // 用户 D 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .signers([userD]) // 用户 D 签名
        .rpc() // 发送交易

      // 验证卖单簿状态
      let asksAccount = await program.account.orderBook.fetch(asksPda) // 获取卖单簿数据
      expect(asksAccount.count).toBe(2) // 验证有两个卖单

      // 用户 C 放置 15 SOL 的买单，价格 160 USDC
      await program.methods
        .newLimitOrder({ bid: {} }, new BN(160 * 100), new BN(15 * 1e9))
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          openOrders: openOrdersC, // 用户 C 的开放订单账户
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          userBaseTokenAccount: userCBaseTokenAccount, // 用户 C 的基础代币账户
          userQuoteTokenAccount: userCQuoteTokenAccount, // 用户 C 的报价代币账户
          owner: userC.publicKey, // 用户 C 公钥
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
          systemProgram: SystemProgram.programId, // 系统程序
          rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
        })
        .signers([userC]) // 用户 C 签名
        .rpc() // 发送交易

      // 第一次撮合：用户 C vs 用户 B
      await program.methods
        .matchOrders(new BN(1))
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          feeVault: feeVaultPda, // 费用金库
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .remainingAccounts([
          { pubkey: openOrdersC, isSigner: false, isWritable: true }, // 用户 C 的开放订单账户（Taker）
          { pubkey: openOrdersB, isSigner: false, isWritable: true }, // 用户 B 的开放订单账户（Maker）
        ])
        .rpc() // 发送交易

      // 验证卖单簿状态
      asksAccount = await program.account.orderBook.fetch(asksPda) // 获取更新后的卖单簿
      expect(asksAccount.count).toBe(1) // 验证剩下一个卖单

      // 第二次撮合：用户 C vs 用户 D
      await program.methods
        .matchOrders(new BN(1))
        .accounts({
          market: marketPda, // 市场账户
          bids: bidsPda, // 买单簿
          asks: asksPda, // 卖单簿
          baseVault: baseVaultPda, // 基础代币金库
          quoteVault: quoteVaultPda, // 报价代币金库
          feeVault: feeVaultPda, // 费用金库
          baseMint: baseMint, // 基础代币 Mint
          quoteMint: quoteMint, // 报价代币 Mint
          tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
        })
        .remainingAccounts([
          { pubkey: openOrdersC, isSigner: false, isWritable: true }, // 用户 C 的开放订单账户（Taker）
          { pubkey: openOrdersD, isSigner: false, isWritable: true }, // 用户 D 的开放订单账户（Maker）
        ])
        .rpc() // 发送交易

      // 验证状态
      asksAccount = await program.account.orderBook.fetch(asksPda) // 获取更新后的卖单簿
      expect(asksAccount.count).toBe(0) // 验证卖单簿为空

      const bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      expect(bidsAccount.count).toBe(1) // 验证买单簿有一个剩余订单
      const finalBidOrder = bidsAccount.nodes[bidsAccount.head].order // 获取剩余买单
      expect(finalBidOrder.baseQty.eq(new BN(2 * 1e9))).toBe(true) // 验证剩余数量为 2 SOL
    })

    // 测试用例：市场暂停时无法下单
    it('✅ Should fail to place order when market is paused', async () => {
      // 暂停市场
      await program.methods
        .setPause(true)
        .accounts({
          market: marketPda, // 市场账户
          authority: authority.publicKey, // 管理员公钥
        })
        .signers([authority]) // 管理员签名
        .rpc() // 发送交易

      // 尝试下单，期望失败
      await expect(
        program.methods
          .newLimitOrder({ ask: {} }, new BN(200 * 100), new BN(1 * 1e9))
          .accounts({
            market: marketPda, // 市场账户
            bids: bidsPda, // 买单簿
            asks: asksPda, // 卖单簿
            openOrders: openOrdersD, // 用户 D 的开放订单账户
            baseVault: baseVaultPda, // 基础代币金库
            quoteVault: quoteVaultPda, // 报价代币金库
            userBaseTokenAccount: userDBaseTokenAccount, // 用户 D 的基础代币账户
            userQuoteTokenAccount: userDQuoteTokenAccount, // 用户 D 的报价代币账户
            owner: userD.publicKey, // 用户 D 公钥
            baseMint: baseMint, // 基础代币 Mint
            quoteMint: quoteMint, // 报价代币 Mint
            tokenProgram: TOKEN_2022_PROGRAM_ID, // Token 2022 程序
            systemProgram: SystemProgram.programId, // 系统程序
            rent: anchor.web3.SYSVAR_RENT_PUBKEY, // 租金账户
          })
          .signers([userD]) // 用户 D 签名
          .rpc(),
      ).rejects.toThrow('Market is paused.') // 验证抛出“市场暂停”错误

      // 恢复市场
      await program.methods
        .setPause(false)
        .accounts({
          market: marketPda, // 市场账户
          authority: authority.publicKey, // 管理员公钥
        })
        .signers([authority]) // 管理员签名
        .rpc() // 发送交易
    })

    // 测试用例：无法取消他人订单
    it("✅ Should fail to cancel someone else's order", async () => {
      // 获取用户 C 的订单 ID
      const bidsAccount = await program.account.orderBook.fetch(bidsPda) // 获取买单簿数据
      const userCOrderId = bidsAccount.nodes[bidsAccount.head].order.orderId // 获取用户 C 的订单 ID

      // 用户 D 尝试取消用户 C 的订单，期望失败
      await expect(
        program.methods
          .cancelLimitOrder(userCOrderId)
          .accounts({
            market: marketPda, // 市场账户
            bids: bidsPda, // 买单簿
            asks: asksPda, // 卖单簿
            openOrders: openOrdersD, // 用户 D 的开放订单账户
            owner: userD.publicKey, // 用户 D 公钥
          })
          .signers([userD]) // 用户 D 签名
          .rpc(),
      ).rejects.toThrow('Unauthorized action.') // 验证抛出“未授权操作”错误
    })
  })
})
