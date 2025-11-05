import { supabase } from '../config/supabase';

export interface Trade {
  id: string;
  user_id: string;
  telegram_id: number;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  entry_price: number;
  current_price?: number;
  tp_price?: number;
  sl_price?: number;
  trailing_sl?: number;
  status: 'open' | 'closed' | 'cancelled';
  pnl?: number;
  pnl_percentage?: number;
  opened_at: string;
  closed_at?: string;
  exchange_type: 'cex' | 'dex';
  exchange_name?: string;
  token_address?: string;
  slippage?: number;
  auto_tp_sl?: boolean;
}

export interface MemecoinTrade extends Trade {
  token_address: string;
  token_decimals: number;
  token_symbol: string;
  dex: 'raydium' | 'jupiter' | 'orca';
}

// Create standard trade
export async function createTrade(
  userId: string,
  telegramId: number,
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  entryPrice: number,
  exchangeOrderId?: string,
  exchangeType: 'cex' | 'dex' = 'cex'
): Promise<Trade> {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      telegram_id: telegramId,
      symbol,
      side,
      amount,
      entry_price: entryPrice,
      current_price: entryPrice,
      exchange_order_id: exchangeOrderId,
      status: 'open',
      exchange_type: exchangeType,
      auto_tp_sl: false,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to create trade: ' + error.message);
  return data;
}

// Create memecoin trade
export async function createMemecoinTrade(
  userId: string,
  telegramId: number,
  tokenAddress: string,
  tokenSymbol: string,
  tokenDecimals: number,
  side: 'buy' | 'sell',
  amount: number,
  entryPrice: number,
  dex: 'raydium' | 'jupiter' | 'orca',
  slippage: number = 1
): Promise<Trade> {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      telegram_id: telegramId,
      symbol: tokenSymbol,
      side,
      amount,
      entry_price: entryPrice,
      current_price: entryPrice,
      status: 'open',
      exchange_type: 'dex',
      exchange_name: dex,
      token_address: tokenAddress,
      slippage,
      auto_tp_sl: true,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to create memecoin trade: ' + error.message);
  return data;
}

// Get open trades
export async function getOpenTrades(telegramId: number): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false });

  if (error) throw new Error('Failed to fetch trades: ' + error.message);
  return data || [];
}

// Get all trades with filters
export async function getTrades(
  telegramId: number,
  filters?: {
    status?: string;
    exchangeType?: 'cex' | 'dex';
    limit?: number;
  }
): Promise<Trade[]> {
  let query = supabase
    .from('trades')
    .select('*')
    .eq('telegram_id', telegramId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.exchangeType) {
    query = query.eq('exchange_type', filters.exchangeType);
  }

  query = query.order('opened_at', { ascending: false });

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw new Error('Failed to fetch trades: ' + error.message);
  return data || [];
}

// Update trade price
export async function updateTradePrice(
  tradeId: string,
  currentPrice: number
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ 
      current_price: currentPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to update trade price: ' + error.message);
}

// Set take profit
export async function setTakeProfit(
  tradeId: string,
  tpPrice: number
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ 
      tp_price: tpPrice,
      auto_tp_sl: true,
    })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to set TP: ' + error.message);
}

// Set stop loss
export async function setStopLoss(
  tradeId: string,
  slPrice: number
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ 
      sl_price: slPrice,
      auto_tp_sl: true,
    })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to set SL: ' + error.message);
}

// Set trailing stop loss
export async function setTrailingStopLoss(
  tradeId: string,
  trailingPercent: number
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ 
      trailing_sl: trailingPercent,
      auto_tp_sl: true,
    })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to set trailing SL: ' + error.message);
}

// Close trade
export async function closeTrade(
  tradeId: string,
  closePrice: number,
  pnl: number,
  pnlPercentage: number
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({
      status: 'closed',
      current_price: closePrice,
      pnl,
      pnl_percentage: pnlPercentage,
      closed_at: new Date().toISOString(),
    })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to close trade: ' + error.message);
}

// Get trade by ID
export async function getTradeById(tradeId: string): Promise<Trade | null> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', tradeId)
    .single();

  if (error) return null;
  return data;
}

// Get portfolio stats
export async function getPortfolioStats(telegramId: number) {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('telegram_id', telegramId);

  if (error || !trades) {
    return null;
  }

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalInvested = openTrades.reduce((sum, t) => sum + t.amount, 0);
  
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).length;
  const winRate = closedTrades.length > 0 
    ? (winningTrades / closedTrades.length) * 100 
    : 0;

  return {
    totalTrades: trades.length,
    openTrades: openTrades.length,
    closedTrades: closedTrades.length,
    totalPnl,
    totalInvested,
    winningTrades,
    losingTrades,
    winRate,
    avgPnlPerTrade: closedTrades.length > 0 ? totalPnl / closedTrades.length : 0,
  };
}

// Enable/disable auto TP/SL
export async function toggleAutoTPSL(
  tradeId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .update({ auto_tp_sl: enabled })
    .eq('id', tradeId);

  if (error) throw new Error('Failed to toggle auto TP/SL: ' + error.message);
}