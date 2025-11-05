// bot/handlers/commands.ts
import { Context, Markup } from 'telegraf';
import * as userService from '../../services/userService';
import * as tradeService from '../../services/tradeService';
import { getMainMenu } from '../ui/menus';
import { handleWalletCommand } from './walletHandlers';


export async function handleStart(ctx: Context) {
  if (!ctx.from) return;
  
  const userId = ctx.from.id;
  
  // Get connection status
  const connectionStatus = await userService.getConnectionStatus(userId);
  const walletDetails = await userService.getWalletDetails(userId);
  
  // Build status text
  let statusText = '📊 *Your Status:*\n';
  
  // CEX Status
  if (connectionStatus.hasCEX) {
    statusText += `🟢 CEX: ${connectionStatus.exchange?.toUpperCase()} Connected\n`;
  } else {
    statusText += `🔴 CEX: Not Connected\n`;
  }
  
  // DEX Status
  if (walletDetails?.connected) {
    statusText += `🟢 DEX: Solana Connected\n`;
    statusText += `💼 Wallets: ${walletDetails.walletCount}\n`;
    if (walletDetails.totalBalance > 0) {
      statusText += `💰 Balance: ${walletDetails.totalBalance.toFixed(4)} SOL\n`;
    }
    if (walletDetails.primaryWallet) {
      statusText += `⭐ Primary: ${walletDetails.primaryWallet}\n`;
    }
  } else {
    statusText += `🔴 DEX: Not Connected\n`;
  }

  await ctx.reply(
    `🤖 *Advanced Trading Bot*\n\n` +
    `Welcome back! Ready to trade?\n\n` +
    `${statusText}\n` +
    `💡 *Quick Actions:*\n` +
    `• 📈 Trade crypto on CEX\n` +
    `• 🪙 Trade Solana memecoins\n` +
    `• 💼 Manage wallets with /wallet\n` +
    `• 📊 View positions\n\n` +
    `Select an option below:`,
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
}

export async function handleConnect(ctx: Context) {
  if (!ctx.from || !('text' in ctx.message!)) return;
  
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const parts = text.split(' ');

  if (parts.length !== 4) {
    await ctx.reply(
      '❌ *Invalid Format*\n\n' +
      'Usage: `/connect <exchange> <api_key> <api_secret>`\n\n' +
      'Example:\n' +
      '`/connect bybit your_key your_secret`\n\n' +
      'Supported exchanges:\n' +
      '• bybit (recommended)\n' +
      '• binance, okx, kucoin, gateio, bitget\n\n' +
      '⚠️ *Delete your message after sending!*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [, exchange, apiKey, apiSecret] = parts;

  try {
    await ctx.reply('⏳ Verifying API credentials...');

    await userService.saveApiKeys(userId, exchange, apiKey, apiSecret);

    await ctx.reply(
      `✅ *Connected to ${exchange.toUpperCase()}*\n\n` +
      `Your API keys are encrypted and stored securely.\n\n` +
      `⚠️ *Important:* Delete your previous message now!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 Check Balance', 'menu_balance')],
          [Markup.button.callback('📈 Start Trading', 'menu_buy')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

    // Auto-delete the connect message after 30 seconds
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(ctx.message!.message_id);
      } catch (e) {
        console.log('Could not auto-delete connect message');
      }
    }, 30000);

  } catch (error: any) {
    await ctx.reply(
      `❌ *Connection Failed*\n\n` +
      `Error: ${error.message}\n\n` +
      `Please check:\n` +
      `• API credentials are correct\n` +
      `• API has trading permissions\n` +
      `• Exchange name is correct`,
      { parse_mode: 'Markdown' }
    );
  }
}

export async function handlePortfolio(ctx: Context) {
  if (!ctx.from) return;
  
  const userId = ctx.from.id;
  
  await ctx.reply('⏳ Loading portfolio...', { parse_mode: 'Markdown' });

  const stats = await tradeService.getPortfolioStats(userId);

  if (!stats) {
    await ctx.reply(
      `📊 *Portfolio*\n\n` +
      `No trading history yet.\n\n` +
      `Start trading to see your stats!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📈 CEX', 'menu_buy'),
            Markup.button.callback('🪙 Memecoins', 'menu_memecoins')
          ],
          [Markup.button.callback('« Back', 'back_main')]
        ])
      }
    );
    return;
  }

  const winRateEmoji = stats.winRate >= 60 ? '🟢' : stats.winRate >= 40 ? '🟡' : '🔴';
  const pnlEmoji = stats.totalPnl >= 0 ? '🟢' : '🔴';

  await ctx.reply(
    `📊 *Your Portfolio*\n\n` +
    `*Overall Performance:*\n` +
    `${pnlEmoji} Total P&L: ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}\n` +
    `💵 Invested: $${stats.totalInvested.toFixed(2)}\n\n` +
    `*Statistics:*\n` +
    `📈 Total Trades: ${stats.totalTrades}\n` +
    `🟢 Open: ${stats.openTrades}\n` +
    `⚪ Closed: ${stats.closedTrades}\n\n` +
    `*Win Rate:*\n` +
    `${winRateEmoji} ${stats.winRate.toFixed(1)}%\n` +
    `✅ Winners: ${stats.winningTrades}\n` +
    `❌ Losers: ${stats.losingTrades}\n\n` +
    `*Average:*\n` +
    `💰 Per Trade: ${stats.avgPnlPerTrade >= 0 ? '+' : ''}$${stats.avgPnlPerTrade.toFixed(2)}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'menu_portfolio')],
        [Markup.button.callback('📊 Positions', 'menu_status')],
        [Markup.button.callback('🏠 Main Menu', 'back_main')]
      ])
    }
  );
}

export async function handleSearchToken(ctx: Context) {
  await ctx.reply(
    `🔍 *Search Token*\n\n` +
    `Send me:\n` +
    `• Token name or symbol\n` +
    `• Token contract address\n\n` +
    `I'll fetch the latest info!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Cancel', 'back_main')]
      ])
    }
  );
}

