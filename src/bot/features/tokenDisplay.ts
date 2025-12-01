// bot/features/tokenDisplay.ts - COMPLETE FIXED VERSION WITH FULL PUMP.FUN DATA
import axios from "axios";
import { Context, Markup } from "telegraf";
import { dexService } from "../../services/dexService";
import * as riskManager from "../../utils/riskManager";
import * as userService from "../../services/userService";
import { resolveTokenAddress, isDexScreenerUrl, extractAddressFromUrl, ResolvedToken } from "../../utils/dexscreenerResolver";

// Extended token info type to handle all possible fields
interface MergedTokenInfo {
  address: string;
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  liquidity: number;
  marketCap?: number;
  pairAddress?: string;
  bondingCurveProgress?: number;
  pooledSol?: number;
  isGraduated?: boolean;
  priceChange24h?: number;
  volume24h?: number;
  dexscreenerUrl?: string;
  ownerAddress?: string;
  renounced?: boolean;
  freezeRevoked?: boolean;
  burn?: number;
}

/**
 * Checks if text is a valid Solana token address
 */
function isSolanaAddress(text: string): boolean {
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return solanaAddressRegex.test(text);
}

/**
 * Checks if text is a DexScreener URL
 */
function isDexScreenerLink(text: string): boolean {
  return text.includes("dexscreener.com/solana/");
}

/**
 * Get security information about the token
 */
async function getTokenSecurity(tokenAddress: string): Promise<any> {
  try {
    const tokenInfo = await dexService.getTokenInfo(tokenAddress);

    return {
      renounced: tokenInfo?.renounced || false,
      freezeRevoked: tokenInfo?.freezeRevoked || true,
      burn: tokenInfo?.burn || 0,
      pooledSol: tokenInfo?.pooledSol || 0,
    };
  } catch (error) {
    return {
      renounced: false,
      freezeRevoked: true,
      burn: 0,
      pooledSol: 0,
    };
  }
}

/**
 * Get chart image URL from DexScreener
 */
function getChartImageUrl(pairAddress: string): string {
  return `https://dd.dexscreener.com/ds-data/pairs/solana/${pairAddress}.png`;
}

/**
 * Handles token address messages - displays token info
 * ✅ NOW HANDLES: DexScreener URLs, pair addresses, bonding curves, and token addresses
 * ✅ NOW INCLUDES: Full Pump.fun data (price, progress, pooled SOL, market cap)
 * Returns true if it handled a token address, false otherwise
 */
