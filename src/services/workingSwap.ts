import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

// Raydium V4 Program ID
const RAYDIUM_V4 = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export class WorkingSwapService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async swapSolForToken(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippagePercent: number = 10
  ): Promise<{ signature: string; tokensReceived: string }> {
    try {
      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));
      const mint = new PublicKey(tokenMint);

      console.log('🔍 Finding Raydium pool...');

      // Find pool using Raydium's public API (works globally)
      const poolInfo = await this.findPoolInfo(tokenMint);

      if (!poolInfo) {
        throw new Error('No Raydium pool found. Token may not be tradeable yet.');
      }

      console.log('✅ Pool found:', poolInfo.ammId);

      // Get user token account
      const userTokenAccount = await getAssociatedTokenAddress(
        mint,
        wallet.publicKey
      );

      // Build transaction
      const transaction = new Transaction();

      // Add compute budget
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
      );

      // Create token account if needed
      const accountInfo = await this.connection.getAccountInfo(userTokenAccount);
      if (!accountInfo) {
        console.log('📝 Creating token account...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userTokenAccount,
            wallet.publicKey,
            mint
          )
        );
      }

      // Calculate swap amounts
      const amountIn = new BN(solAmount * LAMPORTS_PER_SOL);
      const minAmountOut = this.calculateMinOut(
        poolInfo,
        amountIn,
        slippagePercent
      );

      console.log('💰 Swap amounts:', {
        in: amountIn.toString(),
        minOut: minAmountOut.toString(),
      });

      // Build Raydium swap instruction
      const swapInstruction = await this.buildRaydiumSwapInstruction(
        wallet.publicKey,
        poolInfo,
        amountIn,
        minAmountOut
      );

      transaction.add(swapInstruction);

      // Send transaction
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      transaction.sign(wallet);

      console.log('📡 Sending transaction...');
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      console.log('⏳ Confirming...');
      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log('✅ Swap successful!');

      // Get final balance
      const balance = await this.connection.getTokenAccountBalance(userTokenAccount);

      return {
        signature,
        tokensReceived: balance.value.amount,
      };

    } catch (error: any) {
      console.error('❌ Swap failed:', error);
      throw error;
    }
  }

  // Find pool info from Raydium API
  private async findPoolInfo(tokenMint: string) {
    try {
      // Use Raydium's public API
      const response = await fetch(
        'https://api-v3.raydium.io/pools/info/mint?' +
        `mint1=So11111111111111111111111111111111111111112&mint2=${tokenMint}`
      );

      const data = await response.json();

      if (data.success && data.data) {
        return data.data;
      }

      return null;
    } catch (error) {
      console.error('Failed to find pool:', error);
      return null;
    }
  }

  // Calculate minimum output with slippage
  private calculateMinOut(poolInfo: any, amountIn: BN, slippagePercent: number): BN {
    // Simple calculation based on pool reserves
    const reserveIn = new BN(poolInfo.mintAmountA || '0');
    const reserveOut = new BN(poolInfo.mintAmountB || '0');

    if (reserveIn.isZero() || reserveOut.isZero()) {
      return new BN(0);
    }

    // AMM formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    const amountOut = amountIn.mul(reserveOut).div(reserveIn.add(amountIn));

    // Apply slippage
    const slippage = new BN(10000 - slippagePercent * 100);
    return amountOut.mul(slippage).div(new BN(10000));
  }

  // Build Raydium swap instruction
  private async buildRaydiumSwapInstruction(
    userPublicKey: PublicKey,
    poolInfo: any,
    amountIn: BN,
    minAmountOut: BN
  ) {
    // Raydium V4 swap instruction keys
    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(poolInfo.ammId), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.ammAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(poolInfo.ammOpenOrders), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.ammTargetOrders), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.poolCoinTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.poolPcTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumProgramId), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(poolInfo.serumMarket), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumBids), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumAsks), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumEventQueue), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumCoinVaultAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumPcVaultAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(poolInfo.serumVaultSigner), isSigner: false, isWritable: false },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
    ];

    // Instruction data
    const data = Buffer.alloc(16);
    data.writeUInt8(9, 0); // Swap instruction discriminator
    data.writeBigUInt64LE(BigInt(amountIn.toString()), 1);
    data.writeBigUInt64LE(BigInt(minAmountOut.toString()), 9);

    return {
      keys,
      programId: RAYDIUM_V4,
      data,
    };
  }
}