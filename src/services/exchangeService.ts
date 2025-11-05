import * as ccxt from 'ccxt';

export type SupportedExchange = 'binance' | 'bybit' | 'okx' | 'kucoin' | 'gateio' | 'bitget';

export async function createExchangeInstance(
  exchangeName: SupportedExchange,
  apiKey: string,
  apiSecret: string,
  testnet: boolean = true
): Promise<ccxt.Exchange> {
  let exchange: ccxt.Exchange;

  switch (exchangeName.toLowerCase()) {
    case 'bybit':
      exchange = new ccxt.bybit({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });
      if (testnet) {
        exchange.setSandboxMode(true);
      }
      break;

    case 'okx':
      exchange = new ccxt.okx({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });
      if (testnet) {
        exchange.setSandboxMode(true);
      }
      break;

    case 'kucoin':
      exchange = new ccxt.kucoin({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });
      if (testnet) {
        exchange.setSandboxMode(true);
      }
      break;

    case 'gateio':
      exchange = new ccxt.gateio({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });
      break;

    case 'bitget':
      exchange = new ccxt.bitget({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });
      break;

    case 'binance':
    default:
      exchange = new ccxt.binance({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        options: {
          defaultType: 'spot',
        },
      });
      if (testnet) {
        exchange.setSandboxMode(true);
      }
      break;
  }

  return exchange;
}

export async function verifyApiKeys(
  exchangeName: SupportedExchange,
  apiKey: string,
  apiSecret: string
): Promise<boolean> {
  try {
    const exchange = await createExchangeInstance(exchangeName, apiKey, apiSecret, true);
    await exchange.fetchBalance();
    return true;
  } catch (error) {
    console.error('API verification error:', error);
    return false;
  }
}

export async function getCurrentPrice(exchange: ccxt.Exchange, symbol: string): Promise<number> {
  const ticker = await exchange.fetchTicker(symbol);
  return ticker.last || 0;
}

export async function executeMarketBuy(
  exchange: ccxt.Exchange,
  symbol: string,
  amount: number
): Promise<ccxt.Order> {
  return await exchange.createMarketBuyOrder(symbol, amount);
}

export async function executeMarketSell(
  exchange: ccxt.Exchange,
  symbol: string,
  amount: number
): Promise<ccxt.Order> {
  return await exchange.createMarketSellOrder(symbol, amount);
}