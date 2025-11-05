// src/bot/handlers/cexHandlers.ts - CEX Trading Handlers (CORRECTED)
import { Context, Markup } from 'telegraf';
import * as userService from '../../services/userService';
import * as exchangeService from '../../services/exchangeService';
import * as tradeService from '../../services/tradeService';
import * as menus from '../ui/menus';

// User states for multi-step flows
const tradingStates = new Map<number, any>();

/**
 * Handle CEX Buy menu
 */
export async function handleBuyMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const keys = await userService.getDecryptedApiKeys(userId);

  if (!keys) {
    await ctx.editMessageText(
      `❌ *CEX Not Connected*\n\n` +
      `Connect your exchange first to trade crypto.\n\n` +
      `Use /connect <exchange> <api_key> <api_secret>`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📚 How to Connect', 'help_connect')],
          [Markup.button.callback('« Back', 'back_main')]
        ])
      }
    );
    return;
  }

  await ctx.editMessageText(
    `📈 *Buy Crypto*\n\n` +
    `🏦 Connected: ${keys.exchange.toUpperCase()}\n\n` +
    `Select a trading pair:`,
    {
      parse_mode: 'Markdown',
      ...menus.getBuyMenu()
    }
  );
}

/**
 * Handle CEX Sell menu
 */
export async function handleSellMenu(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const keys = await userService.getDecryptedApiKeys(userId);

  if (!keys) {
    await ctx.editMessageText(
      `❌ *CEX Not Connected*\n\n` +
      `Connect your exchange first to trade crypto.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📚 How to Connect', 'help_connect')],
          [Markup.button.callback('« Back', 'back_main')]
        ])
      }
    );
    return;
  }

  await ctx.editMessageText(
    `📉 *Sell Crypto*\n\n` +
    `🏦 Connected: ${keys.exchange.toUpperCase()}\n\n` +
    `Select a trading pair:`,
    {
      parse_mode: 'Markdown',
      ...menus.getSellMenu()
    }
  );
}

/**
 * Handle pair selection
 */
export async function handlePairSelection(
  ctx: Context,
  action: 'buy' | 'sell',
  symbol: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  await ctx.answerCbQuery('Loading...');

  try {
    // Get current price
    const keys = await userService.getDecryptedApiKeys(userId);
    if (!keys) throw new Error('Exchange not connected');

    const exchange = await exchangeService.createExchangeInstance(
      keys.exchange as exchangeService.SupportedExchange,
      keys.apiKey,
      keys.apiSecret,
      process.env.USE_TESTNET === 'true'
    );

    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last || 0;

    let message = `${action === 'buy' ? '📈' : '📉'} *${action.toUpperCase()} ${symbol}*\n\n`;
    message += `💰 Current Price: $${price.toFixed(2)}\n`;
    message += `📊 24h High: $${ticker.high?.toFixed(2) || 'N/A'}\n`;
    message += `📊 24h Low: $${ticker.low?.toFixed(2) || 'N/A'}\n\n`;
    message += `Select amount to ${action}:`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...menus.getAmountMenu(action, symbol)
    });

  } catch (error: any) {
    console.error('Pair selection error:', error);
    await ctx.editMessageText(
      `❌ *Error Loading ${symbol}*\n\n` +
      `${error.message}\n\n` +
      `Try another pair or check your connection.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', `${action}_${symbol}`)],
          [Markup.button.callback('« Back', `menu_${action}`)]
        ])
      }
    );
  }
}

/**
 * Handle amount selection
 */
