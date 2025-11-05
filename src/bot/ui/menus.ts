// bot/ui/menus.ts
import { Markup } from 'telegraf';

export function getMainMenu() {
  return Markup.inlineKeyboard([
    // --- Header Section ---
    [
      Markup.button.callback('💰 Balance', 'menu_balance'),
      Markup.button.callback('📊 Positions', 'menu_positions'),
      Markup.button.callback('🪙 Memecoins', 'menu_memecoins')
    ],

    // --- Trading Section ---
    [
      Markup.button.callback('📈 CEX Buy', 'menu_buy'),
      Markup.button.callback('📉 CEX Sell', 'menu_sell'),
      Markup.button.callback('🎯 Limit Orders', 'menu_limit'),
      Markup.button.callback('🧠 Copy Trades', 'menu_copy')
    ],

    // --- Sniper & Market Section ---
    [
      Markup.button.callback('🚀 Sniper V1', 'menu_sniper_v1'),
      Markup.button.callback('💎 Sniper V2', 'menu_sniper_v2'),
      Markup.button.callback('🔥 Pump Sniper', 'menu_sniper_pumpfun'),
      Markup.button.callback('🌕 Moonshot', 'menu_sniper_moonshot')
    ],

    // --- Wallets & Portfolio ---
    [
      Markup.button.callback('💼 Wallets', 'menu_wallets'),
      Markup.button.callback('📊 Portfolio', 'menu_portfolio'),
      Markup.button.callback('💸 Transfer', 'menu_transfer'),
      Markup.button.callback('🔐 Connect', 'menu_connect')
    ],

    // --- Tools Section ---
    [
      Markup.button.callback('⚙️ Settings', 'menu_settings'),
      Markup.button.callback('🧰 Tools', 'menu_tools'),
      Markup.button.callback('🤖 Market Maker', 'menu_mm'),
      Markup.button.callback('🏦 Backups', 'menu_backup')
    ],

    // --- Rewards & Referrals ---
    [
      Markup.button.callback('🎁 Cashback', 'menu_cashback'),
      Markup.button.callback('👥 Referral', 'menu_referrals'),
      Markup.button.callback('📈 Stats', 'menu_stats')
    ],

    // --- Help Section ---
    [
      Markup.button.callback('📚 Tutorials', 'menu_tutorials'),
      Markup.button.callback('❓ Help', 'menu_help'),
      Markup.button.callback('🔒 Security', 'menu_security')
    ],

    // --- Footer (Close / Exit) ---
    [
      Markup.button.callback('❌ Close', 'menu_close')
    ]
  ]);
}

export function getMemecoinMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💎 Buy', 'meme_buy'),
      Markup.button.callback('📉 Sell', 'meme_sell')
    ],
    [
      Markup.button.callback('🔍 Search', 'meme_search'),
      Markup.button.callback('🔥 Trending', 'meme_trending')
    ],
    [
      Markup.button.callback('📊 Positions', 'meme_positions'),
      Markup.button.callback('💰 Balance', 'meme_balance')
    ],
    [
      Markup.button.callback('🔐 Connect Wallet', 'meme_connect_wallet')
    ],
    [
      Markup.button.callback('« Back', 'back_main')
    ]
  ]);
}

export function getBuyMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('BTC/USDT', 'buy_BTC/USDT'),
      Markup.button.callback('ETH/USDT', 'buy_ETH/USDT')
    ],
    [
      Markup.button.callback('SOL/USDT', 'buy_SOL/USDT'),
      Markup.button.callback('BNB/USDT', 'buy_BNB/USDT')
    ],
    [
      Markup.button.callback('XRP/USDT', 'buy_XRP/USDT'),
      Markup.button.callback('ADA/USDT', 'buy_ADA/USDT')
    ],
    [
      Markup.button.callback('DOGE/USDT', 'buy_DOGE/USDT'),
      Markup.button.callback('DOT/USDT', 'buy_DOT/USDT')
    ],
    [
      Markup.button.callback('🔍 Custom Pair', 'buy_custom')
    ],
    [
      Markup.button.callback('« Back', 'back_main')
    ]
  ]);
}