export async function handleWallet(ctx: Context) {
  await handleWalletCommand(ctx);
}

export async function showDetailedStatus(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  
  let message = `📊 *Account Overview*\n\n`;

  // CEX Status
  const cexKeys = await userService.getDecryptedApiKeys(userId);
  if (cexKeys) {
    message += `🏦 *CEX Trading*\n`;
    message += `✅ Connected: ${cexKeys.exchange.toUpperCase()}\n\n`;
  } else {
    message += `🏦 *CEX Trading*\n`;
    message += `❌ Not Connected\n`;
    message += `Use /connect to set up\n\n`;
  }

  // DEX Status
  try {
    const { getUserWallets } = require('../../services/walletService');
    const wallets = await getUserWallets(userId);
    
    if (wallets.length > 0) {
      const totalBalance = wallets.reduce((sum: number, w: any) => sum + (w.balance || 0), 0);
      const primary = wallets.find((w: any) => w.is_primary);
      
      message += `💼 *Solana Wallets*\n`;
      message += `✅ ${wallets.length} wallet${wallets.length > 1 ? 's' : ''} connected\n`;
      message += `💰 Total: ${totalBalance.toFixed(4)} SOL\n`;
      if (primary) {
        message += `⭐ Primary: ${primary.wallet_name}\n`;
      }
      message += `\n`;
    } else {
      message += `💼 *Solana Wallets*\n`;
      message += `❌ No wallets\n`;
      message += `Use /wallet to create\n\n`;
    }
  } catch (e) {
    message += `💼 *Solana Wallets*\n`;
    message += `❌ Not Connected\n\n`;
  }

  // Trading Stats
  try {
    const stats = await tradeService.getPortfolioStats(userId);
    if (stats && stats.totalTrades > 0) {
      message += `📈 *Trading Stats*\n`;
      message += `Total Trades: ${stats.totalTrades}\n`;
      message += `Open: ${stats.openTrades} | Closed: ${stats.closedTrades}\n`;
      message += `P&L: ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}\n`;
      message += `Win Rate: ${stats.winRate.toFixed(1)}%\n`;
    }
  } catch (e) {
    // No stats
  }

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', 'status_refresh')],
      [Markup.button.callback('💼 Manage Wallets', 'menu_wallets')],
      [Markup.button.callback('🏠 Main Menu', 'back_main')]
    ])
  });
}