// bot/handlers/callbacks.ts - COMPLETE VERSION WITH ALL HANDLERS
import { Context, Markup } from "telegraf";
import * as userService from "../../services/userService";
import * as exchangeService from "../../services/exchangeService";
import * as tradeService from "../../services/tradeService";
import { dexService } from "../../services/dexService";
import * as riskManager from "../../utils/riskManager";
import * as menus from "../ui/menus";
import { handleTokenAddressMessage } from "../features/tokenDisplay";
import {
  showEnhancedBuyMenu,
  showWalletSelection,
  showTokenSettings,
} from "../features/tokenDisplay";
import { handleWalletCallbacks } from './walletCallbacks';
import * as cexHandlers from './cexHandlers';

// Store user states for multi-step operations
export const userStates = new Map<number, any>();

// ===== CLOSE MENU HANDLER =====
export async function handleCloseMenu(ctx: Context) {
  try {
    await ctx.deleteMessage();
  } catch (e) {
    await ctx.answerCbQuery("Menu closed");
  }
}

// ===== COMING SOON HANDLER =====
export async function handleComingSoon(ctx: Context, feature: string) {
  await ctx.editMessageText(
    `🚧 *${feature}*\n\n` +
    `This feature is coming soon!\n\n` +
    `We're working hard to bring you:\n` +
    `• Advanced trading tools\n` +
    `• More features\n` +
    `• Better experience\n\n` +
    `Stay tuned! 🚀`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Main Menu', 'back_main')]
      ])
    }
  );
}

// ===== CONNECT CEX HANDLER =====
export async function handleConnectMenu(ctx: Context) {
  await ctx.editMessageText(
    `🔐 *Connect Exchange*\n\n` +
    `Connect your CEX to start trading crypto.\n\n` +
    `*How to Connect:*\n` +
    `Use the command:\n` +
    `\`/connect <exchange> <api_key> <api_secret>\`\n\n` +
    `*Example:*\n` +
    `\`/connect bybit YOUR_KEY YOUR_SECRET\`\n\n` +
    `*Supported Exchanges:*\n` +
    `• Bybit (recommended)\n` +
    `• Binance\n` +
    `• OKX\n` +
    `• KuCoin\n` +
    `• Gate.io\n` +
    `• Bitget\n\n` +
    `⚠️ *Important:* Enable trading permissions on your API keys!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📚 How to Get API Keys', 'help_api_keys')],
        [Markup.button.callback('« Back', 'back_main')]
      ])
    }
  );
}

// ===== HELP HANDLERS =====
export async function handleHelpApiKeys(ctx: Context) {
  await ctx.editMessageText(
    `📚 *How to Get API Keys*\n\n` +
    `**Bybit:**\n` +
    `1. Go to Account & Security\n` +
    `2. API Management\n` +
    `3. Create New Key\n` +
    `4. Enable "Trade" permission\n` +
    `5. Save your keys securely\n\n` +
    `**Binance:**\n` +
    `1. Go to Profile → API Management\n` +
    `2. Create API\n` +
    `3. Enable "Spot & Margin Trading"\n` +
    `4. Save keys\n\n` +
    `⚠️ *Security Tips:*\n` +
    `• Never share your secret key\n` +
    `• Enable IP whitelist if possible\n` +
    `• Only enable trading permission\n` +
    `• Use a dedicated trading account`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Back', 'menu_connect')]
      ])
    }
  );
}

// ===== TRADE MANAGEMENT =====

export async function handleManagePosition(ctx: Context, tradeId: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("Loading...");

  const trade = await tradeService.getTradeById(tradeId);

  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  const pnl = trade.entry_price
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
    : 0;
  const pnlValue = (currentPrice - trade.entry_price) * trade.amount;
  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

  let message = `⚙️ *Manage Position*\n\n`;
  message += `📊 *${trade.symbol}*\n\n`;
  message += `💵 Amount: ${trade.amount} ${
    trade.exchange_type === "dex" ? "SOL" : "USD"
  }\n`;
  message += `💰 Entry: $${trade.entry_price?.toFixed(8)}\n`;
  message += `📈 Current: $${currentPrice.toFixed(8)}\n`;
  message += `${pnlEmoji} P&L: ${pnl >= 0 ? "+" : ""}$${pnlValue.toFixed(2)} (${
    pnl >= 0 ? "+" : ""
  }${pnl.toFixed(2)}%)\n\n`;

  if (trade.tp_price) {
    const tpDistance = ((trade.tp_price - currentPrice) / currentPrice) * 100;
    message += `🎯 Take Profit: $${trade.tp_price} (${
      tpDistance >= 0 ? "+" : ""
    }${tpDistance.toFixed(2)}%)\n`;
  } else {
    message += `🎯 Take Profit: Not Set\n`;
  }

  if (trade.sl_price) {
    const slDistance = ((trade.sl_price - currentPrice) / currentPrice) * 100;
    message += `🛡️ Stop Loss: $${trade.sl_price} (${slDistance.toFixed(2)}%)\n`;
  } else {
    message += `🛡️ Stop Loss: Not Set\n`;
  }

  if (trade.trailing_sl) {
    message += `🔄 Trailing SL: ${trade.trailing_sl}%\n`;
  }

  message += `\n🤖 Auto TP/SL: ${
    trade.auto_tp_sl ? "✅ ENABLED" : "❌ DISABLED"
  }`;

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...menus.getTradeManagementMenu(tradeId),
  });
}

export async function handleSetTP(ctx: Context, tradeId: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  userStates.set(userId, {
    action: "set_tp",
    tradeId: tradeId,
  });

  await ctx.editMessageText(
    `🎯 *Set Take Profit*\n\n` +
      `📊 ${trade.symbol}\n` +
      `💰 Entry: $${trade.entry_price?.toFixed(8)}\n` +
      `📈 Current: $${currentPrice.toFixed(8)}\n\n` +
      `Send target price or percentage.\n\n` +
      `*Examples:*\n` +
      `• ${(currentPrice * 1.1).toFixed(8)} (+10%)\n` +
      `• \`+20%\``,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("+10%", `quicktp_${tradeId}_10`),
          Markup.button.callback("+25%", `quicktp_${tradeId}_25`),
          Markup.button.callback("+50%", `quicktp_${tradeId}_50`),
        ],
        [
          Markup.button.callback("+100%", `quicktp_${tradeId}_100`),
          Markup.button.callback("+200%", `quicktp_${tradeId}_200`),
        ],
        [Markup.button.callback("❌ Cancel", `manage_${tradeId}`)],
      ]),
    }
  );
}

