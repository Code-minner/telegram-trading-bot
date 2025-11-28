// src/utils/dexscreenerResolver.ts
// Resolves DexScreener pair addresses to actual token mint addresses

import axios from "axios";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const PUMPFUN_API = "https://frontend-api.pump.fun";

export interface ResolvedToken {
  tokenAddress: string;      // The actual token mint address (what you need for trading)
  pairAddress: string;       // The liquidity pool pair address
  symbol: string;
  name: string;
  exchange: string;
  liquidity: number;
  price: number;
  // Pump.fun specific (optional)
  bondingCurveProgress?: number;
  isGraduated?: boolean;
  raydiumPool?: string | null;
}

/**
 * Resolves a DexScreener URL or address to the actual token mint address
 * 
 * DexScreener URLs can contain either:
 * 1. A pair address (liquidity pool) - needs to be resolved to token address
 * 2. A token address - can be used directly
 * 
 * @param input - DexScreener URL or address
 * @returns The resolved token information including the mint address
 */
export async function resolveTokenAddress(input: string): Promise<ResolvedToken | null> {
  try {
    // Extract address from URL if needed
    let address = input.trim();
    
    // Handle full DexScreener URLs
    if (address.includes("dexscreener.com")) {
      const match = address.match(/solana\/([a-zA-Z0-9]+)/);
      if (match) {
        address = match[1];
      }
    }
    
    // Remove any query parameters or fragments
    address = address.split("?")[0].split("#")[0];
    
    console.log(`🔍 Resolving address: ${address}`);
    
    // =====================================================
    // STEP 1: Try DexScreener PAIRS endpoint (for pair addresses)
    // =====================================================
    const axiosConfig = {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    };
    
    try {
      console.log(`📡 [1/5] Trying DexScreener pairs endpoint...`);
      const pairResponse = await axios.get(
        `${DEXSCREENER_API}/pairs/solana/${address}`,
        axiosConfig
      );
      
      if (pairResponse.data?.pair) {
        const pair = pairResponse.data.pair;
        console.log(`✅ Found pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
        
        return {
          tokenAddress: pair.baseToken.address,  // ✅ This is what you need for trading!
          pairAddress: pair.pairAddress,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          exchange: pair.dexId,
          liquidity: parseFloat(pair.liquidity?.usd || "0"),
          price: parseFloat(pair.priceUsd || "0"),
        };
      } else {
        console.log(`ℹ️ Pairs endpoint returned no pair data`);
      }
    } catch (pairError: any) {
      console.log(`ℹ️ Pairs endpoint failed: ${pairError.message}`);
    }
    
    // =====================================================
    // STEP 2: Try DexScreener TOKENS endpoint (for token addresses)
    // =====================================================
    try {
      console.log(`📡 [2/5] Trying DexScreener tokens endpoint...`);
      const tokenResponse = await axios.get(
        `${DEXSCREENER_API}/tokens/${address}`,
        axiosConfig
      );
      
      if (tokenResponse.data?.pairs && tokenResponse.data.pairs.length > 0) {
        // Filter for Solana pairs and get the one with highest liquidity
        const solanaPairs = tokenResponse.data.pairs.filter(
          (p: any) => p.chainId === "solana"
        );
        
        console.log(`📡 Tokens endpoint found ${solanaPairs.length} Solana pairs`);
        
        if (solanaPairs.length > 0) {
          const pair = solanaPairs.sort(
            (a: any, b: any) =>
              parseFloat(b.liquidity?.usd || "0") - parseFloat(a.liquidity?.usd || "0")
          )[0];
          
          console.log(`✅ Found token: ${pair.baseToken.symbol}`);
          
          return {
            tokenAddress: address, // It was already a token address
            pairAddress: pair.pairAddress,
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name || pair.baseToken.symbol,
            exchange: pair.dexId,
            liquidity: parseFloat(pair.liquidity?.usd || "0"),
            price: parseFloat(pair.priceUsd || "0"),
          };
        }
      } else {
        console.log(`ℹ️ Tokens endpoint returned no pairs`);
      }
    } catch (tokenError: any) {
      console.log(`ℹ️ Tokens endpoint failed: ${tokenError.message}`);
    }
    
    // =====================================================
    // STEP 3: Try DexScreener SEARCH endpoint
    // =====================================================
    try {
      console.log(`📡 [3/5] Trying DexScreener search endpoint...`);
      const searchResponse = await axios.get(
        `${DEXSCREENER_API}/search/?q=${address}`,
        axiosConfig
      );
      
      const allPairs = searchResponse.data?.pairs || [];
      console.log(`📡 Search found ${allPairs.length} total pairs`);
      
      if (allPairs.length > 0) {
        const solanaPairs = allPairs.filter(
          (p: any) => p.chainId === "solana"
        );
        
        console.log(`📡 Search found ${solanaPairs.length} Solana pairs`);
        
        if (solanaPairs.length > 0) {
          // ✅ Check if our address matches the PAIR address
          let matchingPair = solanaPairs.find(
            (p: any) => p.pairAddress === address
          );
          
          if (matchingPair) {
            console.log(`✅ Found as pair address: ${matchingPair.baseToken.symbol}`);
            return {
              tokenAddress: matchingPair.baseToken.address,
              pairAddress: matchingPair.pairAddress,
              symbol: matchingPair.baseToken.symbol,
              name: matchingPair.baseToken.name || matchingPair.baseToken.symbol,
              exchange: matchingPair.dexId,
              liquidity: parseFloat(matchingPair.liquidity?.usd || "0"),
              price: parseFloat(matchingPair.priceUsd || "0"),
            };
          }
          
          // Check if it's a token address
          matchingPair = solanaPairs.find(
            (p: any) => p.baseToken.address === address
          );
          
          if (matchingPair) {
            console.log(`✅ Found as token address: ${matchingPair.baseToken.symbol}`);
            return {
              tokenAddress: address,
              pairAddress: matchingPair.pairAddress,
              symbol: matchingPair.baseToken.symbol,
              name: matchingPair.baseToken.name || matchingPair.baseToken.symbol,
              exchange: matchingPair.dexId,
              liquidity: parseFloat(matchingPair.liquidity?.usd || "0"),
              price: parseFloat(matchingPair.priceUsd || "0"),
            };
          }
          
          // Fallback to best match by liquidity
          const bestPair = solanaPairs.sort(
            (a: any, b: any) =>
              parseFloat(b.liquidity?.usd || "0") - parseFloat(a.liquidity?.usd || "0")
          )[0];
          
          console.log(`✅ Using best match: ${bestPair.baseToken.symbol}`);
          
          return {
            tokenAddress: bestPair.baseToken.address,
            pairAddress: bestPair.pairAddress,
            symbol: bestPair.baseToken.symbol,
            name: bestPair.baseToken.name || bestPair.baseToken.symbol,
            exchange: bestPair.dexId,
            liquidity: parseFloat(bestPair.liquidity?.usd || "0"),
            price: parseFloat(bestPair.priceUsd || "0"),
          };
        }
      }
    } catch (searchError: any) {
      console.log(`ℹ️ Search endpoint failed: ${searchError.message}`);
    }
    
    // =====================================================
    // STEP 4: Try Pump.fun API (for bonding curve tokens)
    // =====================================================
    try {
      console.log(`📡 [4/5] Trying Pump.fun API...`);
      const pumpResponse = await axios.get(
        `${PUMPFUN_API}/coins/${address}`,
        { 
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
        }
      );
      
      if (pumpResponse.data && pumpResponse.data.mint) {
        const pumpData = pumpResponse.data;
        console.log(`✅ Found on Pump.fun: ${pumpData.symbol}`);
        
        const progress = pumpData.bonding_curve_progress || 0;
        const isGraduated = progress >= 100 || pumpData.raydium_pool;
        
        return {
          tokenAddress: pumpData.mint,
          pairAddress: pumpData.bonding_curve || pumpData.associated_bonding_curve || address,
          symbol: pumpData.symbol || "UNKNOWN",
          name: pumpData.name || pumpData.symbol || "Unknown Token",
          exchange: isGraduated ? "pumpswap" : "pump.fun",
          liquidity: pumpData.usd_market_cap ? pumpData.usd_market_cap * 0.1 : 0,
          price: pumpData.price || 0,
          bondingCurveProgress: progress,
          isGraduated: isGraduated,
          raydiumPool: pumpData.raydium_pool || null,
        };
      }
    } catch (pumpError: any) {
      console.log(`ℹ️ Pump.fun API failed: ${pumpError.message}`);
    }
    
    // =====================================================
    // STEP 5: Try on-chain resolution for PumpSwap/Pump.fun pools
    // =====================================================
    try {
      console.log(`📡 [5/5] Trying on-chain resolution...`);
      
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
      );
      
      const pubkey = new PublicKey(address);
      const accountInfo = await connection.getAccountInfo(pubkey);
      
      if (accountInfo) {
        const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
        const PUMPFUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
        const owner = accountInfo.owner.toBase58();
        
        console.log(`📡 Account owner: ${owner}`);
        
        // Handle PumpSwap AMM pools
        if (owner === PUMPSWAP_PROGRAM) {
          console.log(`🎯 Detected PumpSwap pool address!`);
          
          const data = accountInfo.data;
          
          if (data.length >= 72) {
            const possibleOffsets = [8, 40, 72, 104];
            
            for (const offset of possibleOffsets) {
              if (data.length >= offset + 32) {
                try {
                  const mintBytes = data.slice(offset, offset + 32);
                  const possibleMint = new PublicKey(mintBytes).toBase58();
                  
                  if (possibleMint.endsWith('pump')) {
                    console.log(`✅ Found token mint from PumpSwap pool: ${possibleMint}`);
                    return {
                      tokenAddress: possibleMint,
                      pairAddress: address,
                      symbol: "PUMP",
                      name: "Pump.fun Token",
                      exchange: "pumpswap",
                      liquidity: 0,
                      price: 0,
                    };
                  }
                } catch {}
              }
            }
          }
        }
        
        // ✅ NEW: Handle Pump.fun bonding curve accounts
        if (owner === PUMPFUN_PROGRAM) {
          console.log(`🎯 Detected Pump.fun bonding curve account!`);
          
          const data = accountInfo.data;
          
          // Pump.fun bonding curve layout - token mint is at offset 8
          if (data.length >= 40) {
            try {
              // Try offset 8 first (most common for pump.fun)
              const mintBytes = data.slice(8, 40);
              const tokenMint = new PublicKey(mintBytes).toBase58();
              
              console.log(`✅ Found token mint from bonding curve: ${tokenMint}`);
              
              // Verify it looks like a valid pump.fun token (ends with 'pump')
              const exchange = tokenMint.endsWith('pump') ? 'pumpswap' : 'pump.fun';
              
              return {
                tokenAddress: tokenMint,
                pairAddress: address,
                symbol: "PUMP",
                name: "Pump.fun Token",
                exchange: exchange,
                liquidity: 0,
                price: 0,
              };
            } catch (e) {
              console.log(`ℹ️ Could not parse bonding curve data`);
            }
          }
        }
      }
    } catch (onChainError: any) {
      console.log(`ℹ️ On-chain resolution failed: ${onChainError.message}`);
    }
    
    // =====================================================
    // FALLBACK: Return address as-is
    // =====================================================
    console.log(`⚠️ Could not resolve via any API, using address directly: ${address}`);
    
    return {
      tokenAddress: address,
      pairAddress: address,
      symbol: "UNKNOWN",
      name: "Unknown Token",
      exchange: "unknown",
      liquidity: 0,
      price: 0,
    };
    
  } catch (error: any) {
    console.error(`❌ Error resolving token address:`, error.message);
    
    const address = input.includes("dexscreener.com") 
      ? (input.match(/solana\/([a-zA-Z0-9]+)/) || [])[1] || input
      : input.trim().split("?")[0].split("#")[0];
      
    return {
      tokenAddress: address,
      pairAddress: address,
      symbol: "UNKNOWN",
      name: "Unknown Token", 
      exchange: "unknown",
      liquidity: 0,
      price: 0,
    };
  }
}

/**
 * Extracts address from a DexScreener URL
 */
export function extractAddressFromUrl(url: string): string | null {
  const match = url.match(/dexscreener\.com\/solana\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Checks if the input looks like a DexScreener URL
 */
export function isDexScreenerUrl(input: string): boolean {
  return input.includes("dexscreener.com");
}

/**
 * Gets the token mint address from any input (URL, pair address, or token address)
 * This is the main function you should use in your bot
 */
export async function getTokenMintAddress(input: string): Promise<string | null> {
  const resolved = await resolveTokenAddress(input);
  return resolved?.tokenAddress || null;
}