export function getSellMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('BTC/USDT', 'sell_BTC/USDT'),
      Markup.button.callback('ETH/USDT', 'sell_ETH/USDT')
    ],
    [
      Markup.button.callback('SOL/USDT', 'sell_SOL/USDT'),
      Markup.button.callback('BNB/USDT', 'sell_BNB/USDT')
    ],
    [
      Markup.button.callback('XRP/USDT', 'sell_XRP/USDT'),
      Markup.button.callback('ADA/USDT', 'sell_ADA/USDT')
    ],
    [
      Markup.button.callback('DOGE/USDT', 'sell_DOGE/USDT'),
      Markup.button.callback('DOT/USDT', 'sell_DOT/USDT')
    ],
    [
      Markup.button.callback('🔍 Custom Pair', 'sell_custom')
    ],
    [
      Markup.button.callback('« Back', 'back_main')
    ]
  ]);
}

export function getAmountMenu(action: 'buy' | 'sell', symbol: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('$10', `amount_${action}_${symbol}_10`),
      Markup.button.callback('$25', `amount_${action}_${symbol}_25`),
      Markup.button.callback('$50', `amount_${action}_${symbol}_50`)
    ],
    [
      Markup.button.callback('$100', `amount_${action}_${symbol}_100`),
      Markup.button.callback('$250', `amount_${action}_${symbol}_250`),
      Markup.button.callback('$500', `amount_${action}_${symbol}_500`)
    ],
    [
      Markup.button.callback('$1000', `amount_${action}_${symbol}_1000`),
      Markup.button.callback('$2500', `amount_${action}_${symbol}_2500`)
    ],
    [
      Markup.button.callback('💵 Custom Amount', `custom_${action}_${symbol}`)
    ],
    [
      Markup.button.callback('« Back', `menu_${action}`)
    ]
  ]);
}

export function getMemecoinAmountMenu(tokenAddress: string, action: 'buy' | 'sell') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('0.1 SOL', `memeamount_${action}_${tokenAddress}_0.1`),
      Markup.button.callback('0.25 SOL', `memeamount_${action}_${tokenAddress}_0.25`)
    ],
    [
      Markup.button.callback('0.5 SOL', `memeamount_${action}_${tokenAddress}_0.5`),
      Markup.button.callback('1 SOL', `memeamount_${action}_${tokenAddress}_1`)
    ],
    [
      Markup.button.callback('2 SOL', `memeamount_${action}_${tokenAddress}_2`),
      Markup.button.callback('5 SOL', `memeamount_${action}_${tokenAddress}_5`)
    ],
    [
      Markup.button.callback('10 SOL', `memeamount_${action}_${tokenAddress}_10`)
    ],
    [
      Markup.button.callback('« Back', 'menu_memecoins')
    ]
  ]);
}

export function getTokenDisplayMenu(tokenAddress: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💎 Buy', `memebuy_${tokenAddress}`),
      Markup.button.callback('🔄 Refresh', `refresh_${tokenAddress}`)
    ],
    [
      Markup.button.callback('📊 Track', `track_${tokenAddress}`),
      Markup.button.callback('🔗 View on Explorer', `explorer_${tokenAddress}`)
    ],
    [
      Markup.button.callback('❌ Close', 'close_token')
    ]
  ]);
}

export function getSettingsMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎯 Risk Profile', 'settings_risk')
    ],
    [
      Markup.button.callback('🔐 Manage Connections', 'menu_connect')
    ],
    [
      Markup.button.callback('🤖 Auto TP/SL', 'settings_auto_tp_sl')
    ],
    [
      Markup.button.callback('« Back', 'back_main')
    ]
  ]);
}

export function getRiskProfileMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🟢 Conservative', 'risk_conservative')
    ],
    [
      Markup.button.callback('🟡 Moderate', 'risk_moderate')
    ],
    [
      Markup.button.callback('🔴 Aggressive', 'risk_aggressive')
    ],
    [
      Markup.button.callback('« Back', 'menu_settings')
    ]
  ]);
}

export function getTradeManagementMenu(tradeId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎯 Set TP', `settp_${tradeId}`),
      Markup.button.callback('🛡️ Set SL', `setsl_${tradeId}`)
    ],
    [
      Markup.button.callback('🔄 Trailing SL', `settrailing_${tradeId}`)
    ],
    [
      Markup.button.callback('🔴 Close Position', `closepos_${tradeId}`)
    ],
    [
      Markup.button.callback('« Back', 'menu_status')
    ]
  ]);
}