export async function handleQuickTP(
  ctx: Context,
  tradeId: string,
  percent: string
) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("Setting TP...");

  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  const percentNum = parseFloat(percent);
  const tpPrice = currentPrice * (1 + percentNum / 100);

  await tradeService.setTakeProfit(tradeId, tpPrice);

  await ctx.editMessageText(
    `✅ *Take Profit Set!*\n\n` +
      `📊 ${trade.symbol}\n` +
      `🎯 TP: $${tpPrice.toFixed(8)}\n` +
      `📈 Current: $${currentPrice.toFixed(8)}\n` +
      `🔺 Target: +${percentNum}%\n\n` +
      `🤖 Auto-execution: ENABLED`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚙️ Manage Position", `manage_${tradeId}`)],
        [Markup.button.callback("📊 View Positions", "menu_status")],
        [Markup.button.callback("🏠 Main Menu", "back_main")],
      ]),
    }
  );
}

export async function handleSetSL(ctx: Context, tradeId: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  userStates.set(userId, {
    action: "set_sl",
    tradeId: tradeId,
  });

  await ctx.editMessageText(
    `🛡️ *Set Stop Loss*\n\n` +
      `📊 ${trade.symbol}\n` +
      `💰 Entry: $${trade.entry_price?.toFixed(8)}\n` +
      `📈 Current: $${currentPrice.toFixed(8)}\n\n` +
      `Send price or percentage.`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("-5%", `quicksl_${tradeId}_5`),
          Markup.button.callback("-10%", `quicksl_${tradeId}_10`),
          Markup.button.callback("-15%", `quicksl_${tradeId}_15`),
        ],
        [
          Markup.button.callback("-20%", `quicksl_${tradeId}_20`),
          Markup.button.callback("-25%", `quicksl_${tradeId}_25`),
        ],
        [Markup.button.callback("❌ Cancel", `manage_${tradeId}`)],
      ]),
    }
  );
}

export async function handleQuickSL(
  ctx: Context,
  tradeId: string,
  percent: string
) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("Setting SL...");

  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  const percentNum = parseFloat(percent);
  const slPrice = currentPrice * (1 - percentNum / 100);

  await tradeService.setStopLoss(tradeId, slPrice);

  await ctx.editMessageText(
    `✅ *Stop Loss Set!*\n\n` +
      `📊 ${trade.symbol}\n` +
      `🛡️ SL: $${slPrice.toFixed(8)}\n` +
      `📈 Current: $${currentPrice.toFixed(8)}\n` +
      `🔻 Protection: -${percentNum}%\n\n` +
      `🤖 Auto-execution: ENABLED`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚙️ Manage Position", `manage_${tradeId}`)],
        [Markup.button.callback("📊 View Positions", "menu_status")],
        [Markup.button.callback("🏠 Main Menu", "back_main")],
      ]),
    }
  );
}

export async function handleSetTrailing(ctx: Context, tradeId: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  userStates.set(userId, {
    action: "set_trailing",
    tradeId: tradeId,
  });

  await ctx.editMessageText(
    `🔄 *Set Trailing Stop Loss*\n\n` +
      `📊 ${trade.symbol}\n\n` +
      `Send trailing percentage (5-25% recommended).`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("5%", `quicktrail_${tradeId}_5`),
          Markup.button.callback("10%", `quicktrail_${tradeId}_10`),
          Markup.button.callback("15%", `quicktrail_${tradeId}_15`),
        ],
        [
          Markup.button.callback("20%", `quicktrail_${tradeId}_20`),
          Markup.button.callback("25%", `quicktrail_${tradeId}_25`),
        ],
        [Markup.button.callback("❌ Cancel", `manage_${tradeId}`)],
      ]),
    }
  );
}

export async function handleQuickTrailing(
  ctx: Context,
  tradeId: string,
  percent: string
) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("Setting trailing SL...");

  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  const percentNum = parseFloat(percent);

  await tradeService.setTrailingStopLoss(tradeId, percentNum);

  await ctx.editMessageText(
    `✅ *Trailing Stop Loss Set!*\n\n` +
      `📊 ${trade.symbol}\n` +
      `🔄 Trailing: ${percentNum}%\n\n` +
      `🤖 Auto-execution: ENABLED`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚙️ Manage Position", `manage_${tradeId}`)],
        [Markup.button.callback("📊 View Positions", "menu_status")],
        [Markup.button.callback("🏠 Main Menu", "back_main")],
      ]),
    }
  );
}

