// src/services/pumpSwapService.ts
// For trading tokens on PumpSwap (Pump.fun's AMM) and bonding curve

import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import axios from "axios";
import bs58 from "bs58";

// PumpPortal API for PumpSwap trades
const PUMP_PORTAL_API = "https://pumpportal.fun/api";

// Pool types supported by PumpPortal
// - 'pump' = bonding curve (pre-graduation)
// - 'pump-amm' = PumpSwap AMM (post-graduation)  
// - 'raydium' = Raydium pools
// - 'auto' = Let PumpPortal detect the correct pool
export type PumpPoolType = 'pump' | 'pump-amm' | 'raydium' | 'raydium-cpmm' | 'launchlab' | 'bonk' | 'auto';

export class PumpSwapService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  // =====================================================
  // DETECT POOL TYPE FROM EXCHANGE INFO
  // =====================================================
  
  /**
   * Determines the correct pool type based on the exchange/dex info
   * @param exchange - The exchange name from DexScreener (e.g., 'pumpswap', 'pump.fun', 'raydium')
   * @returns The appropriate pool parameter for PumpPortal API
   */
  getPoolType(exchange?: string): PumpPoolType {
    if (!exchange) return 'auto';
    
    const ex = exchange.toLowerCase();
    
    // Token is on PumpSwap AMM (graduated from bonding curve)
    if (ex === 'pumpswap' || ex === 'pump-amm' || ex === 'pumpfun-amm') {
      console.log('🎯 Detected PumpSwap AMM - using pool: pump-amm');
      return 'pump-amm';
    }
    
    // Token is still on Pump.fun bonding curve (not graduated)
    if (ex === 'pump.fun' || ex === 'pump' || ex === 'pumpfun') {
      console.log('🎯 Detected Pump.fun bonding curve - using pool: pump');
      return 'pump';
    }
    
    // Token is on Raydium
    if (ex === 'raydium' || ex === 'raydium-amm') {
      console.log('🎯 Detected Raydium - using pool: raydium');
      return 'raydium';
    }
    
    if (ex === 'raydium-cpmm') {
      console.log('🎯 Detected Raydium CPMM - using pool: raydium-cpmm');
      return 'raydium-cpmm';
    }
    
    // Default to auto - let PumpPortal figure it out
    console.log(`🎯 Unknown exchange "${exchange}" - using pool: auto`);
    return 'auto';
  }

  // =====================================================
  // BUY via PumpPortal (supports PumpSwap + bonding curve)
  // =====================================================
  async buyToken(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippagePercent: number = 25,
    exchange?: string // Pass the exchange from token info for proper pool detection
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🎯 Buying via PumpPortal: ${solAmount} SOL → ${tokenMint}`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));
      
      // ✅ FIXED: Detect correct pool based on exchange
      const pool = this.getPoolType(exchange);

      console.log("📡 Requesting transaction from PumpPortal...");
      console.log("Request body:", {
        publicKey: wallet.publicKey.toBase58(),
        action: "buy",
        mint: tokenMint,
        amount: solAmount,
        denominatedInSol: "true",
        slippage: slippagePercent,
        priorityFee: 0.0005,
        pool: pool, // ✅ FIXED: Use detected pool type instead of hardcoded 'pump'
      });

      // Get trade transaction from PumpPortal
      const response = await axios.post(
        `${PUMP_PORTAL_API}/trade-local`,
        {
          publicKey: wallet.publicKey.toBase58(),
          action: "buy",
          mint: tokenMint,
          amount: solAmount,
          denominatedInSol: "true",
          slippage: slippagePercent,
          priorityFee: 0.0005,
          pool: pool, // ✅ FIXED: Dynamic pool selection
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
          responseType: 'arraybuffer', // ✅ FIX: Request raw bytes
        }
      );

      if (!response.data || response.data.length === 0) {
        throw new Error("No transaction returned from PumpPortal");
      }

      console.log("✅ Got transaction from PumpPortal, size:", response.data.byteLength || response.data.length);

      // ✅ FIX: Handle different response formats with proper TypeScript types
      let txBuf: Buffer;
      
      if (Buffer.isBuffer(response.data)) {
        // Already a Buffer
        txBuf = response.data;
      } else if (response.data instanceof ArrayBuffer) {
        // ArrayBuffer - use Uint8Array wrapper
        txBuf = Buffer.from(new Uint8Array(response.data));
      } else if (typeof response.data === 'string') {
        // Response is base64 string
        txBuf = Buffer.from(response.data, "base64");
      } else {
        // ArrayBuffer-like or typed array
        txBuf = Buffer.from(new Uint8Array(response.data));
      }
      
      // Check if buffer looks like an error message (starts with '{' or readable text)
      const firstByte = txBuf[0];
      if (firstByte === 123 || (firstByte >= 32 && firstByte <= 126)) { // '{' or printable ASCII
        const possibleError = txBuf.toString('utf8').slice(0, 200);
        if (possibleError.includes('error') || possibleError.includes('Error') || possibleError.includes('{')) {
          console.error("❌ PumpPortal returned error:", possibleError);
          throw new Error(`PumpPortal error: ${possibleError}`);
        }
      }
      let transaction: VersionedTransaction | Transaction;

      try {
        transaction = VersionedTransaction.deserialize(txBuf);
        (transaction as VersionedTransaction).sign([wallet]);
      } catch {
        transaction = Transaction.from(txBuf);
        (transaction as Transaction).sign(wallet);
      }

      console.log("📡 Sending transaction...");

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: "confirmed",
        }
      );

      console.log(`⏳ Confirming: ${signature}`);

      await this.connection.confirmTransaction(signature, "confirmed");

      console.log("✅ PumpPortal buy complete!");

      // Get token balance
      const tokenAcc = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let tokensReceived = "0";
      try {
        const balance = await this.connection.getTokenAccountBalance(tokenAcc);
        tokensReceived = balance.value.amount;
      } catch {}

      return {
        signature,
        tokensReceived,
      };
    } catch (error: any) {
      console.error("❌ PumpPortal buy failed:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  // =====================================================
  // SELL via PumpPortal
  // =====================================================
  async sellToken(
    walletPrivateKey: string,
    tokenMint: string,
    tokenAmount: number | string,
    slippagePercent: number = 25,
    exchange?: string // Pass the exchange from token info for proper pool detection
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling via PumpPortal: ${tokenAmount} tokens → SOL`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      // Convert to string if number
      const amount = typeof tokenAmount === "number" ? tokenAmount.toString() : tokenAmount;
      
      // ✅ FIXED: Detect correct pool based on exchange
      const pool = this.getPoolType(exchange);

      console.log("📡 Requesting sell transaction from PumpPortal...");
      console.log("Request body:", {
        publicKey: wallet.publicKey.toBase58(),
        action: "sell",
        mint: tokenMint,
        amount: amount,
        denominatedInSol: "false",
        slippage: slippagePercent,
        priorityFee: 0.0005,
        pool: pool,
      });

      const response = await axios.post(
        `${PUMP_PORTAL_API}/trade-local`,
        {
          publicKey: wallet.publicKey.toBase58(),
          action: "sell",
          mint: tokenMint,
          amount: amount,
          denominatedInSol: "false",
          slippage: slippagePercent,
          priorityFee: 0.0005,
          pool: pool, // ✅ FIXED: Dynamic pool selection
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
          responseType: 'arraybuffer', // ✅ FIX: Request raw bytes
        }
      );

      if (!response.data || response.data.length === 0) {
        throw new Error("No transaction returned from PumpPortal");
      }

      console.log("✅ Got sell transaction from PumpPortal, size:", response.data.byteLength || response.data.length);

      // ✅ FIX: Handle different response formats with proper TypeScript types
      let txBuf: Buffer;
      
      if (Buffer.isBuffer(response.data)) {
        txBuf = response.data;
      } else if (response.data instanceof ArrayBuffer) {
        txBuf = Buffer.from(new Uint8Array(response.data));
      } else if (typeof response.data === 'string') {
        txBuf = Buffer.from(response.data, "base64");
      } else {
        txBuf = Buffer.from(new Uint8Array(response.data));
      }
      
      // Check if buffer looks like an error message
      const firstByte = txBuf[0];
      if (firstByte === 123 || (firstByte >= 32 && firstByte <= 126)) {
        const possibleError = txBuf.toString('utf8').slice(0, 200);
        if (possibleError.includes('error') || possibleError.includes('Error') || possibleError.includes('{')) {
          console.error("❌ PumpPortal returned error:", possibleError);
          throw new Error(`PumpPortal error: ${possibleError}`);
        }
      }
      let transaction: VersionedTransaction | Transaction;

      try {
        transaction = VersionedTransaction.deserialize(txBuf);
        (transaction as VersionedTransaction).sign([wallet]);
      } catch {
        transaction = Transaction.from(txBuf);
        (transaction as Transaction).sign(wallet);
      }

      console.log("📡 Sending sell transaction...");

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      await this.connection.confirmTransaction(signature, "confirmed");

      console.log("✅ PumpPortal sell complete!");

      const solReceived = "0";

      return {
        signature,
        solReceived,
      };
    } catch (error: any) {
      console.error("❌ PumpPortal sell failed:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw error;
    }
  }

  // =====================================================
  // SIMPLIFIED BUY/SELL WITH AUTO POOL DETECTION
  // These methods use 'auto' pool for maximum compatibility
  // =====================================================
  
  async buyTokenAuto(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippagePercent: number = 25
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    return this.buyToken(walletPrivateKey, tokenMint, solAmount, slippagePercent, 'auto');
  }

  async sellTokenAuto(
    walletPrivateKey: string,
    tokenMint: string,
    tokenAmount: number | string,
    slippagePercent: number = 25
  ): Promise<{ signature: string; solReceived: string } | null> {
    return this.sellToken(walletPrivateKey, tokenMint, tokenAmount, slippagePercent, 'auto');
  }
}

// Singleton
let pumpSwapInstance: PumpSwapService | null = null;

export function getPumpSwapService(rpcUrl?: string): PumpSwapService {
  if (!pumpSwapInstance) {
    const url = rpcUrl || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    pumpSwapInstance = new PumpSwapService(url);
  }
  return pumpSwapInstance;
}