export async function handleTokenAddressMessage(
  ctx: Context,
  text: string,
  userId: number
): Promise<boolean> {
  // Check if it's a DexScreener URL or Solana address
  const isDexUrl = isDexScreenerLink(text);
  const isAddress = isSolanaAddress(text);
  
  if (!isDexUrl && !isAddress) {
    return false;
  }

  try {
    const loadingMsg = await ctx.reply("🔍 Resolving token...");
    
    // ✅ Resolve the input to get actual token address AND full token data
    let tokenAddress: string;
    let resolvedInfo: ResolvedToken | null = null;
    
    if (isDexUrl || isAddress) {
      console.log(`🔍 Resolving input: ${text.slice(0, 50)}...`);
      
      resolvedInfo = await resolveTokenAddress(text);
      
      // Resolver always returns something now (falls back to using address as-is)
      tokenAddress = resolvedInfo!.tokenAddress;
      console.log(`✅ Resolved to token: ${tokenAddress} (${resolvedInfo!.symbol})`);
      
      // Update loading message with resolved info
      if (resolvedInfo!.symbol && resolvedInfo!.symbol !== "UNKNOWN") {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          `🔍 Found ${resolvedInfo!.symbol}! Loading details...`
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          `🔍 Checking token...`
        );
      }
    } else {
      tokenAddress = text;
    }
    
    // Get additional token info from dexService (for security info etc)
    const tokenInfo = await dexService.getTokenInfo(tokenAddress);

    // ✅ IMPORTANT: Merge resolver data with dexService data
    // Resolver data takes priority for pump.fun tokens since it queries pump APIs
    const mergedInfo: MergedTokenInfo = {
      address: tokenAddress,
      symbol: resolvedInfo?.symbol || tokenInfo?.symbol || "UNKNOWN",
      name: resolvedInfo?.name || tokenInfo?.name || "Unknown Token",
      exchange: resolvedInfo?.exchange || tokenInfo?.exchange || "unknown",
      price: resolvedInfo?.price || tokenInfo?.price || 0,
      liquidity: resolvedInfo?.liquidity || tokenInfo?.liquidity || 0,
      marketCap: resolvedInfo?.marketCap || (tokenInfo as any)?.marketCap || 0,
      pairAddress: resolvedInfo?.pairAddress || tokenInfo?.pairAddress,
      bondingCurveProgress: resolvedInfo?.bondingCurveProgress,
      pooledSol: resolvedInfo?.pooledSol,
      isGraduated: resolvedInfo?.isGraduated,
      priceChange24h: (tokenInfo as any)?.priceChange24h || 0,
      volume24h: (tokenInfo as any)?.volume24h || 0,
      dexscreenerUrl: (tokenInfo as any)?.dexscreenerUrl,
      ownerAddress: (tokenInfo as any)?.ownerAddress,
      renounced: (tokenInfo as any)?.renounced,
      freezeRevoked: (tokenInfo as any)?.freezeRevoked,
      burn: (tokenInfo as any)?.burn,
    };

    if (!mergedInfo.symbol || mergedInfo.symbol === "UNKNOWN") {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        "❌ Token not found or invalid address."
      );
      return true;
    }

    const security = await getTokenSecurity(tokenAddress);
    // Use pooledSol from resolver if available
    if (resolvedInfo?.pooledSol) {
      security.pooledSol = resolvedInfo.pooledSol;
    }
    
    const message = formatEnhancedTokenDisplay(mergedInfo, mergedInfo.price, security);

    // Try to send with chart
    let sentWithChart = false;
    const pairAddr = mergedInfo.pairAddress;
    
    if (pairAddr) {
      const chartUrls = [
        `https://dd.dexscreener.com/ds-data/pairs/solana/${pairAddr}.png`,
        `https://dd.dexscreener.com/ds-data/pairs/solana/${pairAddr}.jpg`,
        `https://api.dexscreener.com/chart/solana/${pairAddr}`,
      ];

      for (const chartUrl of chartUrls) {
        if (sentWithChart) break;

        try {
          await ctx.replyWithPhoto(
            { url: chartUrl },
            {
              caption: message,
              parse_mode: "Markdown",
              ...getEnhancedTokenMenu(tokenAddress, mergedInfo, userId),
            }
          );

          await ctx.deleteMessage(loadingMsg.message_id);
          sentWithChart = true;
        } catch (error: any) {
          console.log(`Chart failed: ${error.message}`);
        }
      }
    }

    // If chart failed, send text with link preview
    if (!sentWithChart) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        message,
        {
          parse_mode: "Markdown",
          link_preview_options: {
            is_disabled: false,
            url: `https://mevx.io/solana/${tokenAddress}`,
            prefer_large_media: true,
            show_above_text: true,
          },
          ...getEnhancedTokenMenu(tokenAddress, mergedInfo, userId),
        }
      );
    }

    return true;
  } catch (error) {
    console.error("Token display error:", error);
    await ctx.reply("❌ Error fetching token information.");
    return true;
  }
}

/**
 * Formats enhanced token information for display
 * ✅ NOW INCLUDES: Bonding curve progress, pooled SOL, proper market cap
 * ✅ FIXED: Full copyable addresses
 */