export async function handleAmountSelection(
  ctx: Context,
  action: 'buy' | 'sell',
  symbol: string,
  amountUSD: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  await ctx.answerCbQuery('Preparing order...');

  try {
    const amount = parseFloat(amountUSD);

    // Get current price and calculate quantity
    const keys = await userService.getDecryptedApiKeys(userId);
    if (!keys) throw new Error('Exchange not connected');

    const exchange = await exchangeService.createExchangeInstance(
      keys.exchange as exchangeService.SupportedExchange,
      keys.apiKey,
      keys.apiSecret,
      process.env.USE_TESTNET === 'true'
    );

    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last || 0;
    const quantity = amount / price;

    // Estimate fees (0.1% for most exchanges)
    const estimatedFee = amount * 0.001;
    const totalCost = action === 'buy' ? amount + estimatedFee : amount - estimatedFee;

    let message = `⚡ *Confirm ${action.toUpperCase()}*\n\n`;
    message += `📊 Pair: ${symbol}\n`;
    message += `💰 Price: $${price.toFixed(2)}\n`;
    message += `💵 Amount: $${amount}\n`;
    message += `📦 Quantity: ${quantity.toFixed(8)}\n`;
    message += `💸 Est. Fee: $${estimatedFee.toFixed(2)}\n`;
    message += `💰 Total: $${totalCost.toFixed(2)}\n\n`;
    message += `⚡ Order Type: Market\n`;
    message += `⏱️ Execution: Instant\n\n`;
    message += `Proceed with this order?`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm', `confirm_${action}_${symbol}_${amount}`),
          Markup.button.callback('❌ Cancel', `menu_${action}`)
        ]
      ])
    });

  } catch (error: any) {
    console.error('Amount selection error:', error);
    await ctx.editMessageText(
      `❌ *Error Preparing Order*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', `${action}_${symbol}`)]
        ])
      }
    );
  }
}

/**
 * Execute trade
 */
export async function handleConfirmTrade(
  ctx: Context,
  action: 'buy' | 'sell',
  symbol: string,
  amountUSD: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const amount = parseFloat(amountUSD);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⏳ *Executing ${action.toUpperCase()} Order...*\n\n` +
    `Please wait...`,
    { parse_mode: 'Markdown' }
  );

  try {
    // Get user and exchange
    const user = await userService.getUserByTelegramId(userId);
    if (!user) throw new Error('User not found');

    const keys = await userService.getDecryptedApiKeys(userId);
    if (!keys) throw new Error('Exchange not connected');

    const exchange = await exchangeService.createExchangeInstance(
      keys.exchange as exchangeService.SupportedExchange,
      keys.apiKey,
      keys.apiSecret,
      process.env.USE_TESTNET === 'true'
    );

    // Get current price
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last || 0;
    const quantity = amount / price;

    // Execute market order
    const order = action === 'buy' 
      ? await exchange.createMarketBuyOrder(symbol, quantity)
      : await exchange.createMarketSellOrder(symbol, quantity);

    // Calculate actual filled values
    const filledPrice = order.average || order.price || price;
    const filledAmount = (order.filled || quantity) * filledPrice;

    // Save trade to database using the correct function signature
    const trade = await tradeService.createTrade(
      user.id,              // userId: string
      userId,               // telegramId: number
      symbol,               // symbol: string
      action,               // side: 'buy' | 'sell'
      filledAmount,         // amount: number
      filledPrice,          // entryPrice: number
      order.id,             // exchangeOrderId?: string
      'cex'                 // exchangeType: 'cex' | 'dex'
    );

    // Success message
    let message = `✅ *Order Executed!*\n\n`;
    message += `📊 ${symbol}\n`;
    message += `${action === 'buy' ? '📈' : '📉'} ${action.toUpperCase()}\n\n`;
    message += `💰 Entry Price: $${filledPrice.toFixed(2)}\n`;
    message += `💵 Amount: $${filledAmount.toFixed(2)}\n`;
    message += `📦 Quantity: ${(order.filled || quantity).toFixed(8)}\n`;
    message += `🆔 Order ID: ${order.id}\n\n`;
    message += `🤖 Auto TP/SL: ENABLED\n`;
    message += `📊 Position saved and being monitored`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Manage Position', `manage_${trade.id}`)],
        [Markup.button.callback('📊 View Positions', 'menu_positions')],
        [Markup.button.callback('🏠 Main Menu', 'back_main')]
      ])
    });

  } catch (error: any) {
    console.error('Trade execution error:', error);
    
    let errorMessage = `❌ *Order Failed*\n\n`;
    errorMessage += `Error: ${error.message}\n\n`;
    
    // Helpful error messages
    if (error.message.includes('insufficient')) {
      errorMessage += `💡 Check your balance and try a smaller amount.`;
    } else if (error.message.includes('permission')) {
      errorMessage += `💡 Check your API key has trading permissions.`;
    } else {
      errorMessage += `💡 Try again or contact support.`;
    }

    await ctx.editMessageText(errorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Retry', `${action}_${symbol}`)],
        [Markup.button.callback('💰 Check Balance', 'menu_balance')],
        [Markup.button.callback('« Back', 'back_main')]
      ])
    });
  }
}

/**
 * Handle custom amount input
 */
export async function handleCustomAmount(
  ctx: Context,
  action: 'buy' | 'sell',
  symbol: string
) {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  
  // Set user state
  tradingStates.set(userId, {
    action: 'custom_amount',
    tradeAction: action,
    symbol: symbol
  });

  await ctx.editMessageText(
    `💵 *Custom Amount*\n\n` +
    `${action === 'buy' ? '📈' : '📉'} ${action.toUpperCase()} ${symbol}\n\n` +
    `Send the amount in USD you want to ${action}.\n\n` +
    `Examples:\n` +
    `• 15\n` +
    `• 75.50\n` +
    `• 3000\n\n` +
    `Min: $5 | Max: Your balance`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', `${action}_${symbol}`)]
      ])
    }
  );
}

/**
 * Process custom amount from text input
 */
export async function processCustomAmount(ctx: Context, text: string, userId: number) {
  const state = tradingStates.get(userId);
  
  if (!state || state.action !== 'custom_amount') {
    return false;
  }

  const amount = parseFloat(text);

  if (isNaN(amount) || amount < 5) {
    await ctx.reply('❌ Invalid amount. Please send a number greater than $5.');
    return true;
  }

  // Clear state
  tradingStates.delete(userId);

  // Process the order
  await handleAmountSelection(ctx, state.tradeAction, state.symbol, amount.toString());
  return true;
}

/**
 * Export trading states for use in message handler
 */
export { tradingStates };