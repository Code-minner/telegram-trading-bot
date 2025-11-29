// src/utils/dexscreenerResolver.ts
// Resolves DexScreener pair addresses to actual token mint addresses

import axios from "axios";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

export interface ResolvedToken {
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  exchange: string;
  liquidity: number;
  price: number;
  bondingCurveProgress?: number;
  isGraduated?: boolean;
  raydiumPool?: string | null;
}

const axiosConfig = {
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }
};

/**
 * Resolves a DexScreener URL or address to the actual token mint address
 */
export async function resolveTokenAddress(input: string): Promise<ResolvedToken | null> {
  try {
    let address = input.trim();
    
    // Handle full DexScreener URLs
    if (address.includes("dexscreener.com")) {
      const match = address.match(/solana\/([a-zA-Z0-9]+)/);
      if (match) {
        address = match[1];
      }
    }
    
    address = address.split("?")[0].split("#")[0];
    
    console.log(`🔍 Resolving address: ${address}`);
    
    // =====================================================
    // STEP 1: Try DexScreener PAIRS endpoint
    // =====================================================
    try {
      console.log(`📡 [1/4] Trying DexScreener pairs endpoint...`);
      const pairResponse = await axios.get(
        `${DEXSCREENER_API}/pairs/solana/${address}`,
        axiosConfig
      );
      
      if (pairResponse.data?.pair) {
        const pair = pairResponse.data.pair;
        console.log(`✅ Found pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
        
        return {
          tokenAddress: pair.baseToken.address,
          pairAddress: pair.pairAddress,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          exchange: pair.dexId,
          liquidity: parseFloat(pair.liquidity?.usd || "0"),
          price: parseFloat(pair.priceUsd || "0"),
        };
      }
      console.log(`ℹ️ Pairs endpoint: no data`);
    } catch (e: any) {
      console.log(`ℹ️ Pairs endpoint failed: ${e.message}`);
    }
    
    // =====================================================
    // STEP 2: Try DexScreener TOKENS endpoint
    // =====================================================
    try {
      console.log(`📡 [2/4] Trying DexScreener tokens endpoint...`);
      const tokenResponse = await axios.get(
        `${DEXSCREENER_API}/tokens/${address}`,
        axiosConfig
      );
      
      const pairs = tokenResponse.data?.pairs || [];
      const solanaPairs = pairs.filter((p: any) => p.chainId === "solana");
      
      if (solanaPairs.length > 0) {
        const pair = solanaPairs.sort(
          (a: any, b: any) => parseFloat(b.liquidity?.usd || "0") - parseFloat(a.liquidity?.usd || "0")
        )[0];
        
        console.log(`✅ Found token: ${pair.baseToken.symbol}`);
        
        return {
          tokenAddress: address,
          pairAddress: pair.pairAddress,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name || pair.baseToken.symbol,
          exchange: pair.dexId,
          liquidity: parseFloat(pair.liquidity?.usd || "0"),
          price: parseFloat(pair.priceUsd || "0"),
        };
      }
      console.log(`ℹ️ Tokens endpoint: no Solana pairs`);
    } catch (e: any) {
      console.log(`ℹ️ Tokens endpoint failed: ${e.message}`);
    }
    
    // =====================================================
    // STEP 3: Try DexScreener SEARCH endpoint
    // =====================================================
    try {
      console.log(`📡 [3/4] Trying DexScreener search endpoint...`);
      const searchResponse = await axios.get(
        `${DEXSCREENER_API}/search/?q=${address}`,
        axiosConfig
      );
      
      const allPairs = searchResponse.data?.pairs || [];
      const solanaPairs = allPairs.filter((p: any) => p.chainId === "solana");
      
      console.log(`📡 Search found ${solanaPairs.length} Solana pairs`);
      
      if (solanaPairs.length > 0) {
        // Check if our address matches a pair address
        let matchingPair = solanaPairs.find((p: any) => p.pairAddress === address);
        
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
        matchingPair = solanaPairs.find((p: any) => p.baseToken.address === address);
        
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
      }
    } catch (e: any) {
      console.log(`ℹ️ Search endpoint failed: ${e.message}`);
    }
    
    // =====================================================
    // STEP 3B: Try alternative Pump.fun APIs
    // =====================================================
    console.log(`🔄 STEP 3B: Trying Pump.fun APIs...`);
    
    const pumpApis = [
      { url: `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/${address}`, name: 'herokuapp' },
      { url: `https://pump-fun-api.vercel.app/api/coin/${address}`, name: 'vercel' },
      { url: `https://frontend-api.pump.fun/coins/${address}`, name: 'pump.fun-frontend' },
      { url: `https://api.pump.fun/coins/${address}`, name: 'pump.fun-api' },
    ];
    
    for (const api of pumpApis) {
      try {
        console.log(`📡 API: ${api.name}...`);
        const response = await axios.get(api.url, { 
          timeout: 8000,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Origin': 'https://pump.fun',
            'Referer': 'https://pump.fun/',
          }
        });
        
        console.log(`✅ ${api.name} responded! Status: ${response.status}`);
        
        if (response.data?.mint) {
          console.log(`🎉 SUCCESS! Found token: ${response.data.symbol} (${response.data.mint})`);
          
          const progress = response.data.bonding_curve_progress || 0;
          const isGraduated = progress >= 100;
          
          return {
            tokenAddress: response.data.mint,
            pairAddress: response.data.bonding_curve || response.data.associated_bonding_curve || address,
            symbol: response.data.symbol || "PUMP",
            name: response.data.name || "Pump.fun Token",
            exchange: isGraduated ? "pumpswap" : "pump.fun",
            liquidity: response.data.usd_market_cap ? response.data.usd_market_cap * 0.1 : 0,
            price: response.data.price || 0,
            bondingCurveProgress: progress,
            isGraduated: isGraduated,
          };
        } else {
          console.log(`⚠️ ${api.name}: Response OK but no mint field`);
        }
      } catch (e: any) {
        const status = e.response?.status || 'NETWORK_ERROR';
        const msg = e.message || 'Unknown error';
        console.log(`❌ ${api.name} FAILED: ${status} - ${msg.slice(0, 50)}`);
      }
    }
    
    console.log(`⚠️ All Pump.fun APIs failed`);
    
    // =====================================================
    // STEP 4: Try on-chain resolution for PumpSwap pools
    // =====================================================
    try {
      console.log(`📡 [4/4] Trying on-chain resolution...`);
      
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
          console.log(`🎯 Detected PumpSwap pool!`);
          
          const data = accountInfo.data;
          
          // Scan for pump token address
          for (let offset = 0; offset <= data.length - 32; offset++) {
            try {
              const mintBytes = data.slice(offset, offset + 32);
              const possibleMint = new PublicKey(mintBytes).toBase58();
              
              if (possibleMint.endsWith('pump')) {
                console.log(`✅ Found token: ${possibleMint}`);
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
        
        // Handle Pump.fun bonding curve - scan ALL bytes for pump token
        if (owner === PUMPFUN_PROGRAM) {
          console.log(`🎯 Detected Pump.fun bonding curve!`);
          console.log(`📡 Data length: ${accountInfo.data.length}`);
          
          const data = accountInfo.data;
          
          // Scan every possible offset for a pump token
          for (let offset = 0; offset <= data.length - 32; offset++) {
            try {
              const mintBytes = data.slice(offset, offset + 32);
              const possibleMint = new PublicKey(mintBytes).toBase58();
              
              if (possibleMint.endsWith('pump')) {
                console.log(`✅ Found pump token at offset ${offset}: ${possibleMint}`);
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
          
          console.log(`ℹ️ No pump token found in bonding curve data`);
          
          // =====================================================
          // REVERSE LOOKUP: Search trending pump tokens and check their bonding curves
          // =====================================================
          console.log(`📡 Trying reverse lookup on trending tokens...`);
          
          try {
            const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
            const checkedTokens = new Set<string>();
            
            // Search for trending/recent pump tokens
            const searchTerms = ['pump', 'sol', 'meme', 'ai', 'trump', 'pepe', 'doge'];
            
            for (const term of searchTerms) {
              try {
                const searchResp = await axios.get(
                  `${DEXSCREENER_API}/search/?q=${term}`,
                  { ...axiosConfig, timeout: 5000 }
                );
                
                const pumpTokens = (searchResp.data?.pairs || [])
                  .filter((p: any) => 
                    p.chainId === "solana" && 
                    p.baseToken?.address?.endsWith('pump')
                  )
                  .slice(0, 50);
                
                for (const pair of pumpTokens) {
                  const tokenMint = pair.baseToken.address;
                  if (checkedTokens.has(tokenMint)) continue;
                  checkedTokens.add(tokenMint);
                  
                  try {
                    const [derivedBC] = PublicKey.findProgramAddressSync(
                      [Buffer.from("bonding-curve"), new PublicKey(tokenMint).toBuffer()],
                      PUMP_PROGRAM
                    );
                    
                    if (derivedBC.toBase58() === address) {
                      console.log(`✅ Found via reverse lookup: ${pair.baseToken.symbol}`);
                      return {
                        tokenAddress: tokenMint,
                        pairAddress: address,
                        symbol: pair.baseToken.symbol,
                        name: pair.baseToken.name || pair.baseToken.symbol,
                        exchange: pair.dexId || "pump.fun",
                        liquidity: parseFloat(pair.liquidity?.usd || "0"),
                        price: parseFloat(pair.priceUsd || "0"),
                      };
                    }
                  } catch {}
                }
              } catch {}
            }
            
            console.log(`📡 Checked ${checkedTokens.size} tokens, no match`);
          } catch (e) {
            console.log(`ℹ️ Reverse lookup failed`);
          }
        }
      }
    } catch (e: any) {
      console.log(`ℹ️ On-chain failed: ${e.message}`);
    }
    
    // =====================================================
    // FALLBACK: Return address as-is
    // =====================================================
    console.log(`⚠️ Could not resolve, using address as-is: ${address}`);
    
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
    console.error(`❌ Resolver error:`, error.message);
    
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

export function extractAddressFromUrl(url: string): string | null {
  const match = url.match(/dexscreener\.com\/solana\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function isDexScreenerUrl(input: string): boolean {
  return input.includes("dexscreener.com");
}

export async function getTokenMintAddress(input: string): Promise<string | null> {
  const resolved = await resolveTokenAddress(input);
  return resolved?.tokenAddress || null;
}