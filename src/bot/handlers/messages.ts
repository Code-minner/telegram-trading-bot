// bot/handlers/messages.ts - UPDATED WITH CEX AND WALLET SUPPORT
import { Context, Markup } from 'telegraf';
import { dexService } from '../../services/dexService';
import * as userService from '../../services/userService';
import * as tradeService from '../../services/tradeService';
import * as riskManager from '../../utils/riskManager';
import { handleTokenAddressMessage } from '../features/tokenDisplay';
import { userStates } from './callbacks';
import { processCustomAmount } from './cexHandlers';
import { handleWalletTextInput } from './walletHandlers';

export async function handleTextMessage(ctx: Context) {
  if (!ctx.from || !('text' in ctx.message!)) return;
  
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Check for wallet operations FIRST (import wallet, name wallet)
  const handledWallet = await handleWalletTextInput(ctx, text, userId);
  if (handledWallet) return;

  // Check for CEX custom amount input
  const handledCustom = await processCustomAmount(ctx, text, userId);
  if (handledCustom) return;

  const state = userStates.get(userId);

  // Check token address - works for any Solana token address
  const handled = await handleTokenAddressMessage(ctx, text, userId);
  if (handled) {
    userStates.delete(userId);
    return;
  }

  // If no state, ignore
  if (!state) return;

  try {
    // Token search
    if (state.action === 'search_token' || state.action === 'buy_memecoin_search') {
      await handleTokenSearch(ctx, text, userId, state.action === 'buy_memecoin_search');
    }

    // Connect Solana wallet
    else if (state.action === 'connect_solana_wallet') {
      await handleWalletConnection(ctx, text, userId);
    }

    // Set TP
    else if (state.action === 'set_tp') {
      await handleSetTakeProfit(ctx, text, state.tradeId);
    }

    // Set SL
    else if (state.action === 'set_sl') {
      await handleSetStopLoss(ctx, text, state.tradeId);
    }

    // Set Trailing SL
    else if (state.action === 'set_trailing') {
      await handleSetTrailing(ctx, text, state.tradeId);
    }

    // Custom buy amount for memecoins
    else if (state.action === 'custom_buy_amount') {
      await handleCustomMemecoinBuy(ctx, text, state.tokenAddress);
    }

  } catch (error: any) {
    console.error('Text handler error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
    userStates.delete(userId);
  }
}

async function handleTokenSearch(ctx: Context, query: string, userId: number, isBuyAction: boolean) {
  await ctx.reply('🔍 Searching...');

  const tokens = await dexService.searchTokens(query);

  if (tokens.length === 0) {
    await ctx.reply(
      '❌ No tokens found.\n\nTry:\n• Different spelling\n• Token address',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'menu_memecoins')]
        ])
      }
    );
    userStates.delete(userId);
    return;
  }

  let message = `🔍 *Results*\n\n`;
  const buttons: any[] = [];

  for (const token of tokens.slice(0, 10)) {
    message += `*${token.symbol}* - ${token.name}\n`;
    message += `💰 $${token.price?.toFixed(8) || 'N/A'}\n`;
    message += `📊 MC: $${riskManager.formatAmount(token.marketCap || 0)}\n\n`;

    buttons.push([
      Markup.button.callback(
        `${isBuyAction ? 'Buy' : 'View'} ${token.symbol}`,
        `memebuy_${token.address}`
      )
    ]);
  }

  buttons.push([Markup.button.callback('« Back', 'menu_memecoins')]);

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });

  userStates.delete(userId);
}

async function handleWalletConnection(ctx: Context, privateKey: string, userId: number) {
  await ctx.reply('⏳ Verifying...');

  try {
    if (!privateKey || privateKey.length < 32) {
      throw new Error('Invalid private key');
    }

    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');
    const wallet = Keypair.fromSecretKey(bs58.default.decode(privateKey));

    await userService.saveSolanaWallet(userId, privateKey);

    const publicKey = wallet.publicKey.toString();

    await ctx.reply(
      `✅ *Connected!*\n\n` +
      `Address: \`${publicKey.slice(0, 4)}...${publicKey.slice(-4)}\`\n\n` +
      `⚠️ *Delete your message now!*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🪙 Memecoins', 'menu_memecoins')],
          [Markup.button.callback('🏠 Main', 'back_main')]
        ])
      }
    );

    // Auto-delete
    try {
      await ctx.deleteMessage(ctx.message!.message_id);
    } catch (e) {
      console.log('Could not auto-delete');
    }
  } catch (error: any) {
    await ctx.reply(
      `❌ *Invalid Key*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', 'meme_connect_wallet')],
          [Markup.button.callback('« Back', 'menu_memecoins')]
        ])
      }
    );
  }

  userStates.delete(userId);
}

