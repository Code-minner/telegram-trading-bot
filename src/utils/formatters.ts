// Helper functions for formatting numbers and prices

export function formatNumber(num: number): string {
  if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

export function formatPrice(price: number, decimals: number = 8): string {
  return price.toFixed(decimals);
}

export function formatPercentage(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatAddress(address: string, startChars: number = 4, endChars: number = 4): string {
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}