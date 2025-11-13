// api/bot.ts
import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';
import * as commands from '../src/bot/handlers/commands';
import { handleCallback } from '../src/bot/handlers/callbacks';
import { handleTextMessage } from '../src/bot/handlers/messages';
import * as userService from '../src/services/userService';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Middleware
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

// Commands
bot.command('start', commands.handleStart);
bot.command('connect', commands.handleConnect);
bot.command('portfolio', commands.handlePortfolio);
bot.command('searchtoken', commands.handleSearchToken);
bot.command('wallet', commands.handleWallet);

// Callbacks & Texts
bot.on('callback_query', handleCallback);
bot.on('text', handleTextMessage);

// Webhook entry with health check
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Health check for GET requests
    if (req.method === 'GET') {
      return res.status(200).json({ 
        status: 'ok',
        bot: 'Netan Trading Bot',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    }

    // Handle webhook POST
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ ok: true });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err: any) {
    console.error('❌ Bot Webhook Error:', err);
    return res.status(500).json({ 
      error: 'Webhook failed', 
      message: err.message 
    });
  }
}