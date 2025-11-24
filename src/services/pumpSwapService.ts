// src/services/pumpSwapService.ts
// For trading tokens on PumpSwap (Pump.fun's AMM)

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

export class PumpSwapService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  // =====================================================
  // BUY via PumpPortal (supports PumpSwap)
  // =====================================================
  async buyToken(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippagePercent: number = 25
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🎯 Buying via PumpPortal: ${solAmount} SOL → ${tokenMint}`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      // Get trade transaction from PumpPortal
      const response = await axios.post(
        `${PUMP_PORTAL_API}/trade-local`,
        {
          publicKey: wallet.publicKey.toBase58(),
          action: "buy",
          mint: tokenMint,
          amount: solAmount * LAMPORTS_PER_SOL, // Amount in lamports
          denominatedInSol: "true",
          slippage: slippagePercent,
          priorityFee: 0.0005, // 0.0005 SOL priority fee
          pool: "auto", // Auto-detect pool (pump or raydium)
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data) {
        throw new Error("No transaction returned from PumpPortal");
      }

      console.log("✅ Got transaction from PumpPortal");

      // Deserialize and sign
      const txBuf = Buffer.from(response.data, "base64");
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
      console.error("❌ PumpPortal buy failed:", error.response?.data || error.message);
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
    slippagePercent: number = 25
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling via PumpPortal: ${tokenAmount} tokens → SOL`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      // Convert to string if number
      const amount = typeof tokenAmount === "number" ? tokenAmount.toString() : tokenAmount;

      const response = await axios.post(
        `${PUMP_PORTAL_API}/trade-local`,
        {
          publicKey: wallet.publicKey.toBase58(),
          action: "sell",
          mint: tokenMint,
          amount: amount, // Token amount in smallest units
          denominatedInSol: "false",
          slippage: slippagePercent,
          priorityFee: 0.0005,
          pool: "auto",
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data) {
        throw new Error("No transaction returned from PumpPortal");
      }

      console.log("✅ Got sell transaction from PumpPortal");

      const txBuf = Buffer.from(response.data, "base64");
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

      // Get SOL balance change (approximate)
      const solReceived = "0"; // Would need to calculate from transaction

      return {
        signature,
        solReceived,
      };
    } catch (error: any) {
      console.error("❌ PumpPortal sell failed:", error.response?.data || error.message);
      throw error;
    }
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