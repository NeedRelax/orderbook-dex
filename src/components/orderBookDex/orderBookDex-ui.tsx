'use client' // 指定此文件为客户端组件

import { PublicKey } from '@solana/web3.js' // 导入Solana的PublicKey类
import { useMemo, useState } from 'react' // 导入React的useMemo和useState钩子
import { ExplorerLink } from '../cluster/cluster-ui' // 导入ExplorerLink组件，用于显示Solana账户链接
import { useMarket, useOrderBookProgram } from './orderBookDex-data-access' // 导入市场和订单簿程序数据访问钩子
import { ellipsify } from '@/lib/utils' // 导入ellipsify工具函数，用于缩短地址显示
import { Button } from '@/components/ui/button' // 导入通用Button组件
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card' // 导入Card相关组件
import { Input } from '@/components/ui/input' // 导入Input组件
import { Label } from '@/components/ui/label' // 导入Label组件
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs' // 导入Tabs相关组件
import { BN } from '@coral-xyz/anchor' // 导入Anchor的大数类
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table' // 导入Table相关组件
import { useWallet } from '@solana/wallet-adapter-react' // 导入Solana钱包钩子
import { toast } from 'sonner' // 导入提示通知库

// --- 组件 1: 创建新市场的表单 ---
export function MarketInitialize() {
  // 定义创建新市场组件
  const { initializeMarket } = useOrderBookProgram() // 获取初始化市场函数
  const [baseMint, setBaseMint] = useState('') // 定义基础代币地址状态
  const [quoteMint, setQuoteMint] = useState('') // 定义报价代币地址状态

  const handleSubmit = () => {
    // 定义表单提交处理函数
    try {
      // 尝试执行
      const base = new PublicKey(baseMint) // 将基础代币地址转换为PublicKey
      const quote = new PublicKey(quoteMint) // 将报价代币地址转换为PublicKey
      initializeMarket.mutate({ baseMint: base, quoteMint: quote }) // 调用初始化市场函数
    } catch (e) {
      // 捕获错误
      toast.error('Invalid Public Key') // 显示无效公钥提示
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Create New Market</CardTitle>
        <CardDescription>Enter the mint addresses for the base and quote tokens.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="baseMint">Base Mint</Label>
          <Input
            id="baseMint"
            placeholder="e.g. So11111111111111111111111111111111111111112"
            value={baseMint}
            onChange={(e) => setBaseMint(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quoteMint">Quote Mint</Label>
          <Input
            id="quoteMint"
            placeholder="e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            value={quoteMint}
            onChange={(e) => setQuoteMint(e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} disabled={initializeMarket.isPending || !baseMint || !quoteMint}>
          {initializeMarket.isPending ? 'Creating...' : 'Create Market'}
        </Button>
      </CardFooter>
    </Card>
  )
}

// --- 组件 2: 显示所有可用市场的列表 ---
export function MarketList({ selectMarket }: { selectMarket: (pk: PublicKey) => void }) {
  // 定义市场列表组件
  const { markets } = useOrderBookProgram() // 获取所有市场数据

  return (
    <div className={'space-y-6'}>
      <h2 className="text-2xl font-bold">Available Markets</h2>
      {markets.isLoading ? (
        <div className="flex justify-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : markets.data?.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {markets.data.map((market) => (
            <Card
              key={market.publicKey.toString()}
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => selectMarket(market.publicKey)}
            >
              <CardHeader>
                <CardTitle>Market</CardTitle>
                <CardDescription>
                  <ExplorerLink path={`account/${market.publicKey}`} label={ellipsify(market.publicKey.toString())} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>Base:</strong> {ellipsify(market.account.baseMint.toString())}
                </p>
                <p className="text-sm">
                  <strong>Quote:</strong> {ellipsify(market.account.quoteMint.toString())}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <h3 className={'text-xl'}>No Markets Found</h3>
          <p className="text-muted-foreground">Create a market above to get started.</p>
        </div>
      )}
    </div>
  )
}

// --- 组件 3: 交易界面的主容器 ---
export function TradingView({ market }: { market: PublicKey }) {
  // 定义交易视图组件
  const { marketQuery, bidsQuery, asksQuery, openOrdersQuery, matchOrdersMutation } = useMarket({
    // 获取市场相关数据和操作
    market,
  })

  if (marketQuery.isLoading) {
    // 如果市场数据正在加载
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Order Matching</CardTitle>
            <CardDescription>Anyone can crank the market by matching the best bid and ask.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => matchOrdersMutation.mutate({ matchLimit: new BN(5) })}
              disabled={matchOrdersMutation.isPending}
            >
              {matchOrdersMutation.isPending ? 'Matching...' : 'Match Top Orders (Crank)'}
            </Button>
          </CardContent>
        </Card>
        <OrderBookDisplay
          bids={bidsQuery.data}
          asks={asksQuery.data}
          baseDecimals={marketQuery.data?.baseDecimals ?? 0}
        />
        <NewOrderForm market={market} />
      </div>
      <div className="md:col-span-1">
        <UserPanel market={market} openOrders={openOrdersQuery.data} bids={bidsQuery.data} asks={asksQuery.data} />
      </div>
    </div>
  )
}

// --- 组件 4: 订单簿 (买卖盘) ---
function OrderBookDisplay({ bids, asks, baseDecimals }: { bids: any; asks: any; baseDecimals: number }) {
  // 定义订单簿显示组件
  const PRICE_SCALE = 1_000_000 // 定义价格缩放因子
  const SENTINEL = 4294967295 // 定义哨兵值

  const parseOrderBook = (book: any) => {
    // 定义解析订单簿的函数
    if (!book || book.head === SENTINEL) return [] // 如果订单簿为空或头部为哨兵值，返回空数组
    const orders = [] // 初始化订单数组
    let currentIndex = book.head // 设置当前索引为头部
    while (currentIndex !== SENTINEL) {
      // 循环直到遇到哨兵值
      const node = book.nodes[currentIndex] // 获取当前节点

      if (!node.tag.orderNode) {
        // 检查节点是否为订单节点
        currentIndex = node.next // 移动到下一个节点
        continue // 跳过非订单节点
      }

      orders.push({
        // 添加订单到数组
        price: node.order.price.toNumber() / PRICE_SCALE, // 转换价格
        quantity: node.order.baseQty.toNumber() / 10 ** baseDecimals, // 转换数量
      })
      currentIndex = node.next // 移动到下一个节点
      if (orders.length >= book.nodes.length) break // 防止无限循环
    }
    return orders // 返回解析后的订单数组
  }

  const bidOrders = useMemo(() => parseOrderBook(bids), [bids, baseDecimals]) // 缓存买单数据
  const askOrders = useMemo(() => parseOrderBook(asks), [asks, baseDecimals]) // 缓存卖单数据

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Book</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-green-500 mb-2">Bids</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bidOrders.map((o, i) => (
                <TableRow key={i}>
                  <TableCell className="text-green-500">{o.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{o.quantity.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-red-500 mb-2">Asks</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {askOrders.map((o, i) => (
                <TableRow key={i}>
                  <TableCell className="text-red-500">{o.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{o.quantity.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// --- 组件 5: 新订单表单 ---
function NewOrderForm({ market }: { market: PublicKey }) {
  // 定义新订单表单组件
  const { marketQuery, newLimitOrderMutation } = useMarket({ market }) // 获取市场数据和创建限价订单函数
  const [price, setPrice] = useState('') // 定义价格状态
  const [quantity, setQuantity] = useState('') // 定义数量状态
  const [side, setSide] = useState<'bid' | 'ask'>('bid') // 定义订单方向状态

  const handleSubmit = () => {
    // 定义表单提交处理函数
    const marketData = marketQuery.data // 获取市场数据
    if (!marketData) return // 如果没有市场数据，返回

    const scaledPrice = new BN(parseFloat(price) * 1_000_000) // 缩放价格
    const baseQuantity = new BN(parseFloat(quantity) * 10 ** marketData.baseDecimals) // 缩放数量

    newLimitOrderMutation.mutate({ side, price: scaledPrice, quantity: baseQuantity }) // 调用创建限价订单函数
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place Order</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={side} onValueChange={(v) => setSide(v as 'bid' | 'ask')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bid">Buy</TabsTrigger>
            <TabsTrigger value="ask">Sell</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={newLimitOrderMutation.isPending || !price || !quantity}
            className={`w-full ${side === 'bid' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {side === 'bid' ? 'Place Buy Order' : 'Place Sell Order'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --- 组件 6: 用户面板 ---
function UserPanel({ market, openOrders, bids, asks }: { market: PublicKey; openOrders: any; bids: any; asks: any }) {
  // 定义用户面板组件
  const { marketQuery, cancelLimitOrderMutation, settleFundsMutation, closeOpenOrdersMutation } = useMarket({ market }) // 获取市场数据和操作函数
  const { baseDecimals = 0, quoteDecimals = 0 } = marketQuery.data || {} // 获取基础和报价代币精度

  const canClose = // 判断是否可以关闭账户
    openOrders &&
    openOrders.baseTokenFree.isZero() &&
    openOrders.baseTokenLocked.isZero() &&
    openOrders.quoteTokenFree.isZero() &&
    openOrders.quoteTokenLocked.isZero()

  const userOrders = useMemo(() => {
    // 缓存用户订单数据
    console.log('--- Recalculating User Orders ---') // 诊断日志：开始重新计算用户订单
    console.log("Input 'openOrders' data:", openOrders) // 打印openOrders数据
    console.log("Input 'bids' data:", bids) // 打印bids数据

    if (!openOrders || (!bids && !asks)) {
      // 如果没有openOrders或订单簿数据
      return [] // 返回空数组
    }

    const activeOrderIds = new Set<string>() // 初始化活跃订单ID集合
    openOrders.isInitialized.forEach((isInit: boolean, index: number) => {
      // 遍历初始化状态
      if (isInit) {
        // 如果订单已初始化
        activeOrderIds.add(openOrders.orderIds[index].toString()) // 添加订单ID到集合
      }
    })

    console.log('Active Order IDs from your account:', activeOrderIds) // 诊断日志：打印活跃订单ID

    if (activeOrderIds.size === 0) {
      // 如果没有活跃订单
      return [] // 返回空数组
    }

    const orders: any[] = [] // 初始化订单数组
    const SENTINEL = 4294967295 // 定义哨兵值

    const findOrdersInBook = (book: any, side: 'bid' | 'ask') => {
      // 定义查找订单簿中的订单函数
      if (!book || book.head === SENTINEL) return // 如果订单簿为空或头部为哨兵值，返回

      let currentIndex = book.head // 设置当前索引为头部
      let logCount = 0 // 初始化日志计数器
      while (currentIndex !== SENTINEL && activeOrderIds.size > 0) {
        // 循环直到遇到哨兵值或无活跃订单
        const node = book.nodes[currentIndex] // 获取当前节点

        if (logCount < 5) {
          // 限制日志输出
          console.log(`Inspecting node in '${side}' book at index ${currentIndex}. Tag object:`, node.tag) // 诊断日志：打印节点信息
        }
        logCount++ // 增加日志计数

        if (!node.tag.orderNode) {
          // 检查节点是否为订单节点
          currentIndex = node.next // 移动到下一个节点
          continue // 跳过非订单节点
        }

        const orderIdString = node.order.orderId.toString() // 获取订单ID字符串

        if (activeOrderIds.has(orderIdString)) {
          // 如果订单ID在活跃订单中
          console.log(`SUCCESS: Found matching order ID ${orderIdString} in the '${side}' book.`) // 诊断日志：找到匹配订单
          orders.push({
            // 添加订单到数组
            id: node.order.orderId, // 订单ID
            side, // 订单方向
            price: node.order.price.toNumber() / 1_000_000, // 转换价格
            quantity: node.order.baseQty.toNumber() / 10 ** baseDecimals, // 转换数量
          })
          activeOrderIds.delete(orderIdString) // 从活跃订单中移除
        }
        currentIndex = node.next // 移动到下一个节点
      }
    }

    findOrdersInBook(bids, 'bid') // 查找买单
    findOrdersInBook(asks, 'ask') // 查找卖单

    console.log('--- Calculation Finished ---') // 诊断日志：计算完成
    return orders.sort((a, b) => (a.price > b.price ? -1 : 1)) // 返回按价格排序的订单
  }, [openOrders, bids, asks, baseDecimals])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Info</CardTitle>
      </CardHeader>
      <CardContent>
        <h3 className="font-semibold mb-2">Balances</h3>
        {openOrders ? (
          <div className="text-sm space-y-1">
            <p>Base Free: {(openOrders.baseTokenFree.toNumber() / 10 ** baseDecimals).toFixed(4)}</p>
            <p>Base Locked: {(openOrders.baseTokenLocked.toNumber() / 10 ** baseDecimals).toFixed(4)}</p>
            <p>Quote Free: {(openOrders.quoteTokenFree.toNumber() / 10 ** quoteDecimals).toFixed(2)}</p>
            <p>Quote Locked: {(openOrders.quoteTokenLocked.toNumber() / 10 ** quoteDecimals).toFixed(2)}</p>
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() => settleFundsMutation.mutate()}
              disabled={settleFundsMutation.isPending}
            >
              {settleFundsMutation.isPending ? 'Settling...' : 'Settle Funds'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No OpenOrders account found for this market. Place an order to create one.
          </p>
        )}
        <hr className="my-4" />
        <h3 className="font-semibold mb-2">Open Orders</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Side</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userOrders.length > 0 ? (
              userOrders.map((order) => (
                <TableRow key={order.id.toString()}>
                  <TableCell className={order.side === 'bid' ? 'text-green-500' : 'text-red-500'}>
                    {order.side.toUpperCase()}
                  </TableCell>
                  <TableCell>{order.price.toFixed(2)}</TableCell>
                  <TableCell>{order.quantity.toFixed(4)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelLimitOrderMutation.mutate({ orderId: order.id })}
                    >
                      Cancel
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No open orders
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <hr className="my-4" />
        <h3 className="font-semibold mb-2">Account Management</h3>
        {openOrders ? (
          <div>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                if (
                  window.confirm(
                    'Are you sure you want to close this account? This action is irreversible and will return the rent exemption SOL to your wallet.',
                  )
                ) {
                  closeOpenOrdersMutation.mutate()
                }
              }}
              disabled={!canClose || closeOpenOrdersMutation.isPending}
            >
              {closeOpenOrdersMutation.isPending ? 'Closing...' : 'Close OpenOrders Account'}
            </Button>
            {!canClose && (
              <p className="text-xs text-muted-foreground mt-2">
                You can only close this account after all funds are settled and all orders are cancelled.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No OpenOrders account to manage.</p>
        )}
      </CardContent>
    </Card>
  )
}

// --- 组件 7: 市场管理员面板 ---
export function MarketAdminPanel({ market: marketKey }: { market: PublicKey }) {
  // 定义市场管理员面板组件
  const { publicKey: owner } = useWallet() // 获取用户公钥
  const { marketQuery, setPauseMutation, setFeesMutation } = useMarket({ market: marketKey }) // 获取市场数据和操作函数
  const market = marketQuery.data // 获取市场数据

  const [makerFee, setMakerFee] = useState('') // 定义做市商费用状态
  const [takerFee, setTakerFee] = useState('') // 定义接受者费用状态

  useMemo(() => {
    // 使用useMemo更新费用状态
    if (market) {
      // 如果市场数据存在
      setMakerFee(market.makerFeeBps.toString()) // 设置做市商费用
      setTakerFee(market.takerFeeBps.toString()) // 设置接受者费用
    }
  }, [market])

  const isAuthority = useMemo(() => {
    // 判断用户是否为市场权限所有者
    if (!owner || !market) return false // 如果没有用户或市场数据，返回false
    return market.authority.equals(owner) // 检查是否为权限所有者
  }, [owner, market])

  if (marketQuery.isLoading) {
    // 如果市场数据正在加载
    return (
      <div className="flex justify-center">
        <span className="loading loading-spinner"></span>
      </div>
    )
  }

  if (!isAuthority) {
    // 如果用户不是权限所有者
    return null // 返回空
  }

  const handleFeeSubmit = () => {
    // 定义费用提交处理函数
    const makerFeeBps = parseInt(makerFee, 10) // 解析做市商费用
    const takerFeeBps = parseInt(takerFee, 10) // 解析接受者费用
    if (isNaN(makerFeeBps) || isNaN(takerFeeBps) || makerFeeBps > 10000 || takerFeeBps > 10000) {
      // 检查费用有效性
      toast.error('Fees must be valid numbers between 0 and 10000.') // 显示错误提示
      return
    }
    setFeesMutation.mutate({ makerFeeBps, takerFeeBps }) // 调用设置费用函数
  }

  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <CardTitle>Admin Controls</CardTitle>
        <CardDescription>Manage market settings. Only visible to the market authority.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <h3 className="font-semibold">Market Status</h3>
            <p className="text-sm text-muted-foreground">
              Currently:{' '}
              {market?.paused ? (
                <span className="font-bold text-red-500">Paused</span>
              ) : (
                <span className="font-bold text-green-500">Active</span>
              )}
            </p>
          </div>
          <Button
            variant="default"
            onClick={() => setPauseMutation.mutate(!market?.paused)}
            disabled={setPauseMutation.isPending}
          >
            {setPauseMutation.isPending ? 'Updating...' : market?.paused ? 'Resume Market' : 'Pause Market'}
          </Button>
        </div>
        <div className="space-y-4 p-4 border rounded-lg">
          <h3 className="font-semibold">Fee Configuration (BPS)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="makerFee">Maker Fee (BPS)</Label>
              <Input id="makerFee" type="number" value={makerFee} onChange={(e) => setMakerFee(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="takerFee">Taker Fee (BPS)</Label>
              <Input id="takerFee" type="number" value={takerFee} onChange={(e) => setTakerFee(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleFeeSubmit} disabled={setFeesMutation.isPending}>
            {setFeesMutation.isPending ? 'Updating Fees...' : 'Update Fees'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