export async function handleClosePosition(ctx: Context, tradeId: string) {
  if (!ctx.from) return;

  const trade = await tradeService.getTradeById(tradeId);
  if (!trade) {
    await ctx.editMessageText("❌ Trade not found.");
    return;
  }

  let currentPrice: number;
  if (trade.exchange_type === "dex" && trade.token_address) {
    currentPrice = await dexService.getTokenPrice(trade.token_address);
  } else {
    currentPrice = trade.current_price || trade.entry_price;
  }

  const pnl = trade.entry_price
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
    : 0;
  const pnlValue = (currentPrice - trade.entry_price) * trade.amount;
  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

  await ctx.editMessageText(
    `🔴 *Close Position?*\n\n` +
      `📊 ${trade.symbol}\n` +
      `💰 Entry: $${trade.entry_price?.toFixed(8)}\n` +
      `📈 Current: $${currentPrice.toFixed(8)}\n` +
      `${pnlEmoji} P&L: ${pnl >= 0 ? "+" : ""}$${pnlValue.toFixed(2)} (${
        pnl >= 0 ? "+" : ""
      }${pnl.toFixed(2)}%)\n\n` +
      `Are you sure?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Yes, Close", `confirmclose_${tradeId}`),
          Markup.button.callback("❌ Cancel", `manage_${tradeId}`),
        ],
      ]),
    }
  );
}

export async function handleConfirmClosePosition(
  ctx: Context,
  tradeId: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ *Closing Position...*\n\nPlease wait...", {
    parse_mode: "Markdown",
  });

  try {
    const trade = await tradeService.getTradeById(tradeId);
    if (!trade) throw new Error("Trade not found");

    let currentPrice: number;
    let signature: string | null = null;

    if (trade.exchange_type === "dex" && trade.token_address) {
      currentPrice = await dexService.getTokenPrice(trade.token_address);

      const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
      if (privateKey && trade.token_address) {
        const result = await dexService.sellMemecoin(
          privateKey,
          trade.token_address,
          trade.amount,
          1
        );

        if (result) {
          signature = result.signature;
        }
      }
    } else {
      currentPrice = trade.current_price || trade.entry_price;
    }

    const pnl = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
    const pnlValue = (currentPrice - trade.entry_price) * trade.amount;

    await tradeService.closeTrade(trade.id, currentPrice, pnlValue, pnl);

    let message = `✅ *Position Closed!*\n\n`;
    message += `📊 ${trade.symbol}\n`;
    message += `💰 Entry: $${trade.entry_price.toFixed(8)}\n`;
    message += `📈 Exit: $${currentPrice.toFixed(8)}\n`;
    message += `${pnl >= 0 ? "🟢" : "🔴"} P&L: ${
      pnl >= 0 ? "+" : ""
    }$${pnlValue.toFixed(2)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%)\n`;

    if (signature) {
      message += `\n🔗 Signature:\n\`${signature}\``;
    }

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📊 Portfolio", "menu_portfolio")],
        [Markup.button.callback("🏠 Main Menu", "back_main")],
      ]),
    });
  } catch (error: any) {
    console.error("Close position error:", error);
    await ctx.editMessageText(
      `❌ *Failed to Close Position*\n\n` + `Error: ${error.message}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Retry", `closepos_${tradeId}`)],
          [Markup.button.callback("« Back", `manage_${tradeId}`)],
        ]),
      }
    );
  }
}

// ===== NAVIGATION HANDLERS =====

export async function handleBackToMain(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  
  const connectionStatus = await userService.getConnectionStatus(userId);
  const walletDetails = await userService.getWalletDetails(userId);
  
  let statusText = '';
  
  if (connectionStatus.hasCEX) {
    statusText += `🟢 CEX: ${connectionStatus.exchange?.toUpperCase()}\n`;
  } else {
    statusText += `🔴 CEX: Not Connected\n`;
  }
  
  if (walletDetails?.connected) {
    statusText += `🟢 DEX: Connected\n`;
    if (walletDetails.walletCount > 0) {
      statusText += `💼 ${walletDetails.walletCount} wallet${walletDetails.walletCount > 1 ? 's' : ''}`;
      if (walletDetails.totalBalance > 0) {
        statusText += ` | 💰 ${walletDetails.totalBalance.toFixed(4)} SOL`;
      }
      statusText += `\n`;
    }
  } else {
    statusText += `🔴 DEX: Not Connected\n`;
  }

  await ctx.editMessageText(
    `🤖 *Advanced Trading Bot*\n\n` +
    `${statusText}\n` +
    `Select an option:`,
    {
      parse_mode: "Markdown",
      ...menus.getMainMenu(),
    }
  );
}

// ===== TOKEN HANDLERS =====

export async function handleRefreshToken(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("🔄 Refreshing...");
  await handleTokenAddressMessage(ctx, tokenAddress, ctx.from.id);
}

export async function handleTrackToken(ctx: Context, tokenAddress: string) {
  await ctx.reply(
    `✅ *Tracking Token*\n\n` +
      `Address: \`${tokenAddress.slice(0, 8)}...\`\n\n` +
      `You'll receive price alerts!`,
    { parse_mode: "Markdown" }
  );
}

export async function handleCloseToken(ctx: Context) {
  await ctx.deleteMessage();
}

// ===== MEMECOIN BUY FLOW =====

export async function handleMemecoinBuyButton(
  ctx: Context,
  tokenAddress: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*\n\n` +
        `Please connect your Solana wallet first.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect Wallet", "meme_connect_wallet")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  await ctx.answerCbQuery("Loading...");
  const tokenInfo = await dexService.getTokenInfo(tokenAddress);

  if (!tokenInfo) {
    await ctx.editMessageText("❌ Token not found.");
    return;
  }

  await ctx.editMessageText(
    `💎 *Buy ${tokenInfo.symbol}*\n\n` +
      `${tokenInfo.name}\n` +
      `💰 Price: $${tokenInfo.price?.toFixed(8)}\n\n` +
      `Select amount:`,
    {
      parse_mode: "Markdown",
      ...menus.getMemecoinAmountMenu(tokenAddress, "buy"),
    }
  );
}

