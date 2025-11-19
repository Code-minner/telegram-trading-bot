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

const SOLANA_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_API = "https://api.jup.ag/swap/v6";
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

  constructor() {
    this.connection = new Connection(SOLANA_RPC, "confirmed");
  }

  // Check if token is on Pump.fun
  isPumpFunToken(tokenInfo: TokenInfo | null): boolean {
    if (!tokenInfo) return false;
    
    const pumpfunExchanges = ['pumpswap', 'pump.fun', 'pump'];
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

      // If DexScreener fails, try Jupiter token list as fallback
      console.log("🔄 Trying Jupiter token list...");
      const jupiterToken = await this.getTokenFromJupiter(tokenAddress);
      if (jupiterToken) {
        return jupiterToken;
      }

      // If all else fails, create a basic token info from on-chain data
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
  // PUMP.FUN SPECIFIC METHODS
  // ===========================================

  async buyPumpFunTokenDirect(
    walletPrivateKey: string,
    tokenMint: string,
    solAmount: number,
    slippagePercent: number = 10
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🎯 Direct Pump.fun buy: ${tokenMint}`);
      console.log(`💰 Amount: ${solAmount} SOL, Slippage: ${slippagePercent}%`);

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));
      const mint = new PublicKey(tokenMint);
      
      // Get bonding curve and associated token account
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), mint.toBuffer()],
        PUMP_FUN_PROGRAM
      );

      const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
        [
          bondingCurve.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const associatedUser = await getAssociatedTokenAddress(
        mint,
        wallet.publicKey,
        false
      );

      console.log('📝 Pump.fun accounts:', {
        bondingCurve: bondingCurve.toString(),
        associatedBondingCurve: associatedBondingCurve.toString(),
        associatedUser: associatedUser.toString(),
      });

      // Create transaction
      const transaction = new Transaction();

      // Add compute budget
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
      );

      // Check if user token account exists
      const accountInfo = await this.connection.getAccountInfo(associatedUser);
      
      if (!accountInfo) {
        console.log('📝 Creating associated token account...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            associatedUser,
            wallet.publicKey,
            mint
          )
        );
      }

      // Calculate amounts
      const solAmountLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      const slippageBps = slippagePercent * 100;
      
      // Get bonding curve state to calculate expected output
      const bondingCurveAccount = await this.connection.getAccountInfo(bondingCurve);
      
      let minTokensOut = new BN(0);
      if (bondingCurveAccount) {
        // Parse bonding curve data (simplified)
        // In production, you'd parse the actual bonding curve state
        // For now, we'll use a conservative estimate
        const estimatedTokens = solAmountLamports.mul(new BN(1000000)); // Rough estimate
        minTokensOut = estimatedTokens.mul(new BN(10000 - slippageBps)).div(new BN(10000));
      }

      console.log('💎 Amounts:', {
        solLamports: solAmountLamports.toString(),
        minTokensOut: minTokensOut.toString(),
      });

      // Build Pump.fun buy instruction
      const keys = [
        { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedUser, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
      ];

      // Instruction data: discriminator (8 bytes) + amount (8 bytes) + max_sol (8 bytes)
      const discriminator = Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]); // buy discriminator
      const data = Buffer.concat([
        discriminator,
        solAmountLamports.toArrayLike(Buffer, 'le', 8),
        minTokensOut.toArrayLike(Buffer, 'le', 8),
      ]);

      transaction.add({
        keys,
        programId: PUMP_FUN_PROGRAM,
        data,
      });

      // Get recent blockhash and send
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign transaction
      transaction.sign(wallet);

      console.log('📡 Sending Pump.fun transaction...');

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      console.log('⏳ Confirming Pump.fun transaction:', signature);

      // Confirm transaction
      await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      console.log('✅ Pump.fun buy successful!');

      // Get token balance to calculate tokens received
      const tokenBalance = await this.connection.getTokenAccountBalance(associatedUser);
      const tokensReceived = tokenBalance.value.amount;

      return {
        signature,
        tokensReceived,
      };
    } catch (error: any) {
      console.error('❌ Direct Pump.fun buy failed:', error);
      throw error;
    }
  }

  // ✅ SINGLE buyPumpFunToken method - no duplicates!
  async buyPumpFunToken(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 10
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🎯 Buying Pump.fun token: ${tokenAddress}`);
      console.log(`💰 Amount: ${solAmount} SOL`);

      // Try Jupiter first (for graduated tokens)
      try {
        console.log("🔄 Attempting Jupiter swap for Pump.fun token...");
        const jupiterResult = await this.buyViaJupiter(
          walletPrivateKey,
          tokenAddress,
          solAmount,
          slippagePercent
        );
        
        if (jupiterResult) {
          console.log("✅ Jupiter swap successful for Pump.fun token!");
          return jupiterResult;
        }
      } catch (jupiterError: any) {
        console.warn("⚠️ Jupiter failed, trying direct Pump.fun swap:", jupiterError.message);
      }

      // If Jupiter fails, try direct Pump.fun trading
      console.log("🎯 Attempting direct Pump.fun swap...");
      return await this.buyPumpFunTokenDirect(
        walletPrivateKey,
        tokenAddress,
        solAmount,
        slippagePercent
      );

    } catch (error: any) {
      console.error("❌ Pump.fun buy failed:", error.message);
      throw error;
    }
  }

  async sellPumpFunToken(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 5
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`🎯 Selling Pump.fun token: ${tokenAddress}`);
      
      // Try Jupiter first (supports many Pump.fun tokens that graduated)
      try {
        console.log("🔄 Attempting Jupiter swap for Pump.fun token sell...");
        const jupiterResult = await this.sellViaJupiter(
          walletPrivateKey,
          tokenAddress,
          tokenAmount,
          slippagePercent
        );
        
        if (jupiterResult) {
          console.log("✅ Jupiter sell successful for Pump.fun token!");
          return jupiterResult;
        }
      } catch (jupiterError: any) {
        console.warn("⚠️ Jupiter sell failed:", jupiterError.message);
      }

      throw new Error(
        `Cannot sell this Pump.fun token yet. ` +
        `Please trade directly on https://pump.fun`
      );

    } catch (error: any) {
      console.error("❌ Pump.fun sell failed:", error.message);
      throw error;
    }
  }

  // ===========================================
  // JUPITER METHODS
  // ===========================================

  async buyViaJupiter(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🛒 Buying via Jupiter: ${solAmount} SOL worth of ${tokenAddress}`);

      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const slippageBps = slippagePercent * 100;

      const quote = await this.getSwapQuote(
        SOL_MINT,
        tokenAddress,
        solAmount,
        slippageBps
      );

      if (!quote) {
        throw new Error("Failed to get swap quote from Jupiter");
      }

      console.log(`💎 Expected tokens: ${quote.outAmount}`);

      const signature = await this.executeSwap(walletPrivateKey, quote);

      if (!signature) {
        throw new Error("Failed to execute swap");
      }

      return {
        signature,
        tokensReceived: quote.outAmount,
      };
    } catch (error: any) {
      console.error("❌ Jupiter buy failed:", error);
      throw error;
    }
  }

  async sellViaJupiter(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling via Jupiter: ${tokenAmount} tokens`);

      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const slippageBps = slippagePercent * 100;

      const quote = await this.getSwapQuote(
        tokenAddress,
        SOL_MINT,
        tokenAmount,
        slippageBps
      );

      if (!quote) {
        throw new Error("Failed to get swap quote");
      }

      console.log(`💵 Expected SOL: ${quote.outAmount}`);

      const signature = await this.executeSwap(walletPrivateKey, quote);

      if (!signature) {
        throw new Error("Failed to execute swap");
      }

      return {
        signature,
        solReceived: quote.outAmount,
      };
    } catch (error: any) {
      console.error("❌ Jupiter sell failed:", error);
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
        throw new Error("Unable to fetch token information");
      }

      // Route based on token type
      if (this.isPumpFunToken(tokenInfo)) {
        console.log("🎯 Routing to Pump.fun handler");
        return await this.buyPumpFunToken(
          walletPrivateKey,
          tokenAddress,
          solAmount,
          Math.max(slippagePercent, 10) // Pump.fun needs higher slippage
        );
      } else {
        console.log("🌟 Routing to Jupiter handler");
        return await this.buyViaJupiter(
          walletPrivateKey,
          tokenAddress,
          solAmount,
          slippagePercent
        );
      }
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
      
      // Get token info to determine routing
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      if (!tokenInfo) {
        throw new Error("Unable to fetch token information");
      }

      // Route based on token type
      if (this.isPumpFunToken(tokenInfo)) {
        console.log("🎯 Routing to Pump.fun handler");
        return await this.sellPumpFunToken(
          walletPrivateKey,
          tokenAddress,
          tokenAmount,
          Math.max(slippagePercent, 5)
        );
      } else {
        console.log("🌟 Routing to Jupiter handler");
        return await this.sellViaJupiter(
          walletPrivateKey,
          tokenAddress,
          tokenAmount,
          slippagePercent
        );
      }
    } catch (error: any) {
      console.error("❌ Sell failed:", error.message);
      throw error;
    }
  }

  // ===========================================
  // CORE TRADING METHODS
  // ===========================================

  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote | null> {
    const endpoints = [
      "https://api.jup.ag/swap/v6",
      "https://quote-api.jup.ag/v6",
      "https://public.jupiterapi.com/v6",
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`📊 Trying Jupiter endpoint: ${endpoint}`);

        const response = await axios.get(`${endpoint}/quote`, {
          params: {
            inputMint,
            outputMint,
            amount: Math.floor(amount * LAMPORTS_PER_SOL),
            slippageBps,
            onlyDirectRoutes: false,
          },
          timeout: 8000,
          headers: {
            Accept: "application/json",
            "User-Agent": "TradingBot/1.0",
          },
        });

        console.log("✅ Quote received from:", endpoint);
        return response.data;
      } catch (error: any) {
        console.warn(`⚠️ ${endpoint} failed:`, error.message);
        if (endpoint === endpoints[endpoints.length - 1]) {
          throw new Error(`All Jupiter endpoints failed: ${error.message}`);
        }
        continue;
      }
    }

    return null;
  }

  async executeSwap(
    walletPrivateKey: string,
    quoteResponse: SwapQuote
  ): Promise<string | null> {
    try {
      console.log("⚡ Executing swap...");

      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      const { data: swapTransactions } = await axios.post(
        `${JUPITER_API}/swap`,
        {
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        },
        {
          timeout: 15000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Swap transaction received");

      const { swapTransaction } = swapTransactions;
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      transaction.sign([wallet]);

      console.log("📡 Sending transaction...");

      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
      });

      console.log("⏳ Confirming transaction:", signature);

      await this.connection.confirmTransaction(signature, "confirmed");

      console.log("✅ Transaction confirmed!");
      return signature;
    } catch (error: any) {
      console.error(
        "❌ Swap execution failed:",
        error.response?.data || error.message
      );
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

  async getTokenFromJupiter(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const response = await axios.get("https://token.jup.ag/all", {
        timeout: 10000,
      });

      const token = response.data.find((t: any) => t.address === tokenAddress);

      if (token) {
        console.log("✅ Found token in Jupiter list");
        return {
          address: tokenAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals || 9,
          price: 0,
          priceChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          volume24h: 0,
          isPumpFun: false,
        };
      }
    } catch (error) {
      console.warn("⚠️ Jupiter token list failed:", error);
    }
    return null;
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