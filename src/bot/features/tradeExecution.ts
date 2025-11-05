// bot/features/tradeExecution.ts
import { Context, Markup } from 'telegraf';
import * as userService from '../../services/userService';
import * as exchangeService from '../../services/exchangeService';
import * as tradeService from '../../services/tradeService';
import { dexService } from '../../services/dexService';
import * as riskManager from '../../utils/riskManager';

/**
 * Execute CEX trade (Buy/Sell on centralized exchange)
 */
export async function executeCEXTrade(
  ctx: Context,
  userId: number,
  action: 'buy' | 'sell',
  symbol: string,
  amount: number
) {
  try {
    await ctx.editMessageText(
      `⏳ Executing ${action.toUpperCase()} order for ${symbol}...\n\n` +
      `Amount: $${amount}`,
      { parse_mode: 'Markdown' }
    );

    // Get user's API keys
    const keys = await userService.getDecryptedApiKeys(userId);
    
    if (!keys) {
      throw new Error('API keys not found. Please reconnect.');
    }

    // Create exchange instance
    const exchange = await exchangeService.createExchangeInstance(
      keys.exchange as exchangeService.SupportedExchange,
      keys.apiKey,
      keys.apiSecret,
      process.env.USE_TESTNET === 'true'
    );

    // Execute trade
    let order;
    if (action === 'buy') {
      order = await exchangeService.executeMarketBuy(exchange, symbol, amount);
    } else {
      order = await exchangeService.executeMarketSell(exchange, symbol, amount);
    }

    // Save trade to database
    const user = (ctx as any).state.user;
    const trade = await tradeService.createTrade(
      user.id,
      userId,
      symbol,
      action,
      amount,
      order.price || 0,
      order.id,
      'cex'
    );

    // Success message
    const sideEmoji = action === 'buy' ? '📈' : '📉';
    
    await ctx.editMessageText(
      `✅ *${action.toUpperCase()} Order Executed*\n\n` +
      `${sideEmoji} ${symbol}\n` +
      `💵 Amount: $${amount}\n` +
      `💰 Price: $${order.price?.toFixed(2)}\n` +
      `🆔 Order ID: ${order.id}\n\n` +
      `Want to set TP/SL with auto-execution?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🎯 Set TP', `settp_${trade.id}`),
            Markup.button.callback('🛡️ Set SL', `setsl_${trade.id}`)
          ],
          [Markup.button.callback('📊 View Positions', 'menu_status')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

    return { success: true, trade };
  } catch (error: any) {
    console.error('CEX trade error:', error);
    
    await ctx.editMessageText(
      `❌ *Trade Failed*\n\n` +
      `Error: ${error.message}\n\n` +
      `Please check:\n` +
      `• Sufficient balance\n` +
      `• API permissions\n` +
      `• Exchange status`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', action === 'buy' ? 'menu_buy' : 'menu_sell')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

    return { success: false, error: error.message };
  }
}

/**
 * Execute DEX memecoin trade (Buy/Sell on Solana DEX)
 */
export async function executeDEXTrade(
  ctx: Context,
  userId: number,
  action: 'buy' | 'sell',
  tokenAddress: string,
  amount: number
) {
  try {
    await ctx.editMessageText(
      `⏳ Executing ${action.toUpperCase()}...\n\n` +
      `Amount: ${amount} SOL\n` +
      `Please wait...`,
      { parse_mode: 'Markdown' }
    );

    // Check wallet connection
    const hasWallet = await userService.hasDEXConnection(userId);
    if (!hasWallet) {
      throw new Error('Wallet not connected');
    }

    // Get private key
    const privateKey = await userService.getDecryptedSolanaWallet(userId);
    if (!privateKey) {
      throw new Error('Private key not found');
    }

    // Get token info
    const tokenInfo = await dexService.getTokenInfo(tokenAddress);
    if (!tokenInfo) {
      throw new Error('Token not found');
    }

    let result;
    let entryPrice: number;

    if (action === 'buy') {
      // Execute buy
      result = await dexService.buyMemecoin(
        privateKey,
        tokenAddress,
        amount,
        1 // 1% slippage
      );

      if (!result) {
        throw new Error('Swap failed');
      }

      entryPrice = tokenInfo.price || 0;

      // Save trade
      const user = (ctx as any).state.user;
      const trade = await tradeService.createMemecoinTrade(
        user.id,
        userId,
        tokenAddress,
        tokenInfo.symbol,
        tokenInfo.decimals,
        'buy',
        amount,
        entryPrice,
        'jupiter',
        1
      );

      // Success message
      await ctx.editMessageText(
        `✅ *BUY Order Executed*\n\n` +
        `🪙 ${tokenInfo.symbol}\n` +
        `💵 ${amount} SOL\n` +
        `💰 Price: $${entryPrice.toFixed(8)}\n` +
        `📊 Tokens: ${(parseFloat(result.tokensReceived) / 1e9).toFixed(2)}\n` +
        `🆔 TX: \`${result.signature.slice(0, 8)}...\`\n\n` +
        `Want to set TP/SL?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🎯 Set TP', `settp_${trade.id}`),
              Markup.button.callback('🛡️ Set SL', `setsl_${trade.id}`)
            ],
            [Markup.button.callback('📊 Positions', 'menu_status')],
            [Markup.button.callback('🏠 Main Menu', 'back_main')]
          ])
        }
      );

      return { success: true, trade, result };
    } else {
      // Execute sell
      result = await dexService.sellMemecoin(
        privateKey,
        tokenAddress,
        amount * 1e9, // Convert to smallest unit
        1 // 1% slippage
      );

      if (!result) {
        throw new Error('Swap failed');
      }

      entryPrice = tokenInfo.price || 0;
      const solReceived = parseFloat(result.solReceived) / 1e9;

      // Success message
      await ctx.editMessageText(
        `✅ *SELL Order Executed*\n\n` +
        `🪙 ${tokenInfo.symbol}\n` +
        `💰 Received: ${solReceived.toFixed(4)} SOL\n` +
        `🆔 TX: \`${result.signature.slice(0, 8)}...\`\n\n` +
        `Position closed!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Portfolio', 'menu_portfolio')],
            [Markup.button.callback('🏠 Main Menu', 'back_main')]
          ])
        }
      );

      return { success: true, result };
    }

  } catch (error: any) {
    console.error('DEX trade error:', error);
    
    await ctx.editMessageText(
      `❌ *Trade Failed*\n\n` +
      `Error: ${error.message}\n\n` +
      `Please try again or check your wallet.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', 'menu_memecoins')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

    return { success: false, error: error.message };
  }
}

/**
 * Close a position (CEX or DEX)
 */
export async function closePosition(
  ctx: Context,
  userId: number,
  tradeId: string
) {
  try {
    await ctx.editMessageText('⏳ Closing position...', { parse_mode: 'Markdown' });

    const trade = await tradeService.getTradeById(tradeId);

    if (!trade) {
      throw new Error('Trade not found');
    }

    let currentPrice: number;
    
    if (trade.exchange_type === 'dex' && trade.token_address) {
      // Close DEX position
      const privateKey = await userService.getDecryptedSolanaWallet(userId);
      if (!privateKey) {
        throw new Error('Wallet not found');
      }

      currentPrice = await dexService.getTokenPrice(trade.token_address);

      await dexService.sellMemecoin(
        privateKey,
        trade.token_address,
        trade.amount * 1e9,
        1
      );
    } else {
      // Close CEX position
      const keys = await userService.getDecryptedApiKeys(userId);
      if (!keys) {
        throw new Error('API keys not found');
      }

      const exchange = await exchangeService.createExchangeInstance(
        keys.exchange as exchangeService.SupportedExchange,
        keys.apiKey,
        keys.apiSecret,
        process.env.USE_TESTNET === 'true'
      );

      currentPrice = await exchangeService.getCurrentPrice(exchange, trade.symbol);

      if (trade.side === 'buy') {
        await exchangeService.executeMarketSell(exchange, trade.symbol, trade.amount);
      } else {
        await exchangeService.executeMarketBuy(exchange, trade.symbol, trade.amount);
      }
    }

    // Calculate P&L
    const pnl = trade.side === 'buy' 
      ? (currentPrice - trade.entry_price!) * trade.amount
      : (trade.entry_price! - currentPrice) * trade.amount;
    
    const pnlPercentage = ((currentPrice - trade.entry_price!) / trade.entry_price!) * 100;

    // Update trade in database
    await tradeService.closeTrade(trade.id, currentPrice, pnl, pnlPercentage);

    // Success message
    const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
    const pnlSign = pnl >= 0 ? '+' : '';
    const typeEmoji = trade.exchange_type === 'dex' ? '🪙' : '💱';

    await ctx.editMessageText(
      `✅ *Position Closed*\n\n` +
      `${typeEmoji} ${trade.symbol}\n` +
      `💰 Entry: $${trade.entry_price?.toFixed(6)}\n` +
      `💵 Exit: $${currentPrice.toFixed(6)}\n` +
      `${pnlEmoji} P&L: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPercentage.toFixed(2)}%)\n\n` +
      `Trade closed successfully!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 View Positions', 'menu_status')],
          [Markup.button.callback('📈 Portfolio', 'menu_portfolio')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

    return { success: true, pnl, pnlPercentage };
  } catch (error: any) {
    console.error('Close position error:', error);
    
    await ctx.editMessageText(
      `❌ *Failed to Close*\n\n` +
      `Error: ${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'menu_status')]
        ])
      }
    );

    return { success: false, error: error.message };
  }
}