function formatEnhancedTokenDisplay(
  tokenInfo: MergedTokenInfo,
  price: number,
  security: any
): string {
  const priceChange24h = tokenInfo.priceChange24h || 0;
  const priceChangeEmoji = priceChange24h >= 0 ? "🟢" : "🔴";
  const priceChangeSign = priceChange24h >= 0 ? "+" : "";

  let message = `${tokenInfo.name || "Unknown Token"} (\`$${
    tokenInfo.symbol
  }\` - ${tokenInfo.exchange || "DEX"})\n\n`;

  // Addresses - FULL and copyable
  message += `⭐ *CA:* \`${tokenInfo.address}\`\n`;
  if (tokenInfo.pairAddress && tokenInfo.pairAddress !== tokenInfo.address) {
    message += `🎁 *LP:* \`${tokenInfo.pairAddress}\`\n\n`;
  } else {
    message += `\n`;
  }

  // Exchange
  if (tokenInfo.exchange) {
    message += `🎯 *Exchange:* ${tokenInfo.exchange}\n`;
  }

  // Price - format properly for small numbers
  if (price > 0) {
    if (price < 0.00000001) {
      message += `💰 *Token Price:* $${price.toExponential(2)}\n`;
    } else if (price < 0.0001) {
      message += `💰 *Token Price:* $${price.toFixed(10)}\n`;
    } else {
      message += `💰 *Token Price:* $${price.toFixed(8)}\n`;
    }
  } else {
    message += `💰 *Token Price:* $0.00000000\n`;
  }

  // Market data
  if (tokenInfo.marketCap && tokenInfo.marketCap > 0) {
    message += `💎 *Market Cap:* $${riskManager.formatAmount(
      tokenInfo.marketCap
    )}\n`;
  }

  if (tokenInfo.liquidity && tokenInfo.liquidity > 0) {
    message += `💧 *Liquidity:* $${riskManager.formatAmount(
      tokenInfo.liquidity
    )}\n`;
  }

  // ✅ NEW: Pooled SOL (important for pump.fun tokens)
  const pooledSol = tokenInfo.pooledSol || security.pooledSol;
  if (pooledSol && pooledSol > 0) {
    message += `🟡 *Pooled SOL:* ${pooledSol.toFixed(2)} SOL\n`;
  }

  // ✅ NEW: Bonding curve progress (for pump.fun tokens)
  if (tokenInfo.bondingCurveProgress !== undefined) {
    const progress = tokenInfo.bondingCurveProgress;
    const progressBar = generateProgressBar(progress);
    message += `📊 *Progress:* ${progress.toFixed(2)}%\n`;
    message += `|${progressBar}|\n`;
  }

  // 24h stats
  message += `${priceChangeEmoji} *24h Change:* ${priceChangeSign}${priceChange24h.toFixed(
    2
  )}%\n`;

  if (tokenInfo.volume24h && tokenInfo.volume24h > 0) {
    message += `📈 *24h Volume:* $${riskManager.formatAmount(
      tokenInfo.volume24h
    )}\n`;
  }

  // Security
  message += `\n`;
  if (security.burn > 0) {
    message += `🔥 *Burn:* ${security.burn.toFixed(0)}%\n`;
  }
  message += `👤 *Renounced:* ${security.renounced ? "✅" : "❌"}\n`;
  message += `❄️ *Freeze Revoked:* ${security.freezeRevoked ? "✅" : "❌"}\n`;

  const riskLevel = assessTokenRisk(tokenInfo);
  message += `\n⚠️ *Risk:* ${riskLevel}\n\n`;

  // Links
  message += `🔍 [Search on X](https://twitter.com/search?q=${tokenInfo.symbol}) | `;
  message += `🦅 [DexScreener](https://dexscreener.com/solana/${
    tokenInfo.pairAddress || tokenInfo.address
  }) | `;
  message += `🔥 [PumpSwap](https://swap.pump.fun/?output=${tokenInfo.address}&input=So11111111111111111111111111111111111111112) | `;
  message += `⚖️ [Owner](https://solscan.io/account/${
    tokenInfo.ownerAddress || "OWNER_ADDRESS"
  })`;

  if (tokenInfo.pairAddress && tokenInfo.pairAddress !== tokenInfo.address) {
    message += ` | ⚖️ [Pair](https://solscan.io/account/${tokenInfo.pairAddress})`;
  }

  return message;
}