async function handleSetTakeProfit(ctx: Context, priceText: string, tradeId: string) {
  const price = parseFloat(priceText);

  if (isNaN(price) || price <= 0) {
    await ctx.reply('❌ Invalid price.');
    return;
  }

  const trade = await tradeService.getTradeById(tradeId);

  if (!trade) {
    await ctx.reply('❌ Trade not found.');
    userStates.delete(ctx.from!.id);
    return;
  }

  await tradeService.setTakeProfit(tradeId, price);
  
  await ctx.reply(
    `✅ *TP Set*\n\n` +
    `📊 ${trade.symbol}\n` +
    `🎯 TP: $${price.toFixed(6)}\n` +
    `🤖 Auto: ENABLED`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Positions', 'menu_status')],
        [Markup.button.callback('🏠 Main', 'back_main')]
      ])
    }
  );

  userStates.delete(ctx.from!.id);
}

async function handleSetStopLoss(ctx: Context, priceText: string, tradeId: string) {
  const price = parseFloat(priceText);

  if (isNaN(price) || price <= 0) {
    await ctx.reply('❌ Invalid price.');
    return;
  }

  const trade = await tradeService.getTradeById(tradeId);

  if (!trade) {
    await ctx.reply('❌ Trade not found.');
    userStates.delete(ctx.from!.id);
    return;
  }

  await tradeService.setStopLoss(tradeId, price);
  
  await ctx.reply(
    `✅ *SL Set*\n\n` +
    `📊 ${trade.symbol}\n` +
    `🛡️ SL: $${price.toFixed(6)}\n` +
    `🤖 Auto: ENABLED`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Positions', 'menu_status')],
        [Markup.button.callback('🏠 Main', 'back_main')]
      ])
    }
  );

  userStates.delete(ctx.from!.id);
}

async function handleSetTrailing(ctx: Context, percentText: string, tradeId: string) {
  const percent = parseFloat(percentText);

  if (isNaN(percent) || percent <= 0) {
    await ctx.reply('❌ Invalid percentage.');
    return;
  }

  const trade = await tradeService.getTradeById(tradeId);

  if (!trade) {
    await ctx.reply('❌ Trade not found.');
    userStates.delete(ctx.from!.id);
    return;
  }

  await tradeService.setTrailingStopLoss(tradeId, percent);
  
  await ctx.reply(
    `✅ *Trailing SL Set*\n\n` +
    `📊 ${trade.symbol}\n` +
    `🔄 Trailing: ${percent}%\n` +
    `🤖 Auto: ENABLED`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Positions', 'menu_status')],
        [Markup.button.callback('🏠 Main', 'back_main')]
      ])
    }
  );

  userStates.delete(ctx.from!.id);
}

async function handleCustomMemecoinBuy(ctx: Context, amountText: string, tokenAddress: string) {
  const amount = parseFloat(amountText);

  if (isNaN(amount) || amount < 0.01) {
    await ctx.reply('❌ Invalid amount. Min: 0.01 SOL');
    return;
  }

  if (!ctx.from) return;

  const userId = ctx.from.id;

  // Clear state
  userStates.delete(userId);

  // Get token info
  const tokenInfo = await dexService.getTokenInfo(tokenAddress);
  if (!tokenInfo) {
    await ctx.reply('❌ Token not found.');
    return;
  }

  // Check balance
  const privateKey = await userService.getDecryptedSolanaWalletNew(userId);
  if (!privateKey) {
    await ctx.reply('❌ Wallet not found.');
    return;
  }

  const balance = await dexService.getWalletBalance(privateKey);
  if (balance < amount) {
    await ctx.reply(
      `❌ *Insufficient*\n\n` +
      `Have: ${balance.toFixed(4)} SOL\n` +
      `Need: ${amount} SOL`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'menu_memecoins')]
        ])
      }
    );
    return;
  }

  const price = await dexService.getTokenPrice(tokenAddress);
  const estimatedTokens = (amount / price) * 0.99;

  await ctx.reply(
    `⚡ *Confirm*\n\n` +
    `Token: *${tokenInfo.symbol}*\n` +
    `Amount: *${amount} SOL*\n` +
    `Est: ~${estimatedTokens.toFixed(2)}\n\n` +
    `Proceed?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm', `confirm_buy_${tokenAddress}_${amount}`),
          Markup.button.callback('❌ Cancel', 'menu_memecoins')
        ]
      ])
    }
  );
}