import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import * as fs from 'fs'
import * as os from 'os'
import path from 'path'

const RPC_URL = 'http://127.0.0.1:8899'
const YOUR_WALLET_ADDRESS = new PublicKey('6z5EypHVFrmgrDuJVQLAajRG8WgEr8uzfJWmqqcPUiWr')
const TOKEN_MINT_ADDRESS = new PublicKey('5MWfGaSgXuFADdX8wiDV55tduQDEzDdAF4MUSgUraj6i')
const AMOUNT_TO_MINT_FULL_TOKENS = 1000
const MINT_AUTHORITY_KEYPAIR_PATH = path.join(os.homedir(), '.config', 'solana', 'id.json')
const refresh = () =>
  queryClient.invalidateQueries({
    queryKey: ['order-book', { marketKey }],
  })
// --- 辅助函数 (保持不变) ---
function loadKeypairFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Keypair file not found at path: ${filePath}`)
    }
    const secretKeyString = fs.readFileSync(filePath, 'utf8')
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
    if (secretKey.length !== 64) {
      throw new Error(`Invalid secret key length. Expected 64 bytes, but got ${secretKey.length}.`)
    }
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error(`❌ Failed to load keypair from ${filePath}.`)
    if (error instanceof Error) {
      console.error(`   Reason: ${error.message}`)
    } else {
      console.error('   An unknown error occurred:', error)
    }
    process.exit(1)
  }
}

// --- 脚本主逻辑 (保持不变) ---
async function main() {
  console.log('🚀 Starting token minting script...')
  const mintAuthority = loadKeypairFromFile(MINT_AUTHORITY_KEYPAIR_PATH)
  const connection = new Connection(RPC_URL, 'confirmed')

  console.log(`🔌 Connected to cluster: ${RPC_URL}`)
  console.log(`🔑 Mint Authority: ${mintAuthority.publicKey.toBase58()}`)
  console.log(`🎯 Target Wallet: ${YOUR_WALLET_ADDRESS.toBase58()}`)
  console.log(`🌿 Token Mint: ${TOKEN_MINT_ADDRESS.toBase58()}`)

  // try-catch 块保持不变
  try {
    const mintInfo = await connection.getParsedAccountInfo(TOKEN_MINT_ADDRESS)
    if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
      throw new Error("Could not fetch mint info or it's not a parsed account.")
    }
    const onChainDecimals = mintInfo.value.data.parsed.info.decimals
    const mintTokenProgramId = mintInfo.value.owner

    console.log(`ℹ️  On-chain decimals: ${onChainDecimals}`)
    console.log(`ℹ️  Token Program ID: ${mintTokenProgramId.toBase58()}`)

    const amountRaw = BigInt(AMOUNT_TO_MINT_FULL_TOKENS) * BigInt(10 ** onChainDecimals)
    console.log(`💰 Amount (full tokens): ${AMOUNT_TO_MINT_FULL_TOKENS}`)
    console.log(`💰 Amount (raw): ${amountRaw}`)

    console.log(`\n1. Finding or creating Associated Token Account (ATA)...`)
    const destinationAta = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      TOKEN_MINT_ADDRESS,
      YOUR_WALLET_ADDRESS,
      false,
      undefined,
      undefined,
      mintTokenProgramId,
    )
    console.log(`   ✅ ATA Address: ${destinationAta.address.toBase58()}`)

    console.log(`\n2. Minting tokens...`)
    const signature = await mintTo(
      connection,
      mintAuthority,
      TOKEN_MINT_ADDRESS,
      destinationAta.address,
      mintAuthority,
      amountRaw,
      [],
      undefined,
      mintTokenProgramId,
    )

    console.log('\n✅ Mint transaction successful!')
    console.log(`   ✍️  Signature: ${signature}`)
    console.log(`   🔗 View on Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`)
  } catch (error) {
    console.error('\n❌ An error occurred:', error)
  }
}

// vvv --- 关键修改在这里 --- vvv
// 使用 IIFE 来确保我们能捕获 main 函数的成功或失败
// 并且 Node.js 进程会等待这个 Promise 完成
;(async () => {
  try {
    await main()
    console.log('\nScript finished successfully.')
    process.exit(0) // 显式地以成功状态退出
  } catch (error) {
    console.error('\nScript failed with an unhandled error:', error)
    process.exit(1) // 显式地以失败状态退出
  }
})()