/**
 * Generate a progress bar for bonding curve
 */
function generateProgressBar(progress: number): string {
  const totalBars = 20;
  const filledBars = Math.round((progress / 100) * totalBars);
  const emptyBars = totalBars - filledBars;
  return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
}

/**
 * Creates enhanced menu with all options
 */
function getEnhancedTokenMenu(
  tokenAddress: string,
  tokenInfo: MergedTokenInfo,
  userId: number
) {
  const buttons: any[][] = [];

  // External links row
  const externalLinks: any[] = [];

  if (tokenInfo.dexscreenerUrl) {
    externalLinks.push(
      Markup.button.url("📊 View Chart", tokenInfo.dexscreenerUrl)
    );
  }

  if (tokenInfo.pairAddress) {
    externalLinks.push(
      Markup.button.url(
        "🔗 Pair",
        `https://solscan.io/token/${tokenInfo.pairAddress}`
      )
    );
  }

  if (externalLinks.length > 0) {
    buttons.push(externalLinks);
  }

  buttons.push([
    Markup.button.url(
      "🔍 Search on X",
      `https://twitter.com/search?q=${tokenInfo.symbol}`
    ),
  ]);

  buttons.push([
    Markup.button.callback("🔄 Refresh", `refresh_${tokenAddress}`),
    Markup.button.callback("📍 Track", `track_${tokenAddress}`),
  ]);

  // Buy/Sell buttons use the actual token address
  buttons.push([
    Markup.button.callback("🟢 Buy", `enhancedbuy_${tokenAddress}`),
    Markup.button.callback("🔴 Sell", `enhancedsell_${tokenAddress}`),
  ]);

  buttons.push([
    Markup.button.callback("⚙️ Settings", `tokensettings_${tokenAddress}`),
  ]);

  buttons.push([Markup.button.callback("❌ Close", "close_token")]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Enhanced buy menu
 */
export function getEnhancedBuyMenu(tokenAddress: string, tokenInfo: any) {
  const buttons: any[][] = [];

  // Slippage
  buttons.push([
    Markup.button.callback("🍯 Slippage: 1%", `slippage_${tokenAddress}`),
  ]);

  // Quick amounts
  buttons.push([
    Markup.button.callback("🚀 0.1 SOL", `quickbuy_${tokenAddress}_0.1`),
    Markup.button.callback("🚀 0.2 SOL", `quickbuy_${tokenAddress}_0.2`),
    Markup.button.callback("🚀 0.5 SOL", `quickbuy_${tokenAddress}_0.5`),
  ]);

  buttons.push([
    Markup.button.callback("🚀 1 SOL", `quickbuy_${tokenAddress}_1`),
    Markup.button.callback("🚀 2 SOL", `quickbuy_${tokenAddress}_2`),
    Markup.button.callback("🚀 5 SOL", `quickbuy_${tokenAddress}_5`),
  ]);

  buttons.push([
    Markup.button.callback("🚀 10 SOL", `quickbuy_${tokenAddress}_10`),
    Markup.button.callback("🚀 Custom", `custombuy_${tokenAddress}`),
  ]);

  // Wallet
  buttons.push([
    Markup.button.callback("💼 Select Wallet", `selectwallet_${tokenAddress}`),
  ]);

  // Back
  buttons.push([
    Markup.button.callback("« Back", `backtotoken_${tokenAddress}`),
  ]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Show enhanced buy menu
 */
export async function showEnhancedBuyMenu(ctx: Context, tokenAddress: string) {
  const tokenInfo = await dexService.getTokenInfo(tokenAddress);

  if (!tokenInfo) {
    await ctx.editMessageText("❌ Token not found.");
    return;
  }

  const price = await dexService.getTokenPrice(tokenAddress);

  let message = `🚀 *Buy ${tokenInfo.symbol}*\n\n`;
  message += `💰 Price: $${price.toFixed(8)}\n`;
  message += `💎 Market Cap: $${riskManager.formatAmount(
    tokenInfo.marketCap || 0
  )}\n`;
  message += `💧 Liquidity: $${riskManager.formatAmount(
    tokenInfo.liquidity || 0
  )}\n\n`;

  // ADD WALLET INFO
  try {
    if (ctx.from) {
      const { getUserWallets } = require('../../services/walletService');
      const wallets = await getUserWallets(ctx.from.id);
      const primaryWallet = wallets.find((w: any) => w.is_primary) || wallets[0];
      
      if (primaryWallet) {
        message += `👛 *Wallet:* ${primaryWallet.wallet_name}\n`;
        message += `💰 *Balance:* ${primaryWallet.balance.toFixed(4)} SOL\n\n`;
      }
    }
  } catch (e) {
    // Wallet info failed, continue without it
  }

  message += `🍯 Slippage: 1%\n`;
  message += `⚡ Fee: Auto\n\n`;
  message += `Select amount to buy:`;

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...getEnhancedBuyMenu(tokenAddress, tokenInfo),
  });
}

/**
 * Wallet selection menu
 */
export async function showWalletSelection(
  ctx: Context,
  tokenAddress: string,
  userId: number
) {
  try {
    const { getUserWallets } = require('../../services/walletService');
    const wallets = await getUserWallets(userId);

    if (wallets.length === 0) {
      let message = `💼 *Wallet Settings*\n\n`;
      message += `❌ No wallet connected\n\n`;
      message += `You need to create a wallet first.\n\n`;
      message += `Use /wallet to:\n`;
      message += `• Generate a new wallet\n`;
      message += `• Import existing wallet\n`;
      message += `• Manage your wallets`;

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("👛 Open Wallet Manager", "menu_wallets")],
          [Markup.button.callback("« Back", `enhancedbuy_${tokenAddress}`)],
        ]),
      });
      return;
    }

    const primaryWallet = wallets.find((w: any) => w.is_primary) || wallets[0];

    let message = `💼 *Active Wallet*\n\n`;
    
    if (primaryWallet) {
      message += `⭐ *${primaryWallet.wallet_name}*\n`;
      message += `Address: \`${primaryWallet.public_key.slice(0, 8)}...${primaryWallet.public_key.slice(-4)}\`\n`;
      message += `Balance: ${primaryWallet.balance.toFixed(4)} SOL\n\n`;
    }
    
    message += `This wallet will be used for trading.\n\n`;
    message += `To change wallets, use /wallet`;

    const buttons: any[] = [];

    buttons.push([
      Markup.button.callback("✅ Use This Wallet", `confirmwallet_${tokenAddress}`)
    ]);

    buttons.push([
      Markup.button.callback("👛 Manage Wallets", "menu_wallets")
    ]);
    
    buttons.push([
      Markup.button.callback("« Back", `enhancedbuy_${tokenAddress}`)
    ]);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });

  } catch (error: any) {
    console.error('Wallet selection error:', error);
    
    await ctx.editMessageText(
      `❌ *Error Loading Wallets*\n\n` +
      `${error.message}\n\n` +
      `Try /wallet to manage your wallets.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Retry", `selectwallet_${tokenAddress}`)],
          [Markup.button.callback("« Back", `backtotoken_${tokenAddress}`)],
        ]),
      }
    );
  }
}

/**
 * Token settings menu
 */
export async function showTokenSettings(ctx: Context, tokenAddress: string) {
  const tokenInfo = await dexService.getTokenInfo(tokenAddress);

  let message = `⚙️ *Trading Settings*\n\n`;
  message += `Token: ${tokenInfo?.symbol || "Unknown"}\n\n`;
  message += `🍯 *Slippage:* 1%\n`;
  message += `⚡ *Fee Level:* Auto\n`;
  message += `💡 *Tip:* Auto\n`;
  message += `🎯 *Auto TP/SL:* Enabled\n\n`;
  message += `Adjust your trading parameters:`;

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("🍯 0.5%", `setslip_${tokenAddress}_0.5`),
        Markup.button.callback("🍯 1%", `setslip_${tokenAddress}_1`),
        Markup.button.callback("🍯 2%", `setslip_${tokenAddress}_2`),
      ],
      [
        Markup.button.callback("🍯 5%", `setslip_${tokenAddress}_5`),
        Markup.button.callback("🍯 10%", `setslip_${tokenAddress}_10`),
      ],
      [
        Markup.button.callback(
          "🎯 Auto TP/SL: ON",
          `toggleauto_${tokenAddress}`
        ),
      ],
      [Markup.button.callback("« Back", `backtotoken_${tokenAddress}`)],
    ]),
  });
}

/**
 * Assesses token risk level
 */
function assessTokenRisk(tokenInfo: MergedTokenInfo): string {
  const marketCap = tokenInfo.marketCap || 0;
  const liquidity = tokenInfo.liquidity || 0;
  const pooledSol = tokenInfo.pooledSol || 0;

  // For pump.fun tokens, use pooled SOL as indicator
  if (pooledSol > 0) {
    if (pooledSol > 50) {
      return "🟢 Low Risk";
    } else if (pooledSol > 20) {
      return "🟡 Medium Risk";
    } else {
      return "🔴 High Risk";
    }
  }

  if (marketCap > 10000000 && liquidity > 1000000) {
    return "🟢 Low Risk";
  } else if (marketCap > 1000000 && liquidity > 100000) {
    return "🟡 Medium Risk";
  } else {
    return "🔴 High Risk";
  }
}

/**
 * Format token search results
 */
export function formatTokenSearchResults(tokens: any[]): string {
  if (tokens.length === 0) {
    return "❌ No tokens found.";
  }

  let message = "🔍 *Search Results*\n\n";

  for (const token of tokens.slice(0, 5)) {
    message += `*${token.symbol}* - ${token.name}\n`;
    message += `💰 $${token.price?.toFixed(8) || "N/A"}\n`;

    if (token.marketCap) {
      message += `📊 MC: $${riskManager.formatAmount(token.marketCap)}\n`;
    }

    message += `📍 \`${token.address.slice(0, 8)}...\`\n\n`;
  }

  return message;
}