export async function handleMemecoinAmountSelection(
  ctx: Context,
  action: "buy" | "sell",
  tokenAddress: string,
  solAmount: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  await ctx.answerCbQuery("Processing...");

  const amount = parseFloat(solAmount);

  const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
  if (!privateKey) {
    await ctx.editMessageText("❌ Wallet not found.");
    return;
  }

  const balance = await dexService.getWalletBalance(privateKey);
  if (balance < amount) {
    await ctx.editMessageText(
      `❌ *Insufficient Balance*\n\n` +
        `You have: ${balance.toFixed(4)} SOL\n` +
        `Required: ${amount} SOL`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  const tokenInfo = await dexService.getTokenInfo(tokenAddress);
  if (!tokenInfo) {
    await ctx.editMessageText("❌ Token not available.");
    return;
  }

  const estimatedTokens = (amount / tokenInfo.price!) * 0.99;

  await ctx.editMessageText(
    `⚡ *Confirm Purchase*\n\n` +
      `Token: *${tokenInfo.symbol}*\n` +
      `Amount: *${amount} SOL*\n` +
      `Price: $${tokenInfo.price?.toFixed(8)}\n` +
      `Est. Tokens: ~${estimatedTokens.toFixed(2)}\n` +
      `Slippage: 1%\n\n` +
      `Proceed?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Confirm",
            `confirm_buy_${tokenAddress}_${amount}`
          ),
          Markup.button.callback("❌ Cancel", "menu_memecoins"),
        ],
      ]),
    }
  );
}

export async function handleConfirmBuy(
  ctx: Context,
  tokenAddress: string,
  solAmount: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const amount = parseFloat(solAmount);

  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ *Executing Trade...*\n\nPlease wait...", {
    parse_mode: "Markdown",
  });

  try {
    const user = await userService.getUserByTelegramId(userId);
    if (!user) throw new Error("User not found");

    const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
    if (!privateKey) throw new Error("Wallet not found");

    const tokenInfo = await dexService.getTokenInfo(tokenAddress);
    if (!tokenInfo) throw new Error("Token not found");

    const result = await dexService.buyMemecoin(
      privateKey,
      tokenAddress,
      amount,
      1
    );

    if (!result) {
      throw new Error("Swap failed");
    }

    await tradeService.createMemecoinTrade(
      user.id,
      userId,
      tokenAddress,
      tokenInfo.symbol,
      tokenInfo.decimals,
      "buy",
      amount,
      tokenInfo.price || 0,
      "jupiter",
      1
    );

    await ctx.editMessageText(
      `✅ *Trade Successful!*\n\n` +
        `Token: *${tokenInfo.symbol}*\n` +
        `Amount: ${amount} SOL\n` +
        `Tokens: ${result.tokensReceived}\n\n` +
        `🔗 Signature:\n\`${result.signature}\`\n\n` +
        `🤖 Auto TP/SL: ENABLED`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📊 Positions", "meme_positions")],
          [Markup.button.callback("🏠 Main Menu", "back_main")],
        ]),
      }
    );
  } catch (error: any) {
    console.error("Buy error:", error);
    await ctx.editMessageText(
      `❌ *Trade Failed*\n\n` + `Error: ${error.message}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Retry", `memebuy_${tokenAddress}`)],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
  }
}

export async function handleMemecoinSellButton(
  ctx: Context,
  tokenAddress: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  const trades = await tradeService.getTrades(userId, {
    status: "open",
    exchangeType: "dex",
  });

  const trade = trades.find((t) => t.token_address === tokenAddress);

  if (!trade) {
    await ctx.editMessageText("❌ No open position found.");
    return;
  }

  const currentPrice = await dexService.getTokenPrice(tokenAddress);
  const pnl = trade.entry_price
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
    : 0;
  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

  await ctx.editMessageText(
    `📉 *Sell ${trade.symbol}*\n\n` +
      `Entry: $${trade.entry_price?.toFixed(8)}\n` +
      `Current: $${currentPrice.toFixed(8)}\n` +
      `${pnlEmoji} P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%\n\n` +
      `Sell entire position?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Sell All", `confirm_sell_${tokenAddress}`),
          Markup.button.callback("❌ Cancel", "meme_positions"),
        ],
      ]),
    }
  );
}

export async function handleConfirmSell(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ *Selling...*\n\nPlease wait...", {
    parse_mode: "Markdown",
  });

  try {
    const trades = await tradeService.getTrades(userId, {
      status: "open",
      exchangeType: "dex",
    });

    const trade = trades.find((t) => t.token_address === tokenAddress);
    if (!trade) throw new Error("Trade not found");

    const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
    if (!privateKey) throw new Error("Wallet not found");

    const currentPrice = await dexService.getTokenPrice(tokenAddress);

    const result = await dexService.sellMemecoin(
      privateKey,
      tokenAddress,
      trade.amount,
      1
    );

    if (!result) {
      throw new Error("Swap failed");
    }

    const pnl = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
    const pnlValue = (currentPrice - trade.entry_price) * trade.amount;

    await tradeService.closeTrade(trade.id, currentPrice, pnlValue, pnl);

    await ctx.editMessageText(
      `✅ *Sold Successfully!*\n\n` +
        `Token: *${trade.symbol}*\n` +
        `Entry: $${trade.entry_price.toFixed(8)}\n` +
        `Exit: $${currentPrice.toFixed(8)}\n` +
        `${pnl >= 0 ? "🟢" : "🔴"} P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(
          2
        )}%\n` +
        `${pnl >= 0 ? "💰" : "💸"} ${
          pnl >= 0 ? "+" : ""
        }$${pnlValue.toFixed(2)}\n\n` +
        `🔗 Signature:\n\`${result.signature}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📊 Portfolio", "menu_portfolio")],
          [Markup.button.callback("🏠 Main Menu", "back_main")],
        ]),
      }
    );
  } catch (error: any) {
    console.error("Sell error:", error);
    await ctx.editMessageText(
      `❌ *Sell Failed*\n\n` + `Error: ${error.message}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Retry", `memesell_${tokenAddress}`)],
          [Markup.button.callback("« Back", "meme_positions")],
        ]),
      }
    );
  }
}

// ===== MEMECOIN MENU HANDLERS =====

export async function handleMemecoinMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  let message = `🪙 *Memecoin Trading*\n\n`;

  if (hasWallet) {
    message += `🟢 Wallet Connected\n\n`;
    message += `Trade Solana memecoins with:\n`;
    message += `• Jupiter DEX\n`;
    message += `• Auto TP/SL\n`;
    message += `• Real-time prices\n\n`;
    message += `💡 *Tip:* Paste any token address!\n\n`;
    message += `Select an option:`;
  } else {
    message += `🔴 No Wallet\n\n`;
    message += `Connect wallet to trade!`;
  }

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...menus.getMemecoinMenu(),
  });
}

export async function handleMemecoinSearch(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  userStates.set(userId, { action: "search_token" });

  await ctx.editMessageText(
    `🔍 *Search Memecoin*\n\n` +
      `Send token name, symbol, or address.\n\n` +
      `Examples: BONK, WIF, POPCAT`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("« Cancel", "menu_memecoins")],
      ]),
    }
  );
}

export async function handleMemecoinBuy(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*\n\n` + `Connect wallet first.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect Wallet", "meme_connect_wallet")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  userStates.set(userId, { action: "buy_memecoin_search" });

  await ctx.editMessageText(
    `💎 *Buy Memecoin*\n\n` + `Send token address or name.`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔍 Search", "meme_search")],
        [Markup.button.callback("« Cancel", "menu_memecoins")],
      ]),
    }
  );
}

