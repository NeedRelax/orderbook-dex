// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import OrderBookDexIDL from '../target/idl/order_book_dex.json'
import type { OrderBookDex } from '../target/types/order_book_dex'

// Re-export the generated IDL and type
export { OrderBookDex, OrderBookDexIDL }

// The programId is imported from the program IDL.
export const ORDERBOOKDEX_PROGRAM_ID = new PublicKey(OrderBookDexIDL.address)

// This is a helper function to get the OrderBookDex Anchor program.
export function getOrderBookDexProgram(provider: AnchorProvider, address?: PublicKey): Program<OrderBookDex> {
  return new Program(
    { ...OrderBookDexIDL, address: address ? address.toBase58() : OrderBookDexIDL.address } as OrderBookDex,
    provider,
  )
}

// This is a helper function to get the program ID for the OrderBookDex program depending on the cluster.
export function getOrderBookDexProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the OrderBookDex program on devnet and testnet.
      return new PublicKey('coUnmi3oBUtwtd9fjeAvSsJssXh5A5xyPbhpewyzRVF')
    case 'mainnet-beta':
    default:
      return ORDERBOOKDEX_PROGRAM_ID
  }
}
