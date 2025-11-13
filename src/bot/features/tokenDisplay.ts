// bot/features/tokenDisplay.ts - COMPLETE FIXED VERSION WITH NEW WALLET SYSTEM
import axios from "axios";
import { Context, Markup } from "telegraf";
import { dexService } from "../../services/dexService";
import * as riskManager from "../../utils/riskManager";
import * as userService from "../../services/userService";

/**
 * Checks if text is a valid Solana token address
 */
function isSolanaAddress(text: string): boolean {
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return solanaAddressRegex.test(text);
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
 * Returns true if it handled a token address, false otherwise
 */
export async function handleTokenAddressMessage(
  ctx: Context,
  text: string,
  userId: number
): Promise<boolean> {
  if (!isSolanaAddress(text)) {
    return false;
  }

  try {
    const loadingMsg = await ctx.reply("🔍 Fetching token info...");
    const tokenInfo = await dexService.getTokenInfo(text);

    if (!tokenInfo) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        "❌ Token not found or invalid address."
      );
      return true;
    }

    const security = await getTokenSecurity(text);
    const price = await dexService.getTokenPrice(text);
    const message = formatEnhancedTokenDisplay(tokenInfo, price, security);

    // Try to send with chart
    let sentWithChart = false;
    if (tokenInfo.pairAddress) {
      const chartUrls = [
        `https://dd.dexscreener.com/ds-data/pairs/solana/${tokenInfo.pairAddress}.png`,
        `https://dd.dexscreener.com/ds-data/pairs/solana/${tokenInfo.pairAddress}.jpg`,
        `https://api.dexscreener.com/chart/solana/${tokenInfo.pairAddress}`,
      ];

      for (const chartUrl of chartUrls) {
        if (sentWithChart) break;

        try {
          await ctx.replyWithPhoto(
            { url: chartUrl },
            {
              caption: message,
              parse_mode: "Markdown",
              ...getEnhancedTokenMenu(text, tokenInfo, userId),
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
            url: `https://mevx.io/solana/${text}`,
            prefer_large_media: true,
            show_above_text: true,
          },
          ...getEnhancedTokenMenu(text, tokenInfo, userId),
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
 */
function formatEnhancedTokenDisplay(
  tokenInfo: any,
  price: number,
  security: any
): string {
  const priceChange24h = tokenInfo.priceChange24h || 0;
  const priceChangeEmoji = priceChange24h >= 0 ? "🟢" : "🔴";
  const priceChangeSign = priceChange24h >= 0 ? "+" : "";

  let message = `${tokenInfo.name || "Unknown Token"} (\`$${
    tokenInfo.symbol
  }\` - ${tokenInfo.exchange || "DEX"})\n\n`;

  // Addresses
  message += `⭐ *CA:* \`${tokenInfo.address.slice(
    0,
    8
  )}...${tokenInfo.address.slice(-8)}\`\n`;
  if (tokenInfo.pairAddress) {
    message += `🎁 *LP:* \`${tokenInfo.pairAddress.slice(
      0,
      8
    )}...${tokenInfo.pairAddress.slice(-8)}\`\n\n`;
  }

  // Market data
  if (tokenInfo.exchange) {
    message += `🎯 *Exchange:* ${tokenInfo.exchange}\n`;
  }

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

  message += `💰 *Token Price:* $${price.toFixed(8)}\n`;
  message += `${priceChangeEmoji} *24h Change:* ${priceChangeSign}${priceChange24h.toFixed(
    2
  )}%\n`;

  if (tokenInfo.volume24h && tokenInfo.volume24h > 0) {
    message += `📊 *24h Volume:* $${riskManager.formatAmount(
      tokenInfo.volume24h
    )}\n`;
  }

  // Security
  message += `\n`;
  if (security.pooledSol > 0) {
    message += `🎁 *Pooled SOL:* ${security.pooledSol.toFixed(1)}\n`;
  }
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

  if (tokenInfo.pairAddress) {
    message += ` | ⚖️ [Pair](https://solscan.io/account/${tokenInfo.pairAddress})`;
  }

  return message;
}

/**
 * Creates enhanced menu with all options
 */
function getEnhancedTokenMenu(
  tokenAddress: string,
  tokenInfo: any,
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

  // Wallet - FIXED TO USE NEW SYSTEM
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
 * Show enhanced buy menu - FIXED WITH WALLET INFO
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
 * Wallet selection menu - FIXED FOR NEW WALLET SYSTEM
 */
export async function showWalletSelection(
  ctx: Context,
  tokenAddress: string,
  userId: number
) {
  try {
    // Import wallet service functions
    const { getUserWallets } = require('../../services/walletService');
    
    // Get all wallets from NEW system
    const wallets = await getUserWallets(userId);

    if (wallets.length === 0) {
      // No wallets found
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

    // Get primary wallet
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

    // Simple proceed button
    buttons.push([
      Markup.button.callback("✅ Use This Wallet", `confirmwallet_${tokenAddress}`)
    ]);

    // Manage wallets
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
function assessTokenRisk(tokenInfo: any): string {
  const marketCap = tokenInfo.marketCap || 0;
  const liquidity = tokenInfo.liquidity || 0;

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