export async function handleMemecoinSell(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect", "meme_connect_wallet")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  const memeTrades = await tradeService.getTrades(userId, {
    status: "open",
    exchangeType: "dex",
  });

  if (memeTrades.length === 0) {
    await ctx.editMessageText(
      `📊 *No Positions*\n\n` + `Buy some memecoins first!`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💎 Buy", "meme_buy")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  let message = `📉 *Sell Memecoin*\n\n`;
  message += `Your positions:\n\n`;

  const buttons: any[] = [];

  for (const trade of memeTrades.slice(0, 5)) {
    const price = await dexService.getTokenPrice(trade.token_address!);
    const pnl = trade.entry_price
      ? ((price - trade.entry_price) / trade.entry_price) * 100
      : 0;

    message += `${trade.symbol}\n`;
    message += `P&L: ${pnl >= 0 ? "🟢+" : "🔴"}${pnl.toFixed(2)}%\n\n`;

    buttons.push([
      Markup.button.callback(
        `Sell ${trade.symbol}`,
        `memesell_${trade.token_address}`
      ),
    ]);
  }

  buttons.push([Markup.button.callback("« Back", "menu_memecoins")]);

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}

export async function handleMemecoinTrending(ctx: Context) {
  await ctx.editMessageText(`⏳ *Fetching...*`, {
    parse_mode: "Markdown",
  });

  const tokens = await dexService.searchTokens("BONK");

  if (tokens.length === 0) {
    await ctx.editMessageText(
      `❌ *No Results*\n\nTry searching manually.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔍 Search", "meme_search")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  let message = `🔥 *Trending*\n\n`;
  const buttons: any[] = [];

  for (const token of tokens.slice(0, 5)) {
    message += `*${token.symbol}*\n`;
    message += `💰 $${token.price?.toFixed(8) || "N/A"}\n\n`;

    buttons.push([
      Markup.button.callback(`Buy ${token.symbol}`, `memebuy_${token.address}`),
    ]);
  }

  buttons.push([Markup.button.callback("« Back", "menu_memecoins")]);

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}

export async function handleMemecoinPositions(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const memeTrades = await tradeService.getTrades(userId, {
    status: "open",
    exchangeType: "dex",
  });

  if (memeTrades.length === 0) {
    await ctx.editMessageText(
      `📊 *No Positions*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💎 Buy", "meme_buy")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  let message = `📊 *Your Memecoins*\n\n`;
  const buttons: any[] = [];

  for (const trade of memeTrades) {
    const price = await dexService.getTokenPrice(trade.token_address!);
    const pnl = trade.entry_price
      ? ((price - trade.entry_price) / trade.entry_price) * 100
      : 0;
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

    message += `*${trade.symbol}*\n`;
    message += `${pnlEmoji} P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%\n\n`;

    buttons.push([
      Markup.button.callback(`⚙️ ${trade.symbol}`, `manage_${trade.id}`),
    ]);
  }

  buttons.push([Markup.button.callback("« Back", "menu_memecoins")]);

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}

export async function handleMemecoinBalance(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect", "meme_connect_wallet")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
    return;
  }

  await ctx.editMessageText(`⏳ *Fetching Balance...*`, {
    parse_mode: "Markdown",
  });

  try {
    const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
    if (!privateKey) throw new Error("Private key not found");

    const publicKey = dexService.getPublicKeyFromPrivate(privateKey);
    const balance = await dexService.getWalletBalance(publicKey);

    await ctx.editMessageText(
      `💰 *SOL Balance*\n\n` +
        `Address: \`${publicKey.slice(0, 4)}...${publicKey.slice(-4)}\`\n\n` +
        `Balance: **${balance.toFixed(4)} SOL**`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Refresh", "meme_balance")],
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
  } catch (error: any) {
    console.error("Balance error:", error);
    await ctx.editMessageText(
      `❌ *Failed*\n\n` + `Error: ${error.message}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("« Back", "menu_memecoins")],
        ]),
      }
    );
  }
}

export async function handleConnectWallet(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  userStates.set(userId, { action: "connect_solana_wallet" });

  await ctx.editMessageText(
    `🔐 *Connect Solana Wallet*\n\n` +
      `Send your private key (base58).\n\n` +
      `⚠️ Use a dedicated trading wallet!`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("« Cancel", "menu_memecoins")],
      ]),
    }
  );
}

// ===== CEX TRADING HANDLERS =====

export async function handlePortfolioMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  await ctx.editMessageText(`⏳ *Loading...*`, {
    parse_mode: "Markdown",
  });

  const stats = await tradeService.getPortfolioStats(userId);

  if (!stats) {
    await ctx.editMessageText(
      `📊 *Portfolio*\n\n` + `No trades yet.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("📈 CEX", "menu_buy"),
            Markup.button.callback("🪙 Memecoins", "menu_memecoins"),
          ],
          [Markup.button.callback("« Back", "back_main")],
        ]),
      }
    );
    return;
  }

  const winRateEmoji =
    stats.winRate >= 60 ? "🟢" : stats.winRate >= 40 ? "🟡" : "🔴";
  const pnlEmoji = stats.totalPnl >= 0 ? "🟢" : "🔴";

  await ctx.editMessageText(
    `📊 *Portfolio*\n\n` +
      `${pnlEmoji} P&L: ${
        stats.totalPnl >= 0 ? "+" : ""
      }$${stats.totalPnl.toFixed(2)}\n` +
      `💵 Invested: $${stats.totalInvested.toFixed(2)}\n\n` +
      `📈 Trades: ${stats.totalTrades}\n` +
      `🟢 Open: ${stats.openTrades}\n` +
      `⚪ Closed: ${stats.closedTrades}\n\n` +
      `${winRateEmoji} Win Rate: ${stats.winRate.toFixed(1)}%`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh", "menu_portfolio")],
        [Markup.button.callback("📊 Positions", "menu_status")],
        [Markup.button.callback("🏠 Main", "back_main")],
      ]),
    }
  );
}

