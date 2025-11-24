// src/services/raydiumSwapService.ts
// DROP-IN REPLACEMENT FOR JUPITER - Uses Raydium API instead

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import axios from "axios";
import bs58 from "bs58";

// =====================================================
// RAYDIUM API ENDPOINTS (NOT BLOCKED LIKE JUPITER)
// =====================================================

const RAYDIUM_API = {
  QUOTE: "https://transaction-v1.raydium.io/compute/swap-base-in",
  SWAP: "https://transaction-v1.raydium.io/transaction/swap-base-in",
  PRIORITY_FEE: "https://transaction-v1.raydium.io/compute/priority-fee",
};

const NATIVE_SOL = "So11111111111111111111111111111111111111112";

// =====================================================
// TYPES
// =====================================================

interface RaydiumQuote {
  id: string;
  success: boolean;
  data: {
    swapType: "BaseIn" | "BaseOut";
    inputMint: string;
    inputAmount: string;
    outputMint: string;
    outputAmount: string;
    otherAmountThreshold: string;
    slippageBps: number;
    priceImpactPct: number;
    routePlan: Array<{
      poolId: string;
      inputMint: string;
      outputMint: string;
      feeMint: string;
      feeRate: number;
      feeAmount: string;
    }>;
  };
}

// =====================================================
// RAYDIUM SWAP SERVICE
// =====================================================

