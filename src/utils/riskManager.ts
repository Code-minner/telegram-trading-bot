// Risk Management and Position Sizing Utilities

export interface RiskProfile {
  accountBalance: number;
  riskPercentage: number; // % of account to risk per trade
  maxPositionSize: number; // Maximum position size in USD
  maxOpenTrades: number;
}

export interface PositionSizeResult {
  positionSize: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskAmount: number;
  rewardAmount: number;
  riskRewardRatio: number;
}

// Calculate position size based on risk
export function calculatePositionSize(
  accountBalance: number,
  riskPercentage: number,
  entryPrice: number,
  stopLossPrice: number
): number {
  const riskAmount = accountBalance * (riskPercentage / 100);
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  
  if (riskPerShare === 0) return 0;
  
  return riskAmount / riskPerShare;
}

// Calculate stop loss price based on percentage
export function calculateStopLossPrice(
  entryPrice: number,
  stopLossPercentage: number,
  side: 'buy' | 'sell'
): number {
  if (side === 'buy') {
    return entryPrice * (1 - stopLossPercentage / 100);
  } else {
    return entryPrice * (1 + stopLossPercentage / 100);
  }
}

// Calculate take profit price based on risk/reward ratio
export function calculateTakeProfitPrice(
  entryPrice: number,
  stopLossPrice: number,
  riskRewardRatio: number,
  side: 'buy' | 'sell'
): number {
  const risk = Math.abs(entryPrice - stopLossPrice);
  const reward = risk * riskRewardRatio;
  
  if (side === 'buy') {
    return entryPrice + reward;
  } else {
    return entryPrice - reward;
  }
}

// Get recommended position size with TP/SL
export function getRecommendedPosition(
  accountBalance: number,
  riskPercentage: number,
  entryPrice: number,
  stopLossPercentage: number,
  riskRewardRatio: number,
  side: 'buy' | 'sell'
): PositionSizeResult {
  const stopLossPrice = calculateStopLossPrice(entryPrice, stopLossPercentage, side);
  const takeProfitPrice = calculateTakeProfitPrice(entryPrice, stopLossPrice, riskRewardRatio, side);
  const positionSize = calculatePositionSize(accountBalance, riskPercentage, entryPrice, stopLossPrice);
  
  const riskAmount = accountBalance * (riskPercentage / 100);
  const rewardAmount = riskAmount * riskRewardRatio;
  
  return {
    positionSize: Math.floor(positionSize * 100) / 100,
    stopLossPrice: Math.floor(stopLossPrice * 1000000) / 1000000,
    takeProfitPrice: Math.floor(takeProfitPrice * 1000000) / 1000000,
    riskAmount: Math.floor(riskAmount * 100) / 100,
    rewardAmount: Math.floor(rewardAmount * 100) / 100,
    riskRewardRatio,
  };
}

// Validate trade before execution
export function validateTrade(
  positionSize: number,
  accountBalance: number,
  maxPositionPercentage: number = 20,
  currentOpenPositions: number = 0,
  maxOpenPositions: number = 5
): { valid: boolean; reason: string } {
  // Check if position size exceeds account balance
  if (positionSize > accountBalance) {
    return {
      valid: false,
      reason: 'Position size exceeds account balance',
    };
  }

  // Check if position size exceeds max position percentage
  const positionPercentage = (positionSize / accountBalance) * 100;
  if (positionPercentage > maxPositionPercentage) {
    return {
      valid: false,
      reason: `Position size exceeds ${maxPositionPercentage}% of account`,
    };
  }

  // Check max open positions
  if (currentOpenPositions >= maxOpenPositions) {
    return {
      valid: false,
      reason: `Maximum ${maxOpenPositions} open positions reached`,
    };
  }

  return { valid: true, reason: 'Trade validated' };
}

// Calculate optimal slippage for trade size
export function calculateOptimalSlippage(
  positionSizeUSD: number,
  tokenLiquidity: number
): number {
  // Base slippage of 0.5%
  let slippage = 0.5;

  // If position is larger than 1% of liquidity, increase slippage
  const positionImpact = (positionSizeUSD / tokenLiquidity) * 100;

  if (positionImpact > 1) {
    slippage = Math.min(positionImpact * 0.5, 5); // Cap at 5%
  }

  return Math.ceil(slippage * 10) / 10; // Round up to 1 decimal
}

// Format amount for display
export function formatAmount(amount: number, decimals: number = 2): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(decimals)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(decimals)}K`;
  }
  return amount.toFixed(decimals);
}

// Calculate breakeven price with fees
export function calculateBreakevenPrice(
  entryPrice: number,
  feePercentage: number = 0.1,
  side: 'buy' | 'sell'
): number {
  const totalFee = feePercentage * 2; // Entry + Exit fees
  
  if (side === 'buy') {
    return entryPrice * (1 + totalFee / 100);
  } else {
    return entryPrice * (1 - totalFee / 100);
  }
}

// Get risk level emoji and text
export function getRiskLevel(
  positionSizePercentage: number
): { emoji: string; level: string; color: string } {
  if (positionSizePercentage <= 5) {
    return { emoji: '🟢', level: 'Low Risk', color: 'green' };
  } else if (positionSizePercentage <= 10) {
    return { emoji: '🟡', level: 'Medium Risk', color: 'yellow' };
  } else if (positionSizePercentage <= 20) {
    return { emoji: '🟠', level: 'High Risk', color: 'orange' };
  } else {
    return { emoji: '🔴', level: 'Very High Risk', color: 'red' };
  }
}

// Default risk profiles
export const RISK_PROFILES = {
  conservative: {
    riskPercentage: 1,
    maxPositionSize: 10,
    maxOpenTrades: 3,
    stopLossPercentage: 2,
    riskRewardRatio: 3,
  },
  moderate: {
    riskPercentage: 2,
    maxPositionSize: 15,
    maxOpenTrades: 5,
    stopLossPercentage: 3,
    riskRewardRatio: 2,
  },
  aggressive: {
    riskPercentage: 5,
    maxPositionSize: 25,
    maxOpenTrades: 10,
    stopLossPercentage: 5,
    riskRewardRatio: 1.5,
  },
};