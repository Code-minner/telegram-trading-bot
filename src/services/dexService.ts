import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import axios from "axios";
import bs58 from "bs58";
import BN from 'bn.js';
import dns from 'dns';
import { promisify } from 'util';

// ✅ IMPORT RAYDIUM SERVICE (Jupiter replacement)
import { RaydiumSwapService, getRaydiumSwapService } from "./raydiumSwapService";

// Force IPv4
dns.setDefaultResultOrder('ipv4first');

const SOLANA_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

// Pump.fun constants
const PUMP_FUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_FUN_GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const PUMP_FUN_FEE_RECIPIENT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const PUMP_FUN_EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price?: number;
  priceChange24h?: number;
  marketCap?: number;
  liquidity?: number;
  volume24h?: number;
  pooledSol?: number;
  burn?: number;
  renounced?: boolean;
  freezeRevoked?: boolean;
  chartUrl?: string;
  dexscreenerUrl?: string;
  pairAddress?: string;
  exchange?: string;
  dex?: string;
  isPumpFun?: boolean;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  routePlan: any[];
}

export class SolanaDEXService {
  private connection: Connection;
  // ✅ ADD RAYDIUM SERVICE
  private raydiumSwap: RaydiumSwapService;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, "confirmed");
    // ✅ INITIALIZE RAYDIUM SERVICE
    this.raydiumSwap = getRaydiumSwapService(SOLANA_RPC);
    console.log("✅ DEX Service initialized with Raydium (Jupiter blocked)");
  }

  // Check if token is on Pump.fun
  isPumpFunToken(tokenInfo: TokenInfo | null): boolean {
    if (!tokenInfo) return false;
    
    const pumpfunExchanges = ['pumpswap', 'pump.fun', 'pump', 'raydium'];
    const isPumpExchange = pumpfunExchanges.some(ex => 
      tokenInfo.exchange?.toLowerCase().includes(ex)
    );
    
    console.log(`🔍 Token exchange: ${tokenInfo.exchange}, isPumpFun: ${isPumpExchange}`);
    return isPumpExchange;
  }

  // Check if text is a valid Solana token address
  isValidTokenAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return address.length >= 32 && address.length <= 44;
    } catch {
      return false;
    }
  }

  // Get comprehensive token info from DexScreener with better error handling
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      console.log(`🔍 Fetching token info for: ${tokenAddress}`);

      // Try DexScreener first
      try {
        let response = await axios.get(
          `${DEXSCREENER_API}/tokens/${tokenAddress}`,
          {
            timeout: 15000,
            headers: {
              Accept: "application/json",
              "User-Agent": "TradingBot/1.0",
            },
          }
        );

        console.log(`✅ DexScreener tokens endpoint:`, {
          hasPairs: !!response.data?.pairs,
          pairCount: response.data?.pairs?.length || 0,
        });

        // If no pairs found, try search endpoint (for PumpSwap/PumpFun tokens)
        if (!response.data?.pairs || response.data.pairs.length === 0) {
          console.log("🔄 No pairs found, trying search endpoint...");
          response = await axios.get(
            `${DEXSCREENER_API}/search/?q=${tokenAddress}`,
            {
              timeout: 15000,
              headers: {
                Accept: "application/json",
                "User-Agent": "TradingBot/1.0",
              },
            }
          );

          console.log(`✅ Search endpoint:`, {
            hasPairs: !!response.data?.pairs,
            pairCount: response.data?.pairs?.length || 0,
          });
        }

        if (response.data?.pairs && response.data.pairs.length > 0) {
          // Filter for Solana pairs and get the one with highest liquidity
          const solanaPairs = response.data.pairs.filter(
            (p: any) => p.chainId === "solana"
          );

          if (solanaPairs.length === 0) {
            console.log("❌ No Solana pairs found");
            throw new Error("No Solana pairs");
          }

          const pair = solanaPairs.sort(
            (a: any, b: any) =>
              parseFloat(b.liquidity?.usd || "0") -
              parseFloat(a.liquidity?.usd || "0")
          )[0];

          const token = pair.baseToken;

          console.log(
            `💎 Found: ${token.symbol} on ${pair.dexId}, Liquidity: $${
              pair.liquidity?.usd || 0
            }`
          );

          // Calculate burn percentage if LP is burned
          const burn = pair.liquidity?.burnt
            ? (parseFloat(pair.liquidity.burnt) /
                parseFloat(pair.liquidity.base || "1")) *
              100
            : 0;

          const tokenInfo: TokenInfo = {
            address: tokenAddress,
            symbol: token.symbol || "UNKNOWN",
            name: token.name || token.symbol || "Unknown Token",
            decimals: 9,
            price: parseFloat(pair.priceUsd || "0"),
            priceChange24h: parseFloat(pair.priceChange?.h24 || "0"),
            marketCap: parseFloat(pair.fdv || pair.marketCap || "0"),
            liquidity: parseFloat(pair.liquidity?.usd || "0"),
            volume24h: parseFloat(pair.volume?.h24 || "0"),
            pooledSol: parseFloat(pair.liquidity?.quote || "0"),
            burn: Math.round(burn),
            renounced: pair.info?.socials?.website === null,
            freezeRevoked: true,
            chartUrl: pair.url,
            dexscreenerUrl: `https://dexscreener.com/solana/${pair.pairAddress}`,
            pairAddress: pair.pairAddress,
            exchange: pair.dexId,
            isPumpFun: this.isPumpFunToken({ exchange: pair.dexId } as TokenInfo),
          };

          return tokenInfo;
        }
      } catch (dexError: any) {
        console.warn("⚠️ DexScreener failed:", dexError.message);
      }

      // If DexScreener fails, try to create basic token info from on-chain data
      console.log("🔄 Trying on-chain metadata...");
      const basicInfo = await this.getBasicTokenInfo(tokenAddress);
      if (basicInfo) {
        return basicInfo;
      }

      console.error("❌ All token info sources failed");
      return null;
    } catch (error) {
      console.error("❌ Failed to fetch token info:", error);
      return null;
    }
  }

  // ===========================================
  // PUMP.FUN SPECIFIC METHODS (NOW USE RAYDIUM)
  // ===========================================

  // ✅ UPDATED - Uses Raydium instead of Jupiter
  async buyPumpFunToken(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 25
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    console.log(`🎯 Trading Pump.fun/PumpSwap token via Raydium: ${tokenAddress}`);
    
    // PumpSwap graduated tokens work through Raydium
    return await this.raydiumSwap.buyToken(
      walletPrivateKey,
      tokenAddress,
      solAmount,
      slippagePercent * 100 // Convert percent to bps
    );
  }

  // ✅ UPDATED - Uses Raydium instead of Jupiter
  async sellPumpFunToken(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 5
  ): Promise<{ signature: string; solReceived: string } | null> {
    console.log(`🎯 Selling Pump.fun/PumpSwap token via Raydium: ${tokenAddress}`);
    
    return await this.raydiumSwap.sellToken(
      walletPrivateKey,
      tokenAddress,
      tokenAmount,
      slippagePercent * 100 // Convert percent to bps
    );
  }

  // ===========================================
  // MAIN TRADING METHODS (NOW USE RAYDIUM)
  // ===========================================

  // ✅ UPDATED - Uses Raydium instead of Jupiter
  async buyViaJupiter(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🛒 Buying via Raydium (Jupiter blocked): ${solAmount} SOL → ${tokenAddress}`);

      // Use Raydium instead of Jupiter
      const result = await this.raydiumSwap.buyToken(
        walletPrivateKey,
        tokenAddress,
        solAmount,
        slippagePercent * 100 // Convert percent to bps
      );

      return result;
    } catch (error: any) {
      console.error("❌ Raydium buy failed:", error);
      throw error;
    }
  }

  // ✅ UPDATED - Uses Raydium instead of Jupiter
  async sellViaJupiter(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling via Raydium (Jupiter blocked): ${tokenAmount} → SOL`);

      // Use Raydium instead of Jupiter
      const result = await this.raydiumSwap.sellToken(
        walletPrivateKey,
        tokenAddress,
        tokenAmount,
        slippagePercent * 100 // Convert percent to bps
      );

      return result;
    } catch (error: any) {
      console.error("❌ Raydium sell failed:", error);
      throw error;
    }
  }

  // ===========================================
  // UNIFIED BUY/SELL METHODS (Smart Routing)
  // ===========================================

  async buyMemecoin(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🚀 Starting smart buy for ${tokenAddress}`);
      
      // Get token info to determine routing
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      if (!tokenInfo) {
        console.log("⚠️ Could not fetch token info, proceeding with Raydium...");
      }

      // All tokens now go through Raydium (Jupiter is blocked)
      const isPumpToken = tokenInfo ? this.isPumpFunToken(tokenInfo) : false;
      const slippage = isPumpToken ? Math.max(slippagePercent, 10) : slippagePercent;
      
      console.log(`🎯 Routing to Raydium with ${slippage}% slippage`);
      
      return await this.raydiumSwap.buyToken(
        walletPrivateKey,
        tokenAddress,
        solAmount,
        slippage * 100 // Convert to bps
      );
    } catch (error: any) {
      console.error("❌ Buy failed:", error.message);
      throw error;
    }
  }

  async sellMemecoin(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`🚀 Starting smart sell for ${tokenAddress}`);
      
      // Get token info to determine slippage
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      if (!tokenInfo) {
        console.log("⚠️ Could not fetch token info, proceeding with Raydium...");
      }

      // All tokens now go through Raydium (Jupiter is blocked)
      const isPumpToken = tokenInfo ? this.isPumpFunToken(tokenInfo) : false;
      const slippage = isPumpToken ? Math.max(slippagePercent, 5) : slippagePercent;
      
      console.log(`🎯 Routing to Raydium with ${slippage}% slippage`);
      
      return await this.raydiumSwap.sellToken(
        walletPrivateKey,
        tokenAddress,
        tokenAmount,
        slippage * 100 // Convert to bps
      );
    } catch (error: any) {
      console.error("❌ Sell failed:", error.message);
      throw error;
    }
  }

  // ===========================================
  // QUOTE METHOD (NOW USES RAYDIUM)
  // ===========================================

  // ✅ UPDATED - Uses Raydium instead of Jupiter
  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote | null> {
    try {
      console.log("📊 Getting quote via Raydium (Jupiter blocked)...");
      
      const quote = await this.raydiumSwap.getSwapQuote(
        inputMint,
        outputMint,
        amount,
        slippageBps
      );
      
      if (!quote) {
        return null;
      }

      // Convert Raydium quote format to match expected SwapQuote interface
      return {
        inputMint: quote.data.inputMint,
        outputMint: quote.data.outputMint,
        inAmount: quote.data.inputAmount,
        outAmount: quote.data.outputAmount,
        priceImpactPct: quote.data.priceImpactPct,
        routePlan: quote.data.routePlan,
      };
    } catch (error: any) {
      console.error(`❌ Raydium quote failed:`, error.message);
      throw error;
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  async transferSOL(
    senderPrivateKey: string,
    recipientAddress: string,
    amountSOL: number
  ): Promise<string | null> {
    try {
      console.log(`💸 Transferring ${amountSOL} SOL to ${recipientAddress}`);

      const sender = Keypair.fromSecretKey(bs58.decode(senderPrivateKey));
      const recipient = new PublicKey(recipientAddress);
      const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sender.publicKey,
          toPubkey: recipient,
          lamports,
        })
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = sender.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [sender],
        { commitment: "confirmed", maxRetries: 3 }
      );

      console.log(`✅ Transfer successful: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error("❌ SOL transfer failed:", error.message);
      return null;
    }
  }

  async getWalletBalance(publicKeyOrPrivate: string): Promise<number> {
    try {
      let publicKey: PublicKey;

      if (
        publicKeyOrPrivate.length === 44 &&
        !publicKeyOrPrivate.includes("/")
      ) {
        publicKey = new PublicKey(publicKeyOrPrivate);
      } else {
        const wallet = Keypair.fromSecretKey(bs58.decode(publicKeyOrPrivate));
        publicKey = wallet.publicKey;
      }

      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9;
    } catch (error) {
      console.error("Failed to fetch wallet balance:", error);
      return 0;
    }
  }

  generateWallet(): { publicKey: string; privateKey: string } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toString(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    try {
      console.log(`🔍 Searching for: ${query}`);

      const response = await axios.get(
        `${DEXSCREENER_API}/search/?q=${encodeURIComponent(query)}`,
        { timeout: 15000 }
      );

      if (!response.data?.pairs) {
        return [];
      }

      const tokens: TokenInfo[] = response.data.pairs
        .filter((pair: any) => pair.chainId === "solana")
        .slice(0, 10)
        .map((pair: any) => ({
          address: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          decimals: 9,
          price: parseFloat(pair.priceUsd || "0"),
          priceChange24h: parseFloat(pair.priceChange?.h24 || "0"),
          marketCap: parseFloat(pair.fdv || "0"),
          liquidity: parseFloat(pair.liquidity?.usd || "0"),
          volume24h: parseFloat(pair.volume?.h24 || "0"),
          chartUrl: pair.url,
          dexscreenerUrl: `https://dexscreener.com/solana/${pair.pairAddress}`,
          pairAddress: pair.pairAddress,
          exchange: pair.dexId,
          isPumpFun: this.isPumpFunToken({ exchange: pair.dexId } as TokenInfo),
        }));

      console.log(`✅ Found ${tokens.length} tokens`);
      return tokens;
    } catch (error) {
      console.error("❌ Token search failed:", error);
      return [];
    }
  }

  getPublicKeyFromPrivate(privateKey: string): string {
    try {
      const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
      return wallet.publicKey.toString();
    } catch (error) {
      console.error("Failed to get public key:", error);
      return "";
    }
  }

  async getBasicTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const publicKey = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getAccountInfo(publicKey);

      if (accountInfo) {
        console.log("✅ Found token on-chain");
        return {
          address: tokenAddress,
          symbol: "UNKNOWN",
          name: `Token ${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`,
          decimals: 9,
          price: 0,
          priceChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          volume24h: 0,
          isPumpFun: false,
        };
      }
    } catch (error) {
      console.warn("⚠️ On-chain check failed:", error);
    }
    return null;
  }

  async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      return tokenInfo?.price || 0;
    } catch (error) {
      console.error("Failed to fetch token price:", error);
      return 0;
    }
  }

  async getComprehensiveTokenInfo(tokenAddress: string) {
    try {
      let response = await axios.get(
        `${DEXSCREENER_API}/tokens/${tokenAddress}`,
        { timeout: 15000 }
      );

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        console.log("🔄 Trying search for comprehensive info...");
        response = await axios.get(
          `${DEXSCREENER_API}/search/?q=${tokenAddress}`,
          { timeout: 15000 }
        );
      }

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        return null;
      }

      const solanaPairs = response.data.pairs.filter(
        (p: any) => p.chainId === "solana"
      );
      const pair = solanaPairs.sort(
        (a: any, b: any) =>
          parseFloat(b.liquidity?.usd || "0") -
          parseFloat(a.liquidity?.usd || "0")
      )[0];

      return {
        address: tokenAddress,
        symbol: pair.baseToken?.symbol || "UNKNOWN",
        name: pair.baseToken?.name || "Unknown Token",
        price: parseFloat(pair.priceUsd || "0"),
        priceChange24h: parseFloat(pair.priceChange?.h24 || "0"),
        volume24h: parseFloat(pair.volume?.h24 || "0"),
        liquidity: parseFloat(pair.liquidity?.usd || "0"),
        marketCap: parseFloat(pair.fdv || "0"),
        pairAddress: pair.pairAddress,
        exchange: pair.dexId,
        pooledSol: parseFloat(pair.liquidity?.quote || "0"),
        dexscreenerUrl: pair.url,
        decimals: 9,
        isPumpFun: this.isPumpFunToken({ exchange: pair.dexId } as TokenInfo),
      };
    } catch (error) {
      console.error("Error fetching comprehensive token info:", error);
      return null;
    }
  }
}

export const dexService = new SolanaDEXService();