export async function handleBalanceMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const keys = await userService.getDecryptedApiKeys(userId);

  if (!keys) {
    await ctx.editMessageText(
      `❌ *CEX Not Connected*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect", "menu_connect")],
          [Markup.button.callback("« Back", "back_main")],
        ]),
      }
    );
    return;
  }

  await ctx.editMessageText(
    `⏳ Fetching from ${keys.exchange.toUpperCase()}...`,
    { parse_mode: "Markdown" }
  );

  const exchange = await exchangeService.createExchangeInstance(
    keys.exchange as exchangeService.SupportedExchange,
    keys.apiKey,
    keys.apiSecret,
    process.env.USE_TESTNET === "true"
  );

  const balance = await exchange.fetchBalance();

  const balanceEntries = Object.entries(balance.total || {});
  const nonZeroBalances = balanceEntries.filter(
    ([_, amount]) => typeof amount === "number" && amount > 0
  );

  let message = `💰 *Balance*\n🏦 ${keys.exchange.toUpperCase()}\n\n`;

  if (nonZeroBalances.length === 0) {
    message += "❌ No balance";
  } else {
    nonZeroBalances.slice(0, 10).forEach(([currency, amount]) => {
      message += `${currency}: ${amount.toFixed(8)}\n`;
    });
  }

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Refresh", "menu_balance")],
      [Markup.button.callback("« Back", "back_main")],
    ]),
  });
}

export async function handlePositionsMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const trades = await tradeService.getOpenTrades(userId);

  if (trades.length === 0) {
    await ctx.editMessageText(
      `📊 *No Positions*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("📈 Buy", "menu_buy"),
            Markup.button.callback("🪙 Memecoins", "menu_memecoins"),
          ],
          [Markup.button.callback("« Back", "back_main")],
        ]),
      }
    );
    return;
  }

  let message = "📊 *Open Positions*\n\n";
  const buttons: any[] = [];

  for (const trade of trades) {
    let currentPrice: number;
    if (trade.exchange_type === "dex" && trade.token_address) {
      currentPrice = await dexService.getTokenPrice(trade.token_address);
    } else {
      currentPrice = trade.current_price || trade.entry_price;
    }

    const pnl = trade.entry_price
      ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
      : 0;

    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

    message += `*${trade.symbol}*\n`;
    message += `${pnlEmoji} P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%\n\n`;

    buttons.push([
      Markup.button.callback(`⚙️ ${trade.symbol}`, `manage_${trade.id}`),
    ]);
  }

  buttons.push([Markup.button.callback("🔄 Refresh", "menu_status")]);
  buttons.push([Markup.button.callback("« Back", "back_main")]);

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}

// ===== ENHANCED TOKEN HANDLERS =====

export async function handleEnhancedBuy(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect", "meme_connect_wallet")],
          [Markup.button.callback("« Back", `backtotoken_${tokenAddress}`)],
        ]),
      }
    );
    return;
  }

  await showEnhancedBuyMenu(ctx, tokenAddress);
}

export async function handleEnhancedSell(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const hasWallet = await userService.hasDEXConnectionNew(userId);

  if (!hasWallet) {
    await ctx.editMessageText(
      `❌ *Wallet Not Connected*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔐 Connect", "meme_connect_wallet")],
          [Markup.button.callback("« Back", `backtotoken_${tokenAddress}`)],
        ]),
      }
    );
    return;
  }

  const trades = await tradeService.getTrades(userId, {
    status: "open",
    exchangeType: "dex",
  });

  const trade = trades.find((t) => t.token_address === tokenAddress);

  if (!trade) {
    await ctx.editMessageText(
      `❌ *No Position*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🟢 Buy Instead",
              `enhancedbuy_${tokenAddress}`
            ),
          ],
          [Markup.button.callback("« Back", `backtotoken_${tokenAddress}`)],
        ]),
      }
    );
    return;
  }

  const currentPrice = await dexService.getTokenPrice(tokenAddress);
  const pnl = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

  await ctx.editMessageText(
    `🔴 *Sell ${trade.symbol}*\n\n` +
      `Entry: $${trade.entry_price.toFixed(8)}\n` +
      `Current: $${currentPrice.toFixed(8)}\n` +
      `${pnl >= 0 ? "🟢" : "🔴"} P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(
        2
      )}%\n\n` +
      `Sell all?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Sell All", `confirm_sell_${tokenAddress}`)],
        [Markup.button.callback("❌ Cancel", `backtotoken_${tokenAddress}`)],
      ]),
    }
  );
}

export async function handleQuickBuy(
  ctx: Context,
  tokenAddress: string,
  amount: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const solAmount = parseFloat(amount);

  await ctx.answerCbQuery("Processing...");

  const tokenInfo = await dexService.getTokenInfo(tokenAddress);
  if (!tokenInfo) {
    await ctx.editMessageText("❌ Token not found.");
    return;
  }

  const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
  if (!privateKey) {
    await ctx.editMessageText("❌ Wallet not found.");
    return;
  }

  const balance = await dexService.getWalletBalance(privateKey);
  if (balance < solAmount) {
    await ctx.editMessageText(
      `❌ *Insufficient*\n\n` +
        `Have: ${balance.toFixed(4)} SOL\n` +
        `Need: ${solAmount} SOL`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("« Back", `enhancedbuy_${tokenAddress}`)],
        ]),
      }
    );
    return;
  }

  const price = await dexService.getTokenPrice(tokenAddress);
  const estimatedTokens = (solAmount / price) * 0.99;

  await ctx.editMessageText(
    `⚡ *Confirm*\n\n` +
      `Token: *${tokenInfo.symbol}*\n` +
      `Amount: *${solAmount} SOL*\n` +
      `Est: ~${estimatedTokens.toFixed(2)}\n\n` +
      `Proceed?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Confirm",
            `execbuy_${tokenAddress}_${solAmount}`
          ),
          Markup.button.callback("❌ Cancel", `enhancedbuy_${tokenAddress}`),
        ],
      ]),
    }
  );
}