/**
 * Format position info for display
 */
export function formatPositionInfo(trade: any, currentPrice: number): string {
  const pnl = trade.entry_price
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
    : 0;

  const pnlValue =
    trade.side === "buy"
      ? (currentPrice - trade.entry_price!) * trade.amount
      : (trade.entry_price! - currentPrice) * trade.amount;

  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
  const pnlSign = pnl >= 0 ? "+" : "";
  const sideEmoji = trade.side === "buy" ? "📈" : "📉";
  const typeEmoji = trade.exchange_type === "dex" ? "🪙" : "💱";

  let message = `${typeEmoji} ${sideEmoji} *${
    trade.symbol
  }* ${trade.side.toUpperCase()}\n\n`;

  message += `💵 *Amount:* $${trade.amount}\n`;
  message += `💰 *Entry:* $${trade.entry_price?.toFixed(6)}\n`;
  message += `📊 *Current:* $${currentPrice.toFixed(6)}\n`;
  message += `${pnlEmoji} *P&L:* ${pnlSign}$${pnlValue.toFixed(
    2
  )} (${pnlSign}${pnl.toFixed(2)}%)\n\n`;

  if (trade.tp_price) {
    message += `🎯 *Take Profit:* $${trade.tp_price}\n`;
  }

  if (trade.sl_price) {
    message += `🛡️ *Stop Loss:* $${trade.sl_price}\n`;
  }

  if (trade.trailing_sl_percent) {
    message += `🔄 *Trailing SL:* ${trade.trailing_sl_percent}%\n`;
  }

  if (trade.auto_tp_sl) {
    message += `🤖 *Auto TP/SL:* ✅ Active\n`;
  }

  return message;
}