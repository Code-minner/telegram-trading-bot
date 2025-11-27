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
    
    // Try to get pair info first (in case it's a pair address)
    try {
      const pairResponse = await axios.get(
        `${DEXSCREENER_API}/pairs/solana/${address}`,
        { timeout: 15000 }
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
      }
    } catch (pairError: any) {
      console.log(`ℹ️ Not a pair address, trying as token address...`);
    }
    
    // Try as token address
    try {
      const tokenResponse = await axios.get(
        `${DEXSCREENER_API}/tokens/${address}`,
        { timeout: 15000 }
      );
      
      if (tokenResponse.data?.pairs && tokenResponse.data.pairs.length > 0) {
        // Filter for Solana pairs and get the one with highest liquidity
        const solanaPairs = tokenResponse.data.pairs.filter(
          (p: any) => p.chainId === "solana"
        );
        
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
      }
    } catch (tokenError: any) {
      console.log(`ℹ️ Token endpoint failed, trying search...`);
    }
    
    // Try search as last resort
    try {
      const searchResponse = await axios.get(
        `${DEXSCREENER_API}/search/?q=${address}`,
        { timeout: 15000 }
      );
      
      if (searchResponse.data?.pairs && searchResponse.data.pairs.length > 0) {
        const solanaPairs = searchResponse.data.pairs.filter(
          (p: any) => p.chainId === "solana"
        );
        
        if (solanaPairs.length > 0) {
          // Find the pair that matches our address (either as pair or token)
          const matchingPair = solanaPairs.find(
            (p: any) => 
              p.pairAddress === address || 
              p.baseToken.address === address
          ) || solanaPairs[0];
          
          console.log(`✅ Found via search: ${matchingPair.baseToken.symbol}`);
          
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
      }
    } catch (searchError: any) {
      console.log(`❌ Search also failed`);
    }
    
    // ✅ NEW: Try Pump.fun API for tokens on bonding curve or recently graduated
    try {
      console.log(`🎯 Trying Pump.fun API...`);
      const pumpResponse = await axios.get(
        `${PUMPFUN_API}/coins/${address}`,
        { timeout: 15000 }
      );
      
      if (pumpResponse.data && pumpResponse.data.mint) {
        const pumpData = pumpResponse.data;
        console.log(`✅ Found on Pump.fun: ${pumpData.symbol}`);
        
        // Calculate bonding curve progress
        const progress = pumpData.bonding_curve_progress || 0;
        const isGraduated = progress >= 100 || pumpData.raydium_pool;
        
        return {
          tokenAddress: pumpData.mint,
          pairAddress: pumpData.bonding_curve || pumpData.associated_bonding_curve || address,
          symbol: pumpData.symbol || "UNKNOWN",
          name: pumpData.name || pumpData.symbol || "Unknown Token",
          exchange: isGraduated ? "pumpswap" : "pump.fun",
          liquidity: pumpData.usd_market_cap ? pumpData.usd_market_cap * 0.1 : 0, // Rough estimate
          price: pumpData.price || 0,
          // Extra pump.fun specific data
          bondingCurveProgress: progress,
          isGraduated: isGraduated,
          raydiumPool: pumpData.raydium_pool || null,
        };
      }
    } catch (pumpError: any) {
      console.log(`ℹ️ Pump.fun API failed: ${pumpError.message}`);
    }
    
    // ✅ FALLBACK: If we couldn't resolve via DexScreener API, 
    // assume it's a valid token address and return it as-is
    // This allows trading new tokens that aren't indexed yet
    console.log(`⚠️ Could not resolve via API, using address directly: ${address}`);
    
    return {
      tokenAddress: address,  // Use as-is - might be token or pair
      pairAddress: address,   // Same address
      symbol: "UNKNOWN",
      name: "Unknown Token",
      exchange: "unknown",
      liquidity: 0,
      price: 0,
    };
    
  } catch (error: any) {
    console.error(`❌ Error resolving token address:`, error.message);
    
    // ✅ Even on error, return the address as-is to allow trading attempts
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