export async function handleExecuteBuy(
  ctx: Context,
  tokenAddress: string,
  amount: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const solAmount = parseFloat(amount);

  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ *Executing...*", {
    parse_mode: "Markdown",
  });

  try {
    const user = await userService.getUserByTelegramId(userId);
    if (!user) throw new Error("User not found");

    const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
    if (!privateKey) throw new Error("Wallet not found");

    const tokenInfo = await dexService.getTokenInfo(tokenAddress);
    if (!tokenInfo) throw new Error("Token not found");

    const result = await dexService.buyMemecoin(
      privateKey,
      tokenAddress,
      solAmount,
      1
    );

    if (!result) {
      throw new Error("Swap failed");
    }

    await tradeService.createMemecoinTrade(
      user.id,
      userId,
      tokenAddress,
      tokenInfo.symbol,
      tokenInfo.decimals,
      "buy",
      solAmount,
      tokenInfo.price || 0,
      "jupiter",
      1
    );

    await ctx.editMessageText(
      `✅ *Success!*\n\n` +
        `Token: *${tokenInfo.symbol}*\n` +
        `Amount: ${solAmount} SOL\n` +
        `Tokens: ${result.tokensReceived}\n\n` +
        `🤖 Auto TP/SL: ON`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📊 Positions", "meme_positions")],
          [Markup.button.callback("🏠 Main", "back_main")],
        ]),
      }
    );
  } catch (error: any) {
    console.error("Buy error:", error);
    await ctx.editMessageText(
      `❌ *Failed*\n\n` + `${error.message}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🔄 Retry",
              `quickbuy_${tokenAddress}_${amount}`
            ),
          ],
          [Markup.button.callback("« Back", `enhancedbuy_${tokenAddress}`)],
        ]),
      }
    );
  }
}

export async function handleBackToToken(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery("Refreshing...");
  await handleTokenAddressMessage(ctx, tokenAddress, ctx.from.id);
}

export async function handleTokenSettings(ctx: Context, tokenAddress: string) {
  await showTokenSettings(ctx, tokenAddress);
}

export async function handleSetSlippage(
  ctx: Context,
  tokenAddress: string,
  slippage: string
) {
  await ctx.answerCbQuery(`Slippage: ${slippage}%`);
  await showTokenSettings(ctx, tokenAddress);
}

export async function handleSelectWallet(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;
  await showWalletSelection(ctx, tokenAddress, ctx.from.id);
}

export async function handleConfirmWallet(ctx: Context, tokenAddress: string) {
  await ctx.answerCbQuery("Wallet confirmed!");
  await showEnhancedBuyMenu(ctx, tokenAddress);
}

export async function handleCustomBuy(ctx: Context, tokenAddress: string) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  userStates.set(userId, {
    action: "custom_buy_amount",
    tokenAddress: tokenAddress,
  });

  await ctx.editMessageText(
    `💎 *Custom Amount*\n\n` +
      `Send SOL amount.\n\n` +
      `Examples: 0.3, 1.5, 7.5`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Cancel", `enhancedbuy_${tokenAddress}`)],
      ]),
    }
  );
}

export async function handleToggleAutoTPSL(ctx: Context, tokenAddress: string) {
  await ctx.answerCbQuery("Auto TP/SL toggled");
  await showTokenSettings(ctx, tokenAddress);
}

// ===== MAIN CALLBACK ROUTER =====

export async function handleCallback(ctx: Context) {
  if (!("data" in ctx.callbackQuery!) || !ctx.from) return;

  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  try {
    // Wallet callbacks FIRST - must be before answerCbQuery for proper flow
    if (handleWalletCallbacks(ctx)) {
      return;
    }

    await ctx.answerCbQuery();

    // Navigation
    if (data === "back_main") return handleBackToMain(ctx);
    if (data === "menu_close") return handleCloseMenu(ctx);

    // CEX Trading - NEW!
    if (data === "menu_buy") return cexHandlers.handleBuyMenu(ctx);
    if (data === "menu_sell") return cexHandlers.handleSellMenu(ctx);

    // CEX Buy pair selection
    if (data.startsWith("buy_") && !data.includes("custom") && !data.includes("memecoin")) {
      const symbol = data.replace("buy_", "");
      return cexHandlers.handlePairSelection(ctx, 'buy', symbol);
    }

    // CEX Sell pair selection  
    if (data.startsWith("sell_") && !data.includes("custom") && !data.includes("memecoin")) {
      const symbol = data.replace("sell_", "");
      return cexHandlers.handlePairSelection(ctx, 'sell', symbol);
    }

    // CEX Amount selection
    if (data.startsWith("amount_")) {
      const parts = data.replace("amount_", "").split("_");
      const action = parts[0] as 'buy' | 'sell';
      const symbol = parts[1];
      const amount = parts[2];
      return cexHandlers.handleAmountSelection(ctx, action, symbol, amount);
    }

    // CEX Confirm trade (handles both buy and sell)
    if (data.startsWith("confirm_") && !data.includes("buy_") && !data.includes("sell_")) {
      const parts = data.split("_");
      const action = parts[1] as 'buy' | 'sell';
      const symbol = parts[2];
      const amount = parts[3];
      return cexHandlers.handleConfirmTrade(ctx, action, symbol, amount);
    }

    // CEX Custom amount
    if (data.startsWith("custom_")) {
      const parts = data.replace("custom_", "").split("_");
      const action = parts[0] as 'buy' | 'sell';
      const symbol = parts[1];
      return cexHandlers.handleCustomAmount(ctx, action, symbol);
    }

    // Connect
    if (data === "menu_connect") return handleConnectMenu(ctx);
    if (data === "help_api_keys") return handleHelpApiKeys(ctx);
    if (data === "help_connect") return handleHelpApiKeys(ctx);

    // Wallets menu
    if (data === "menu_wallets") {
      const { handleWalletCommand } = require('./walletHandlers');
      return handleWalletCommand(ctx);
    }

    // Coming soon features
    if (data === "menu_limit") return handleComingSoon(ctx, "Limit Orders");
    if (data === "menu_copy") return handleComingSoon(ctx, "Copy Trading");
    if (data === "menu_sniper_v1") return handleComingSoon(ctx, "Sniper V1");
    if (data === "menu_sniper_v2") return handleComingSoon(ctx, "Sniper V2");
    if (data === "menu_sniper_pumpfun") return handleComingSoon(ctx, "Pump Sniper");
    if (data === "menu_sniper_moonshot") return handleComingSoon(ctx, "Moonshot");
    if (data === "menu_transfer") return handleComingSoon(ctx, "Transfer");
    if (data === "menu_settings") return handleComingSoon(ctx, "Settings");
    if (data === "menu_tools") return handleComingSoon(ctx, "Tools");
    if (data === "menu_mm") return handleComingSoon(ctx, "Market Maker");
    if (data === "menu_backup") return handleComingSoon(ctx, "Backups");
    if (data === "menu_cashback") return handleComingSoon(ctx, "Cashback");
    if (data === "menu_referrals") return handleComingSoon(ctx, "Referrals");
    if (data === "menu_stats") return handleComingSoon(ctx, "Stats");
    if (data === "menu_tutorials") return handleComingSoon(ctx, "Tutorials");
    if (data === "menu_help") return handleComingSoon(ctx, "Help");
    if (data === "menu_security") return handleComingSoon(ctx, "Security");

    // Token actions
    if (data.startsWith("refresh_"))
      return handleRefreshToken(ctx, data.replace("refresh_", ""));
    if (data.startsWith("track_"))
      return handleTrackToken(ctx, data.replace("track_", ""));
    if (data === "close_token") return handleCloseToken(ctx);

    // Memecoin buy flow
    if (data.startsWith("memebuy_")) {
      const tokenAddress = data.replace("memebuy_", "");
      return handleMemecoinBuyButton(ctx, tokenAddress);
    }

    // Amount selection
    if (data.startsWith("memeamount_")) {
      const parts = data.replace("memeamount_", "").split("_");
      const action = parts[0] as "buy" | "sell";
      const tokenAddress = parts[1];
      const amount = parts[2];
      return handleMemecoinAmountSelection(ctx, action, tokenAddress, amount);
    }

    // Confirm buy
    if (data.startsWith("confirm_buy_")) {
      const parts = data.replace("confirm_buy_", "").split("_");
      const tokenAddress = parts[0];
      const amount = parts[1];
      return handleConfirmBuy(ctx, tokenAddress, amount);
    }

    // Memecoin sell
    if (data.startsWith("memesell_")) {
      const tokenAddress = data.replace("memesell_", "");
      return handleMemecoinSellButton(ctx, tokenAddress);
    }

    // Confirm sell
    if (data.startsWith("confirm_sell_")) {
      const tokenAddress = data.replace("confirm_sell_", "");
      return handleConfirmSell(ctx, tokenAddress);
    }

    // Memecoin menu
    if (data === "menu_memecoins") return handleMemecoinMenu(ctx);
    if (data === "meme_search") return handleMemecoinSearch(ctx);
    if (data === "meme_buy") return handleMemecoinBuy(ctx);
    if (data === "meme_sell") return handleMemecoinSell(ctx);
    if (data === "meme_trending") return handleMemecoinTrending(ctx);
    if (data === "meme_positions") return handleMemecoinPositions(ctx);
    if (data === "meme_balance") return handleMemecoinBalance(ctx);
    if (data === "meme_connect_wallet") return handleConnectWallet(ctx);

    // CEX trading
    if (data === "menu_portfolio") return handlePortfolioMenu(ctx);
    if (data === "menu_balance") return handleBalanceMenu(ctx);
    if (data === "menu_status") return handlePositionsMenu(ctx);
    if (data === "menu_positions") return handlePositionsMenu(ctx);

    // Trade management
    if (data.startsWith("manage_")) {
      const tradeId = data.replace("manage_", "");
      return handleManagePosition(ctx, tradeId);
    }

    if (data.startsWith("settp_")) {
      const tradeId = data.replace("settp_", "");
      return handleSetTP(ctx, tradeId);
    }

    if (data.startsWith("quicktp_")) {
      const parts = data.replace("quicktp_", "").split("_");
      return handleQuickTP(ctx, parts[0], parts[1]);
    }

    if (data.startsWith("setsl_")) {
      const tradeId = data.replace("setsl_", "");
      return handleSetSL(ctx, tradeId);
    }

    if (data.startsWith("quicksl_")) {
      const parts = data.replace("quicksl_", "").split("_");
      return handleQuickSL(ctx, parts[0], parts[1]);
    }

    if (data.startsWith("settrailing_")) {
      const tradeId = data.replace("settrailing_", "");
      return handleSetTrailing(ctx, tradeId);
    }

    if (data.startsWith("quicktrail_")) {
      const parts = data.replace("quicktrail_", "").split("_");
      return handleQuickTrailing(ctx, parts[0], parts[1]);
    }

    if (data.startsWith("closepos_")) {
      const tradeId = data.replace("closepos_", "");
      return handleClosePosition(ctx, tradeId);
    }

    if (data.startsWith("confirmclose_")) {
      const tradeId = data.replace("confirmclose_", "");
      return handleConfirmClosePosition(ctx, tradeId);
    }

    // Enhanced token display handlers
    if (data.startsWith("enhancedbuy_")) {
      const tokenAddress = data.replace("enhancedbuy_", "");
      return handleEnhancedBuy(ctx, tokenAddress);
    }

    if (data.startsWith("enhancedsell_")) {
      const tokenAddress = data.replace("enhancedsell_", "");
      return handleEnhancedSell(ctx, tokenAddress);
    }

    if (data.startsWith("quickbuy_")) {
      const parts = data.replace("quickbuy_", "").split("_");
      const tokenAddress = parts[0];
      const amount = parts[1];
      return handleQuickBuy(ctx, tokenAddress, amount);
    }

    if (data.startsWith("execbuy_")) {
      const parts = data.replace("execbuy_", "").split("_");
      const tokenAddress = parts[0];
      const amount = parts[1];
      return handleExecuteBuy(ctx, tokenAddress, amount);
    }

    if (data.startsWith("backtotoken_")) {
      const tokenAddress = data.replace("backtotoken_", "");
      return handleBackToToken(ctx, tokenAddress);
    }

    if (data.startsWith("tokensettings_")) {
      const tokenAddress = data.replace("tokensettings_", "");
      return handleTokenSettings(ctx, tokenAddress);
    }

    if (data.startsWith("setslip_")) {
      const parts = data.replace("setslip_", "").split("_");
      const tokenAddress = parts[0];
      const slippage = parts[1];
      return handleSetSlippage(ctx, tokenAddress, slippage);
    }

    if (data.startsWith("selectwallet_")) {
      const tokenAddress = data.replace("selectwallet_", "");
      return handleSelectWallet(ctx, tokenAddress);
    }

    if (data.startsWith("confirmwallet_")) {
      const tokenAddress = data.replace("confirmwallet_", "");
      return handleConfirmWallet(ctx, tokenAddress);
    }

    if (data.startsWith("custombuy_")) {
      const tokenAddress = data.replace("custombuy_", "");
      return handleCustomBuy(ctx, tokenAddress);
    }

    if (data.startsWith("toggleauto_")) {
      const tokenAddress = data.replace("toggleauto_", "");
      return handleToggleAutoTPSL(ctx, tokenAddress);
    }

  } catch (error: any) {
    console.error("Callback error:", error);
    await ctx.answerCbQuery("❌ Error: " + error.message);
  }
}