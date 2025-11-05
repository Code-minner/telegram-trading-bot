import { Telegraf } from 'telegraf';
import { NowRequest, NowResponse } from '@vercel/node';

const bot = new Telegraf(process.env.BOT_TOKEN!);

bot.start((ctx) => ctx.reply('🤖 Your bot is live on Vercel!'));
bot.hears('hello', (ctx) => ctx.reply('👋 Hello there!'));

export default async function handler(req: NowRequest, res: NowResponse) {
  try {
    // Handle Telegram updates
    await bot.handleUpdate(req.body);
    res.status(200).send('ok');
  } catch (error) {
    console.error('Bot handler error:', error);
    res.status(500).send('error');
  }
}
