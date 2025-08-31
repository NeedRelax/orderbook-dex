'use client' // 指定此文件为客户端组件

import { AppHero } from '../app-hero' // 导入AppHero组件，用于显示页面头部
import { ExplorerLink } from '../cluster/cluster-ui' // 导入ExplorerLink组件，用于显示Solana账户链接
import { WalletButton } from '../solana/solana-provider' // 导入WalletButton组件，用于钱包连接
import { Button } from '@/components/ui/button' // 导入通用Button组件
import { useState } from 'react' // 导入React的useState钩子
import { PublicKey } from '@solana/web3.js' // 导入Solana的PublicKey类
import { useWallet } from '@solana/wallet-adapter-react' // 导入Solana钱包钩子
import { MarketInitialize, MarketList, TradingView, MarketAdminPanel } from './orderBookDex-ui' // 导入订单簿DEX相关UI组件
import { useOrderBookProgram } from './orderBookDex-data-access' // 导入订单簿程序数据访问钩子
import { ellipsify } from '@/lib/utils' // 导入ellipsify工具函数，用于缩短地址显示

export default function OrderBookFeature() {
  // 定义OrderBookFeature主组件
  const { publicKey } = useWallet() // 获取当前钱包的公钥
  const { programId } = useOrderBookProgram() // 获取订单簿程序ID
  const [selectedMarket, setSelectedMarket] = useState<PublicKey | null>(null) // 定义状态用于存储当前选中的市场

  if (!publicKey) {
    // 如果用户未连接钱包
    return (
      // 返回未登录时的UI
      <div className="max-w-4xl mx-auto">
        <div className="hero py-[64px]">
          <div className="hero-content text-center">
            <WalletButton />
          </div>
        </div>
      </div>
    )
  }

  return (
    // 返回已登录时的UI
    <div>
      <AppHero title="Order Book DEX" subtitle="Create a new market or select an existing one to start trading.">
        <p className="mb-6">
          <ExplorerLink path={`account/${programId}`} label={ellipsify(programId.toString())} />
        </p>
        {selectedMarket && ( // 如果有选中的市场
          <Button variant="outline" onClick={() => setSelectedMarket(null)}>
            返回创建
          </Button>
        )}
      </AppHero>
      {selectedMarket ? ( // 如果有选中的市场
        <div className="space-y-6">
          <TradingView market={selectedMarket} />
          <MarketAdminPanel market={selectedMarket} />
        </div>
      ) : (
        // 如果没有选中的市场
        <>
          <MarketInitialize />
          <MarketList selectMarket={setSelectedMarket} />
        </>
      )}
    </div>
  )
}
