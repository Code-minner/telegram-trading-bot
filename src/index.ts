// src/index.ts - Simplified main bot file
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import * as userService from './services/userService';
import { initializePriceMonitor } from './services/priceMonitor';

// Import modular handlers
import * as commands from './bot/handlers/commands';
import { handleCallback } from './bot/handlers/callbacks';
import { handleTextMessage } from './bot/handlers/messages';


dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Initialize price monitor
let priceMonitor: any;

// ========== MIDDLEWARE ==========
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  
  let user = await userService.getUserByTelegramId(ctx.from.id);
  
  if (!user) {
    user = await userService.createUser(
      ctx.from.id,
      ctx.from.username || `user_${ctx.from.id}`,
      'bybit'
    );
  }
  
  (ctx as any).state = { user };
  return next();
});

// ========== COMMAND HANDLERS ==========
bot.command('start', commands.handleStart);
bot.command('connect', commands.handleConnect);
bot.command('portfolio', commands.handlePortfolio);
bot.command('searchtoken', commands.handleSearchToken);
bot.command('wallet', commands.handleWallet);

// ========== CALLBACK HANDLER (All Button Clicks) ==========
bot.on('callback_query', handleCallback);

// ========== TEXT MESSAGE HANDLER ==========
bot.on('text', handleTextMessage);

// ========== BOT LAUNCH ==========
bot.launch()
  .then(() => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 ADVANCED TRADING BOT STARTED');
    console.log('='.repeat(60));
    console.log('\n📊 Status: ONLINE');
    console.log('🎨 Interface: Modular & Scalable Architecture');
    console.log('\n💼 Features:');
    console.log('   ✅ CEX Trading (Spot)');
    console.log('   ✅ DEX Trading (Solana Memecoins)');
    console.log('   ✅ Auto Token Detection');
    console.log('   ✅ Auto TP/SL (24/7 monitoring)');
    console.log('   ✅ Smart Position Sizing');
    console.log('   ✅ Risk Management');
    console.log('   ✅ Portfolio Analytics');
    console.log('   ✅ Trailing Stop Loss');
    console.log('\n🏦 Supported:');
    console.log('   CEX: Bybit, Binance, OKX, KuCoin, Gate.io, Bitget');
    console.log('   DEX: Jupiter (Solana)');
    console.log('\n' + '='.repeat(60));
    console.log('✨ Bot is ready! Use /start in Telegram');
    console.log('💡 Just paste any Solana token address to test!\n');
    
    if (process.env.ENABLE_AUTO_TP_SL === 'true') {
      priceMonitor = initializePriceMonitor(bot);
      console.log('🤖 Price monitor initialized and running\n');
    }
  })
  .catch((error) => {
    console.error('\n❌ FAILED TO START BOT');
    console.error('Error:', error.message);
    console.error('\nPlease check:');
    console.error('1. TELEGRAM_BOT_TOKEN in .env file');
    console.error('2. Network connection');
    console.error('3. All dependencies installed\n');
    process.exit(1);
  });

// ========== GRACEFUL SHUTDOWN ==========
const gracefulShutdown = (signal: string) => {
  console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);
  
  if (priceMonitor) {
    priceMonitor.stop();
  }
  
  bot.stop(signal);
  console.log('✅ Bot stopped successfully\n');
  process.exit(0);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ========== ERROR HANDLERS ==========
bot.catch((error: any, ctx: any) => {
  console.error('❌ Bot Error:', error);
  console.error('Update:', ctx.update);
  
  try {
    ctx.reply('❌ An error occurred. Please try again or contact support.');
  } catch (e) {
    console.error('Failed to send error message to user');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  console.error('Bot will continue running...');
});

console.log('📝 Bot script loaded successfully');