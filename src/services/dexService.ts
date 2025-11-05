import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";

const SOLANA_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_API = "https://quote-api.jup.ag/v6";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const BIRDEYE_API = "https://public-api.birdeye.so/defi";

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
              'Accept': 'application/json',
              'User-Agent': 'TradingBot/1.0'
            }
          }
        );

        console.log(`✅ DexScreener tokens endpoint:`, {
          hasPairs: !!response.data?.pairs,
          pairCount: response.data?.pairs?.length || 0
        });

        // If no pairs found, try search endpoint (for PumpSwap/PumpFun tokens)
        if (!response.data?.pairs || response.data.pairs.length === 0) {
          console.log('🔄 No pairs found, trying search endpoint...');
          response = await axios.get(
            `${DEXSCREENER_API}/search/?q=${tokenAddress}`,
            { 
              timeout: 15000,
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'TradingBot/1.0'
              }
            }
          );
          
          console.log(`✅ Search endpoint:`, {
            hasPairs: !!response.data?.pairs,
            pairCount: response.data?.pairs?.length || 0
          });
        }

        if (response.data?.pairs && response.data.pairs.length > 0) {
          // Filter for Solana pairs and get the one with highest liquidity
          const solanaPairs = response.data.pairs.filter((p: any) => p.chainId === 'solana');
          
          if (solanaPairs.length === 0) {
            console.log('❌ No Solana pairs found');
            throw new Error('No Solana pairs');
          }

          const pair = solanaPairs.sort((a: any, b: any) => 
            parseFloat(b.liquidity?.usd || '0') - parseFloat(a.liquidity?.usd || '0')
          )[0];
          
          const token = pair.baseToken;

          console.log(`💎 Found: ${token.symbol} on ${pair.dexId}, Liquidity: $${pair.liquidity?.usd || 0}`);

          // Calculate burn percentage if LP is burned
          const burn = pair.liquidity?.burnt
            ? (parseFloat(pair.liquidity.burnt) /
                parseFloat(pair.liquidity.base || "1")) *
              100
            : 0;

          return {
            address: tokenAddress,
            symbol: token.symbol || 'UNKNOWN',
            name: token.name || token.symbol || 'Unknown Token',
            decimals: 9, // Most Solana tokens use 9
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
          };
        }
      } catch (dexError: any) {
        console.warn('⚠️ DexScreener failed:', dexError.message);
      }

      // If DexScreener fails, try Jupiter token list as fallback
      console.log('🔄 Trying Jupiter token list...');
      const jupiterToken = await this.getTokenFromJupiter(tokenAddress);
      if (jupiterToken) {
        return jupiterToken;
      }

      // If all else fails, create a basic token info from on-chain data
      console.log('🔄 Trying on-chain metadata...');
      const basicInfo = await this.getBasicTokenInfo(tokenAddress);
      if (basicInfo) {
        return basicInfo;
      }

      console.error('❌ All token info sources failed');
      return null;

    } catch (error) {
      console.error("❌ Failed to fetch token info:", error);
      return null;
    }
  }

  async getComprehensiveTokenInfo(tokenAddress: string) {
    try {
      let response = await axios.get(
        `${DEXSCREENER_API}/tokens/${tokenAddress}`,
        { timeout: 15000 }
      );

      // Try search if no pairs found
      if (!response.data?.pairs || response.data.pairs.length === 0) {
        console.log('🔄 Trying search for comprehensive info...');
        response = await axios.get(
          `${DEXSCREENER_API}/search/?q=${tokenAddress}`,
          { timeout: 15000 }
        );
      }

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        return null;
      }

      const solanaPairs = response.data.pairs.filter((p: any) => p.chainId === 'solana');
      const pair = solanaPairs.sort((a: any, b: any) => 
        parseFloat(b.liquidity?.usd || '0') - parseFloat(a.liquidity?.usd || '0')
      )[0];
      
      return {
        address: tokenAddress,
        symbol: pair.baseToken?.symbol || 'UNKNOWN',
        name: pair.baseToken?.name || 'Unknown Token',
        price: parseFloat(pair.priceUsd || '0'),
        priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        liquidity: parseFloat(pair.liquidity?.usd || '0'),
        marketCap: parseFloat(pair.fdv || '0'),
        pairAddress: pair.pairAddress,
        exchange: pair.dexId,
        pooledSol: parseFloat(pair.liquidity?.quote || '0'),
        dexscreenerUrl: pair.url,
        decimals: 9
      };
    } catch (error) {
      console.error('Error fetching comprehensive token info:', error);
      return null;
    }
  }

  // Get token from Jupiter token list
  async getTokenFromJupiter(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const response = await axios.get(
        'https://token.jup.ag/all',
        { timeout: 10000 }
      );

      const token = response.data.find(
        (t: any) => t.address === tokenAddress
      );

      if (token) {
        console.log('✅ Found token in Jupiter list');
        return {
          address: tokenAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals || 9,
          price: 0, // Jupiter doesn't provide price
          priceChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          volume24h: 0,
        };
      }
    } catch (error) {
      console.warn('⚠️ Jupiter token list failed:', error);
    }
    return null;
  }

  // Get basic token info from on-chain metadata
  async getBasicTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const publicKey = new PublicKey(tokenAddress);
      
      // Check if it's a valid token account
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      
      if (accountInfo) {
        console.log('✅ Found token on-chain');
        return {
          address: tokenAddress,
          symbol: 'UNKNOWN',
          name: `Token ${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`,
          decimals: 9,
          price: 0,
          priceChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          volume24h: 0,
        };
      }
    } catch (error) {
      console.warn('⚠️ On-chain check failed:', error);
    }
    return null;
  }

  // Get token price from DexScreener
  async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      return tokenInfo?.price || 0;
    } catch (error) {
      console.error("Failed to fetch token price:", error);
      return 0;
    }
  }

  // Get Jupiter swap quote with better error handling
  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote | null> {
    try {
      console.log(`📊 Getting swap quote...`);
      console.log(`Input: ${inputMint}, Output: ${outputMint}, Amount: ${amount}`);
      
      const response = await axios.get(`${JUPITER_API}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount: Math.floor(amount * 1e9),
          slippageBps,
        },
        timeout: 15000,
      });

      console.log('✅ Quote received:', response.data);
      return response.data;
    } catch (error: any) {
      console.error("❌ Failed to get swap quote:", error.response?.data || error.message);
      return null;
    }
  }

  // Execute swap via Jupiter with better error handling
  async executeSwap(
    walletPrivateKey: string,
    quoteResponse: SwapQuote
  ): Promise<string | null> {
    try {
      console.log('⚡ Executing swap...');
      
      const wallet = Keypair.fromSecretKey(bs58.decode(walletPrivateKey));

      const { data: swapTransactions } = await axios.post(
        `${JUPITER_API}/swap`,
        {
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true, // Better fee handling
          prioritizationFeeLamports: 'auto', // Auto priority fee
        },
        { 
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Swap transaction received');

      const { swapTransaction } = swapTransactions;
      const transactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      transaction.sign([wallet]);

      console.log('📡 Sending transaction...');
      
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
      });

      console.log('⏳ Confirming transaction:', signature);
      
      await this.connection.confirmTransaction(signature, "confirmed");

      console.log('✅ Transaction confirmed!');
      return signature;
      
    } catch (error: any) {
      console.error("❌ Swap execution failed:", error.response?.data || error.message);
      return null;
    }
  }

  // Buy memecoin
  async buyMemecoin(
    walletPrivateKey: string,
    tokenAddress: string,
    solAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; tokensReceived: string } | null> {
    try {
      console.log(`🛒 Buying ${solAmount} SOL worth of ${tokenAddress}`);
      
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const slippageBps = slippagePercent * 100;

      const quote = await this.getSwapQuote(
        SOL_MINT,
        tokenAddress,
        solAmount,
        slippageBps
      );

      if (!quote) {
        throw new Error("Failed to get swap quote");
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
      console.error("❌ Buy memecoin failed:", error);
      return null;
    }
  }

  // Sell memecoin
  async sellMemecoin(
    walletPrivateKey: string,
    tokenAddress: string,
    tokenAmount: number,
    slippagePercent: number = 1
  ): Promise<{ signature: string; solReceived: string } | null> {
    try {
      console.log(`💰 Selling ${tokenAmount} tokens of ${tokenAddress}`);
      
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
      console.error("❌ Sell memecoin failed:", error);
      return null;
    }
  }

  // Get wallet SOL balance
  async getWalletBalance(publicKeyOrPrivate: string): Promise<number> {
    try {
      let publicKey: PublicKey;

      // Check if it's a private key or public key
      if (
        publicKeyOrPrivate.length === 44 &&
        !publicKeyOrPrivate.includes("/")
      ) {
        // It's a public key
        publicKey = new PublicKey(publicKeyOrPrivate);
      } else {
        // It's a private key, derive public key
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

  // Generate new Solana wallet
  generateWallet(): { publicKey: string; privateKey: string } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toString(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }

  // Search tokens by name/symbol
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
        }));

      console.log(`✅ Found ${tokens.length} tokens`);
      return tokens;
    } catch (error) {
      console.error("❌ Token search failed:", error);
      return [];
    }
  }

  // Get public key from private key
  getPublicKeyFromPrivate(privateKey: string): string {
    try {
      const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
      return wallet.publicKey.toString();
    } catch (error) {
      console.error("Failed to get public key:", error);
      return "";
    }
  }
}

export const dexService = new SolanaDEXService();