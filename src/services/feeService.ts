// services/feeService.ts - Fee Collection and Tracking Service

import { supabase } from '../config/supabase';

export interface FeeRecord {
  id: string;
  trade_id?: string;
  user_id: string;
  telegram_id: number;
  fee_amount: number;
  original_amount: number;
  fee_percentage: number;
  transaction_signature?: string;
  status: 'collected' | 'failed' | 'pending';
  collected_at: string;
  created_at: string;
}

/**
 * Record a collected fee in the database
 */
export async function recordFee(
  userId: string,
  telegramId: number,
  originalAmount: number,
  feeAmount: number,
  tradeId?: string,
  signature?: string
): Promise<FeeRecord | null> {
  try {
    const { data, error } = await supabase
      .from('fees')
      .insert({
        trade_id: tradeId,
        user_id: userId,
        telegram_id: telegramId,
        original_amount: originalAmount,
        fee_amount: feeAmount,
        fee_percentage: 0.005, // 0.5%
        transaction_signature: signature,
        status: signature ? 'collected' : 'failed',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to record fee:', error);
      return null;
    }

    console.log(`✅ Fee recorded: ${feeAmount} SOL from user ${telegramId}`);
    return data;
    
  } catch (error) {
    console.error('Error recording fee:', error);
    return null;
  }
}

/**
 * Update trade with fee information
 */
export async function updateTradeWithFee(
  tradeId: string,
  feeAmount: number,
  feeSignature?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('trades')
      .update({
        fee_amount: feeAmount,
        fee_collected: !!feeSignature,
        fee_signature: feeSignature,
      })
      .eq('id', tradeId);

    if (error) {
      console.error('Failed to update trade with fee:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating trade with fee:', error);
    return false;
  }
}

/**
 * Get total fees collected from a user
 */
export async function getUserTotalFees(telegramId: number): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('fees')
      .select('fee_amount')
      .eq('telegram_id', telegramId)
      .eq('status', 'collected');

    if (error) {
      console.error('Failed to get user fees:', error);
      return 0;
    }

    const total = data.reduce((sum, fee) => sum + parseFloat(fee.fee_amount.toString()), 0);
    return total;
    
  } catch (error) {
    console.error('Error getting user fees:', error);
    return 0;
  }
}

/**
 * Get total fees collected (all users)
 */
export async function getTotalFeesCollected(): Promise<{
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}> {
  try {
    const { data, error } = await supabase
      .from('fees')
      .select('fee_amount, collected_at')
      .eq('status', 'collected');

    if (error) {
      console.error('Failed to get total fees:', error);
      return { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totals = {
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    };

    for (const fee of data) {
      const amount = parseFloat(fee.fee_amount.toString());
      const date = new Date(fee.collected_at);

      totals.total += amount;
      if (date >= today) totals.today += amount;
      if (date >= weekAgo) totals.thisWeek += amount;
      if (date >= monthAgo) totals.thisMonth += amount;
    }

    return totals;
    
  } catch (error) {
    console.error('Error getting total fees:', error);
    return { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };
  }
}

/**
 * Get fee statistics
 */
export async function getFeeStatistics(): Promise<{
  totalCollected: number;
  totalTransactions: number;
  uniqueUsers: number;
  averageFee: number;
  successRate: number;
}> {
  try {
    const { data: allFees, error: allError } = await supabase
      .from('fees')
      .select('fee_amount, telegram_id, status');

if (allError) {
      console.error('Failed to get fee statistics:', allError);
      return {
        totalCollected: 0,
        totalTransactions: 0,
        uniqueUsers: 0,
        averageFee: 0,
        successRate: 0,
      };
    }

    const collected = allFees.filter(f => f.status === 'collected');
    const totalCollected = collected.reduce((sum, f) => sum + parseFloat(f.fee_amount.toString()), 0);
    const uniqueUsers = new Set(allFees.map(f => f.telegram_id)).size;
    const averageFee = collected.length > 0 ? totalCollected / collected.length : 0;
    const successRate = allFees.length > 0 ? (collected.length / allFees.length) * 100 : 0;

    return {
      totalCollected,
      totalTransactions: allFees.length,
      uniqueUsers,
      averageFee,
      successRate,
    };
    
  } catch (error) {
    console.error('Error getting fee statistics:', error);
    return {
      totalCollected: 0,
      totalTransactions: 0,
      uniqueUsers: 0,
      averageFee: 0,
      successRate: 0,
    };
  }
}

/**
 * Calculate fee amount (0.5%)
 */
export function calculateFee(amount: number, feePercentage: number = 0.005): number {
  return amount * feePercentage;
}

/**
 * Get amount after fee deduction
 */
export function getAmountAfterFee(amount: number, feePercentage: number = 0.005): number {
  return amount * (1 - feePercentage);
}