export class RaydiumSwapService {
  private connection: Connection;
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  // =====================================================
  // GET SWAP QUOTE
  // =====================================================

  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<RaydiumQuote | null> {
    try {
      console.log("📊 Getting Raydium quote...");

      const amountInLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      const url = `${RAYDIUM_API.QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=${slippageBps}&txVersion=V0`;

      console.log("🔗 Raydium quote URL:", url);

      const response = await axios.get<RaydiumQuote>(url, {
        timeout: 30000,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.data.success) {
        console.error("❌ Raydium quote failed:", response.data);
        return null;
      }

      console.log("✅ Raydium quote received:", {
        inputAmount: response.data.data.inputAmount,
        outputAmount: response.data.data.outputAmount,
        priceImpact: response.data.data.priceImpactPct,
        routes: response.data.data.routePlan.length,
      });

      return response.data;
    } catch (error: any) {
      console.error("❌ Raydium quote error:", error.message);

      if (error.code === "ENOTFOUND") {
        throw new Error(
          "Cannot reach Raydium API. Check your internet connection."
        );
      }

      throw error;
    }
  }

  // For selling - uses raw token amount (not SOL conversion)
  async getSwapQuoteRaw(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 100
  ): Promise<RaydiumQuote | null> {
    try {
      console.log("📊 Getting Raydium sell quote...");

      const url = `${RAYDIUM_API.QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=V0`;

      const response = await axios.get<RaydiumQuote>(url, {
        timeout: 30000,
      });

      if (!response.data.success) {
        return null;
      }

      console.log("✅ Raydium sell quote received");
      return response.data;
    } catch (error: any) {
      console.error("❌ Raydium quote error:", error.message);
      return null;
    }
  }

  // =====================================================
  // GET PRIORITY FEE
  // =====================================================

  async getPriorityFee(): Promise<string> {
    try {
      const response = await axios.get(RAYDIUM_API.PRIORITY_FEE, {
        timeout: 10000,
      });

      return String(response.data?.data?.default?.h || "100000");
    } catch {
      return "100000";
    }
  }

  // =====================================================
  // BUY TOKEN
  // =====================================================

  async buyToken(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippageBps: number = 100
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🛒 Buying via Raydium: ${solAmount} SOL → ${tokenMint}`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      // Step 1: Get quote
      const quote = await this.getSwapQuote(
        NATIVE_SOL,
        tokenMint,
        solAmount,
        slippageBps
      );

      if (!quote) {
        throw new Error(
          "Failed to get Raydium quote - no route found for this token"
        );
      }

      // Step 2: Get user token accounts
      const outputTokenAcc = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let isOutputAccountExist = true;
      try {
        await getAccount(this.connection, outputTokenAcc);
      } catch {
        isOutputAccountExist = false;
      }

      // Step 3: Get priority fee
      const priorityFee = await this.getPriorityFee();
      console.log("💰 Priority fee:", priorityFee);

      // Step 4: Get swap transaction from Raydium
      console.log("📡 Getting swap transaction from Raydium...");

      const swapResponse = await axios.post<{
        success: boolean;
        data: { transaction: string }[];
      }>(
        RAYDIUM_API.SWAP,
        {
          computeUnitPriceMicroLamports: priorityFee,
          swapResponse: quote,
          txVersion: "V0",
          wallet: wallet.publicKey.toBase58(),
          wrapSol: true,
          unwrapSol: false,
          inputAccount: undefined,
          outputAccount: isOutputAccountExist
            ? outputTokenAcc.toBase58()
            : undefined,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!swapResponse.data.success || !swapResponse.data.data?.length) {
        throw new Error("Failed to get swap transaction from Raydium");
      }

      console.log(`✅ Got ${swapResponse.data.data.length} transaction(s)`);

      // Step 5: Sign and send transactions
      let finalSignature = "";

      for (let i = 0; i < swapResponse.data.data.length; i++) {
        const txData = swapResponse.data.data[i];
        const txBuf = Buffer.from(txData.transaction, "base64");

        let transaction: VersionedTransaction | Transaction;
        try {
          transaction = VersionedTransaction.deserialize(txBuf);
          (transaction as VersionedTransaction).sign([wallet]);
        } catch {
          transaction = Transaction.from(txBuf);
          (transaction as Transaction).sign(wallet);
        }

        console.log(
          `📡 Sending transaction ${i + 1}/${swapResponse.data.data.length}...`
        );

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

        console.log(`✅ Transaction ${i + 1} confirmed!`);
        finalSignature = signature;
      }

      // Get final token balance
      let tokensReceived = quote.data.outputAmount;
      try {
        const balance = await this.connection.getTokenAccountBalance(
          outputTokenAcc
        );
        tokensReceived = balance.value.amount;
      } catch {}

      console.log("✅ Raydium buy complete!");

      return {
        signature: finalSignature,
        tokensReceived,
      };
    } catch (error: any) {
      console.error("❌ Raydium buy failed:", error.message);
      throw error;
    }
  }

  // =====================================================
  // SELL TOKEN
  // =====================================================

  async sellToken(
    walletPrivateKey: string,
    tokenMint: string,
    tokenAmount: number,
    slippageBps: number = 100
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling via Raydium: ${tokenAmount} tokens → SOL`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      const inputTokenAcc = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Get quote (token → SOL)
      const quote = await this.getSwapQuoteRaw(
        tokenMint,
        NATIVE_SOL,
        tokenAmount.toString(),
        slippageBps
      );

      if (!quote) {
        throw new Error("Failed to get Raydium quote for sell");
      }

      const priorityFee = await this.getPriorityFee();

      console.log("📡 Getting sell transaction from Raydium...");

      const swapResponse = await axios.post<{
        success: boolean;
        data: { transaction: string }[];
      }>(
        RAYDIUM_API.SWAP,
        {
          computeUnitPriceMicroLamports: priorityFee,
          swapResponse: quote,
          txVersion: "V0",
          wallet: wallet.publicKey.toBase58(),
          wrapSol: false,
          unwrapSol: true,
          inputAccount: inputTokenAcc.toBase58(),
          outputAccount: undefined,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!swapResponse.data.success || !swapResponse.data.data?.length) {
        throw new Error("Failed to get sell transaction from Raydium");
      }

      let finalSignature = "";

      for (let i = 0; i < swapResponse.data.data.length; i++) {
        const txData = swapResponse.data.data[i];
        const txBuf = Buffer.from(txData.transaction, "base64");

        let transaction: VersionedTransaction | Transaction;
        try {
          transaction = VersionedTransaction.deserialize(txBuf);
          (transaction as VersionedTransaction).sign([wallet]);
        } catch {
          transaction = Transaction.from(txBuf);
          (transaction as Transaction).sign(wallet);
        }

        console.log(
          `📡 Sending transaction ${i + 1}/${swapResponse.data.data.length}...`
        );

        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            maxRetries: 3,
          }
        );

        await this.connection.confirmTransaction(signature, "confirmed");

        console.log(`✅ Transaction ${i + 1} confirmed!`);
        finalSignature = signature;
      }

      const solReceived = (
        parseInt(quote.data.outputAmount) / LAMPORTS_PER_SOL
      ).toFixed(6);

      console.log("✅ Raydium sell complete!");

      return {
        signature: finalSignature,
        solReceived,
      };
    } catch (error: any) {
      console.error("❌ Raydium sell failed:", error.message);
      throw error;
    }
  }
}

// =====================================================
// SINGLETON
// =====================================================

let instance: RaydiumSwapService | null = null;

export function getRaydiumSwapService(rpcUrl?: string): RaydiumSwapService {
  if (!instance) {
    const url =
      rpcUrl ||
      process.env.SOLANA_RPC_URL ||
      process.env.HELIUS_RPC_URL ||
      "https://api.mainnet-beta.solana.com";
    instance = new RaydiumSwapService(url);
  }
  return instance;
}
