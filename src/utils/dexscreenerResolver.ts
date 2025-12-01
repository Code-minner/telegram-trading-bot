// src/utils/dexscreenerResolver.ts
// Resolves DexScreener pair addresses to actual token mint addresses
// FIXED: Proper bonding curve data parsing

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
  marketCap?: number;
  pooledSol?: number;
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
    // STEP 4: On-chain resolution for bonding curves
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
        console.log(`📡 Data length: ${accountInfo.data.length}`);
        
        // =====================================================
        // Handle Pump.fun bonding curve - GET TOKEN VIA ASSOCIATED TOKEN ACCOUNTS
        // =====================================================
        if (owner === PUMPFUN_PROGRAM) {
          console.log(`🎯 Detected Pump.fun bonding curve!`);
          
          // The bonding curve holds tokens in an associated token account
          // We can find the token mint by getting the bonding curve's token accounts
          try {
            console.log(`📡 Getting token accounts for bonding curve...`);
            
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
              pubkey,
              { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
            );
            
            console.log(`📡 Found ${tokenAccounts.value.length} token accounts`);
            
            if (tokenAccounts.value.length > 0) {
              // Get the first token account's mint
              const tokenAccount = tokenAccounts.value[0];
              const parsedInfo = tokenAccount.account.data.parsed?.info;
              
              if (parsedInfo?.mint) {
                const tokenMint = parsedInfo.mint;
                console.log(`✅ Found token mint via token accounts: ${tokenMint}`);
                
                // Get FULL token info from Pump.fun APIs
                let tokenInfo = await getFullTokenInfo(tokenMint);
                
                if (tokenInfo) {
                  console.log(`✅ Got full token info: ${tokenInfo.symbol} - $${tokenInfo.price}`);
                  return {
                    tokenAddress: tokenMint,
                    pairAddress: address,
                    symbol: tokenInfo.symbol,
                    name: tokenInfo.name,
                    exchange: tokenInfo.exchange || "pump.fun",
                    liquidity: tokenInfo.liquidity,
                    price: tokenInfo.price,
                    marketCap: tokenInfo.marketCap,
                    bondingCurveProgress: tokenInfo.bondingCurveProgress,
                    pooledSol: tokenInfo.pooledSol,
                    isGraduated: tokenInfo.isGraduated || false,
                  };
                }
                
                // APIs failed - parse bonding curve data directly!
                console.log(`📊 APIs failed, parsing bonding curve data directly...`);
                const curveData = await parseBondingCurveData(connection, address);
                
                if (curveData) {
                  // Get token name from on-chain metadata
                  const metadata = await getOnChainMetadata(connection, tokenMint);
                  
                  return {
                    tokenAddress: tokenMint,
                    pairAddress: address,
                    symbol: metadata?.symbol || "PUMP",
                    name: metadata?.name || "Pump.fun Token",
                    exchange: curveData.complete ? "pumpswap" : "pump.fun",
                    liquidity: curveData.pooledSol * 200, // Rough USD estimate
                    price: curveData.priceUsd,
                    marketCap: curveData.marketCap,
                    bondingCurveProgress: curveData.bondingCurveProgress,
                    pooledSol: curveData.pooledSol,
                    isGraduated: curveData.complete,
                  };
                }
                
                // Final fallback to on-chain metadata only
                const metadata = await getOnChainMetadata(connection, tokenMint);
                
                return {
                  tokenAddress: tokenMint,
                  pairAddress: address,
                  symbol: metadata?.symbol || "PUMP",
                  name: metadata?.name || "Pump.fun Token",
                  exchange: "pump.fun",
                  liquidity: 0,
                  price: 0,
                  isGraduated: false,
                };
              }
            }
          } catch (e: any) {
            console.log(`⚠️ Token accounts lookup failed: ${e.message}`);
          }
          
          // Alternative: Use the associated bonding curve ATA
          // The associated bonding curve is derived from bonding curve + pump global + mint
          console.log(`📡 Trying to find associated bonding curve...`);
          
          try {
            // Pump.fun uses Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1 as global account
            const PUMP_GLOBAL = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
            const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
            const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
            
            // Get all accounts owned by the associated token program that reference our bonding curve
            // This is a broader search
            const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 10 });
            
            if (signatures.length > 0) {
              console.log(`📡 Found ${signatures.length} transactions, checking for token mint...`);
              
              // Get the first transaction to find the mint
              const tx = await connection.getParsedTransaction(signatures[0].signature, {
                maxSupportedTransactionVersion: 0
              });
              
              if (tx?.meta?.postTokenBalances) {
                for (const balance of tx.meta.postTokenBalances) {
                  if (balance.mint && balance.mint.endsWith('pump')) {
                    const tokenMint = balance.mint;
                    console.log(`✅ Found token mint from transaction: ${tokenMint}`);
                    
                    let tokenInfo = await getFullTokenInfo(tokenMint);
                    
                    return {
                      tokenAddress: tokenMint,
                      pairAddress: address,
                      symbol: tokenInfo?.symbol || "PUMP",
                      name: tokenInfo?.name || "Pump.fun Token",
                      exchange: tokenInfo?.exchange || "pump.fun",
                      liquidity: tokenInfo?.liquidity || 0,
                      price: tokenInfo?.price || 0,
                      marketCap: tokenInfo?.marketCap,
                      bondingCurveProgress: tokenInfo?.bondingCurveProgress,
                      pooledSol: tokenInfo?.pooledSol,
                      isGraduated: tokenInfo?.isGraduated || false,
                    };
                  }
                }
                
                // If no pump suffix, just try any mint from the transaction
                for (const balance of tx.meta.postTokenBalances) {
                  if (balance.mint) {
                    const tokenMint = balance.mint;
                    console.log(`📡 Checking mint from transaction: ${tokenMint}`);
                    
                    // Verify this mint's bonding curve matches our address
                    try {
                      const [derivedBC] = PublicKey.findProgramAddressSync(
                        [Buffer.from("bonding-curve"), new PublicKey(tokenMint).toBuffer()],
                        new PublicKey(PUMPFUN_PROGRAM)
                      );
                      
                      if (derivedBC.toBase58() === address) {
                        console.log(`✅ Verified token mint: ${tokenMint}`);
                        
                        let tokenInfo = await getFullTokenInfo(tokenMint);
                        
                        return {
                          tokenAddress: tokenMint,
                          pairAddress: address,
                          symbol: tokenInfo?.symbol || "PUMP",
                          name: tokenInfo?.name || "Pump.fun Token",
                          exchange: tokenInfo?.exchange || "pump.fun",
                          liquidity: tokenInfo?.liquidity || 0,
                          price: tokenInfo?.price || 0,
                          marketCap: tokenInfo?.marketCap,
                          bondingCurveProgress: tokenInfo?.bondingCurveProgress,
                          pooledSol: tokenInfo?.pooledSol,
                          isGraduated: tokenInfo?.isGraduated || false,
                        };
                      }
                    } catch {}
                  }
                }
              }
            }
          } catch (e: any) {
            console.log(`⚠️ Transaction lookup failed: ${e.message}`);
          }
          
          console.log(`ℹ️ Could not find token mint for bonding curve`);
        }
        
        // =====================================================
        // Handle PumpSwap AMM pools
        // =====================================================
        if (owner === PUMPSWAP_PROGRAM) {
          console.log(`🎯 Detected PumpSwap pool!`);
          
          const data = accountInfo.data;
          
          // Scan for pump token address
          for (let offset = 0; offset <= data.length - 32; offset++) {
            try {
              const mintBytes = data.slice(offset, offset + 32);
              const possibleMint = new PublicKey(mintBytes).toBase58();
              
              if (possibleMint.endsWith('pump')) {
                console.log(`✅ Found pump token: ${possibleMint}`);
                
                let tokenInfo = await getTokenInfoFromDexScreener(possibleMint);
                
                return {
                  tokenAddress: possibleMint,
                  pairAddress: address,
                  symbol: tokenInfo?.symbol || "PUMP",
                  name: tokenInfo?.name || "Pump.fun Token",
                  exchange: tokenInfo?.exchange || "pumpswap",
                  liquidity: tokenInfo?.liquidity || 0,
                  price: tokenInfo?.price || 0,
                  isGraduated: true,
                };
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      console.log(`ℹ️ On-chain failed: ${e.message}`);
    }
    
    // =====================================================
    // STEP 5: Reverse lookup via DexScreener trending
    // =====================================================
    try {
      console.log(`📡 [5/5] Trying reverse lookup on trending tokens...`);
      
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
      const checkedTokens = new Set<string>();
      
      // Search for pump tokens and check their bonding curves
      const searchTerms = ['pump', 'sol', 'meme', 'ai', 'trump', 'pepe', 'doge', 'cat', 'dog', 'moon'];
      
      for (const term of searchTerms) {
        try {
          const searchResp = await axios.get(
            `${DEXSCREENER_API}/search/?q=${term}`,
            { ...axiosConfig, timeout: 5000 }
          );
          
          const pumpTokens = (searchResp.data?.pairs || [])
            .filter((p: any) => 
              p.chainId === "solana" && 
              (p.baseToken?.address?.endsWith('pump') || p.dexId === 'pump.fun')
            )
            .slice(0, 100);
          
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

/**
 * Helper: Parse bonding curve data directly to get reserves and calculate price/progress
 * This works even when all APIs are down!
 */
async function parseBondingCurveData(connection: any, bondingCurveAddress: string): Promise<{
  virtualTokenReserves: number;
  virtualSolReserves: number;
  realTokenReserves: number;
  realSolReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
  price: number;
  priceUsd: number;
  bondingCurveProgress: number;
  pooledSol: number;
  marketCap: number;
} | null> {
  try {
    const { PublicKey } = await import("@solana/web3.js");
    const accountInfo = await connection.getAccountInfo(new PublicKey(bondingCurveAddress));
    
    if (!accountInfo || accountInfo.data.length < 49) {
      return null;
    }
    
    const data = accountInfo.data;
    
    // Pump.fun bonding curve layout:
    // Offset 0-7: Discriminator (8 bytes)
    // Offset 8-15: virtualTokenReserves (u64)
    // Offset 16-23: virtualSolReserves (u64)
    // Offset 24-31: realTokenReserves (u64)
    // Offset 32-39: realSolReserves (u64)
    // Offset 40-47: tokenTotalSupply (u64)
    // Offset 48: complete (bool)
    
    const virtualTokenReserves = Number(data.readBigUInt64LE(8));
    const virtualSolReserves = Number(data.readBigUInt64LE(16));
    const realTokenReserves = Number(data.readBigUInt64LE(24));
    const realSolReserves = Number(data.readBigUInt64LE(32));
    const tokenTotalSupply = Number(data.readBigUInt64LE(40));
    const complete = data[48] === 1;
    
    // Calculate price in SOL (virtualSolReserves / virtualTokenReserves)
    // Token has 6 decimals, SOL has 9 decimals
    const price = (virtualSolReserves / 1e9) / (virtualTokenReserves / 1e6);
    
    // Get SOL price for USD calculation (rough estimate, could fetch from API)
    const solPrice = 200; // You can replace with actual SOL price fetch
    const priceUsd = price * solPrice;
    
    // Calculate bonding curve progress
    // Initial real token reserves = 793,100,000 * 1e6
    const initialRealTokenReserves = 793100000 * 1e6;
    const tokensRemaining = realTokenReserves;
    const tokensSold = initialRealTokenReserves - tokensRemaining;
    const bondingCurveProgress = (tokensSold / initialRealTokenReserves) * 100;
    
    // Pooled SOL (real SOL in the curve)
    const pooledSol = realSolReserves / 1e9;
    
    // Market cap = price * total supply (1 billion tokens)
    const marketCap = priceUsd * 1e9;
    
    console.log(`📊 Parsed bonding curve data:`);
    console.log(`   Virtual Token Reserves: ${(virtualTokenReserves / 1e6).toLocaleString()}`);
    console.log(`   Virtual SOL Reserves: ${(virtualSolReserves / 1e9).toFixed(4)} SOL`);
    console.log(`   Real Token Reserves: ${(realTokenReserves / 1e6).toLocaleString()}`);
    console.log(`   Real SOL Reserves: ${(realSolReserves / 1e9).toFixed(4)} SOL`);
    console.log(`   Price: ${price.toFixed(12)} SOL ($${priceUsd.toFixed(8)})`);
    console.log(`   Progress: ${bondingCurveProgress.toFixed(2)}%`);
    console.log(`   Complete: ${complete}`);
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      price,
      priceUsd,
      bondingCurveProgress: Math.min(100, Math.max(0, bondingCurveProgress)),
      pooledSol,
      marketCap,
    };
  } catch (e: any) {
    console.log(`⚠️ Failed to parse bonding curve data: ${e.message}`);
    return null;
  }
}

/**
 * Helper: Get FULL token info - tries Pump.fun APIs first (for price/progress), then DexScreener
 */
async function getFullTokenInfo(tokenMint: string): Promise<{
  symbol: string;
  name: string;
  exchange: string;
  liquidity: number;
  price: number;
  marketCap?: number;
  bondingCurveProgress?: number;
  pooledSol?: number;
  isGraduated?: boolean;
} | null> {
  console.log(`📡 Getting full token info for mint: ${tokenMint}`);
  
  // Try Pump.fun APIs first - they have the best data for pump tokens
  const pumpApis = [
    { url: `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/${tokenMint}`, name: 'herokuapp' },
    { url: `https://pump-fun-api.vercel.app/api/coin/${tokenMint}`, name: 'vercel' },
    { url: `https://frontend-api.pump.fun/coins/${tokenMint}`, name: 'pump.fun-frontend' },
    { url: `https://api.pump.fun/coins/${tokenMint}`, name: 'pump.fun-api' },
  ];
  
  for (const api of pumpApis) {
    try {
      console.log(`   📡 Trying ${api.name} for token info...`);
      const response = await axios.get(api.url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://pump.fun',
          'Referer': 'https://pump.fun/',
        }
      });
      
      if (response.data) {
        const data = response.data;
        console.log(`   ✅ ${api.name} returned data!`);
        
        // Calculate bonding curve progress
        const virtualTokenReserves = data.virtual_token_reserves || 0;
        const initialVirtualTokenReserves = 1073000000 * 1e6; // 1.073B tokens
        const progress = ((initialVirtualTokenReserves - virtualTokenReserves) / (793100000 * 1e6)) * 100;
        
        // Calculate price from reserves
        let price = data.price || 0;
        if (!price && data.virtual_sol_reserves && data.virtual_token_reserves) {
          price = (data.virtual_sol_reserves / 1e9) / (data.virtual_token_reserves / 1e6);
        }
        
        // Get market cap
        const marketCap = data.usd_market_cap || (price * 1e9); // 1B supply
        
        // Pooled SOL
        const pooledSol = (data.real_sol_reserves || 0) / 1e9;
        
        return {
          symbol: data.symbol || "PUMP",
          name: data.name || "Pump.fun Token",
          exchange: data.complete ? "pumpswap" : "pump.fun",
          liquidity: pooledSol * 200, // Rough USD estimate (SOL price ~$200)
          price: price,
          marketCap: marketCap,
          bondingCurveProgress: Math.min(100, Math.max(0, progress)),
          pooledSol: pooledSol,
          isGraduated: data.complete || false,
        };
      }
    } catch (e: any) {
      console.log(`   ❌ ${api.name} failed: ${e.response?.status || e.message}`);
    }
  }
  
  // Fallback to DexScreener
  console.log(`   📡 Trying DexScreener...`);
  try {
    const response = await axios.get(
      `${DEXSCREENER_API}/tokens/${tokenMint}`,
      { ...axiosConfig, timeout: 5000 }
    );
    
    const pairs = response.data?.pairs || [];
    const solanaPairs = pairs.filter((p: any) => p.chainId === "solana");
    
    if (solanaPairs.length > 0) {
      const pair = solanaPairs.sort(
        (a: any, b: any) => parseFloat(b.liquidity?.usd || "0") - parseFloat(a.liquidity?.usd || "0")
      )[0];
      
      console.log(`   ✅ DexScreener found: ${pair.baseToken.symbol}`);
      
      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name || pair.baseToken.symbol,
        exchange: pair.dexId,
        liquidity: parseFloat(pair.liquidity?.usd || "0"),
        price: parseFloat(pair.priceUsd || "0"),
        marketCap: parseFloat(pair.marketCap || pair.fdv || "0"),
      };
    }
  } catch (e: any) {
    console.log(`   ❌ DexScreener failed: ${e.message}`);
  }
  
  // Try Jupiter token list for name/symbol
  console.log(`   📡 Trying Jupiter token list...`);
  try {
    const response = await axios.get(
      `https://tokens.jup.ag/token/${tokenMint}`,
      { timeout: 5000 }
    );
    
    if (response.data) {
      console.log(`   ✅ Jupiter found: ${response.data.symbol}`);
      return {
        symbol: response.data.symbol || "PUMP",
        name: response.data.name || "Pump.fun Token",
        exchange: "pump.fun",
        liquidity: 0,
        price: 0,
      };
    }
  } catch (e: any) {
    console.log(`   ❌ Jupiter failed: ${e.message}`);
  }
  
  return null;
}

/**
 * Helper: Get token info from DexScreener only (legacy)
 */
async function getTokenInfoFromDexScreener(tokenAddress: string): Promise<{
  symbol: string;
  name: string;
  exchange: string;
  liquidity: number;
  price: number;
} | null> {
  return getFullTokenInfo(tokenAddress);
}

/**
 * Helper: Get on-chain token metadata (name/symbol)
 */
async function getOnChainMetadata(connection: any, tokenMint: string): Promise<{
  symbol: string;
  name: string;
} | null> {
  try {
    const { PublicKey } = await import("@solana/web3.js");
    
    // Metaplex metadata program
    const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    
    // Derive metadata PDA
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM.toBuffer(),
        new PublicKey(tokenMint).toBuffer(),
      ],
      METADATA_PROGRAM
    );
    
    const metadataInfo = await connection.getAccountInfo(metadataPDA);
    
    if (metadataInfo && metadataInfo.data) {
      const data = metadataInfo.data;
      
      // Metaplex metadata has a specific layout
      // We need to find name and symbol in the data
      // The layout starts with a key (1 byte), then update_authority (32 bytes), 
      // mint (32 bytes), then name data
      
      try {
        // Skip: key (1) + update_authority (32) + mint (32) = 65 bytes
        let offset = 65;
        
        // Ensure we have enough data
        if (data.length < offset + 36) {
          console.log(`ℹ️ Metadata too short: ${data.length} bytes`);
          return null;
        }
        
        // Name: 4 bytes length prefix + up to 32 bytes of data
        const nameLen = Math.min(data.readUInt32LE(offset), 32);
        offset += 4;
        
        if (offset + nameLen > data.length) {
          return null;
        }
        
        const nameBytes = data.slice(offset, offset + nameLen);
        const name = nameBytes.toString('utf8').replace(/\0/g, '').trim();
        offset += 32; // Fixed 32 byte field
        
        // Symbol: 4 bytes length prefix + up to 10 bytes of data
        if (offset + 4 > data.length) {
          return { name: name || "Unknown", symbol: "???" };
        }
        
        const symbolLen = Math.min(data.readUInt32LE(offset), 10);
        offset += 4;
        
        if (offset + symbolLen > data.length) {
          return { name: name || "Unknown", symbol: "???" };
        }
        
        const symbolBytes = data.slice(offset, offset + symbolLen);
        const symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim();
        
        if (name || symbol) {
          console.log(`✅ Got on-chain metadata: ${name} (${symbol})`);
          return { name: name || "Unknown", symbol: symbol || "???" };
        }
      } catch (parseError: any) {
        console.log(`⚠️ Metadata parse error: ${parseError.message}`);
      }
    }
  } catch (e: any) {
    console.log(`ℹ️ Metadata lookup failed: ${e.message}`);
  }
  
  return null;
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