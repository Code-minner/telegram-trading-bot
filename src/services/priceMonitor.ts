import cron from "node-cron";
import * as tradeService from "./tradeService";
import * as exchangeService from "./exchangeService";
import { dexService } from "./dexService";
import * as userService from "./userService";
import { Telegraf } from "telegraf";

export class PriceMonitor {
  private bot: Telegraf;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  // Start monitoring
  start() {
    if (this.isRunning) {
      console.log("⚠️  Price monitor already running");
      return;
    }

    console.log("🔍 Starting price monitor...");
    this.isRunning = true;

    // Check prices every 10 seconds
    this.checkInterval = setInterval(async () => {
      await this.checkAllTrades();
    }, 10000);

    // Also run a cron job every minute as backup
    cron.schedule("* * * * *", async () => {
      await this.checkAllTrades();
    });

    console.log("✅ Price monitor started");
  }

  // Stop monitoring
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("⏹️  Price monitor stopped");
  }

  // Check all open trades
  private async checkAllTrades() {
    try {
      const { data: trades, error } = await (
        await import("../config/supabase")
      ).supabase
        .from("trades")
        .select("*")
        .eq("status", "open")
        .eq("auto_tp_sl", true);

      if (error || !trades || trades.length === 0) {
        return;
      }

      for (const trade of trades) {
        await this.checkTrade(trade);
      }
    } catch (error) {
      console.error("Error checking trades:", error);
    }
  }

  // Check individual trade
  private async checkTrade(trade: any) {
    try {
      let currentPrice: number;

      // Get current price based on exchange type
      if (trade.exchange_type === "dex") {
        currentPrice = await dexService.getTokenPrice(trade.token_address);
      } else {
        const keys = await userService.getDecryptedApiKeys(trade.telegram_id);
        if (!keys) return;

        const exchange = await exchangeService.createExchangeInstance(
          keys.exchange as exchangeService.SupportedExchange,
          keys.apiKey,
          keys.apiSecret,
          process.env.USE_TESTNET === "true"
        );

        currentPrice = await exchangeService.getCurrentPrice(
          exchange,
          trade.symbol
        );
      }

      // Update current price
      await tradeService.updateTradePrice(trade.id, currentPrice);

      // NEW: Track highest price for trailing SL
      if (trade.trailing_sl) {
        const highestPrice = trade.highest_price || trade.entry_price;
        if (currentPrice > highestPrice) {
          await tradeService.updateHighestPrice(trade.id, currentPrice);
          console.log(
            `📈 ${trade.symbol}: New high $${currentPrice.toFixed(8)}`
          );
        }
      }

      // Check TP/SL conditions
      const shouldCloseTrade = this.shouldCloseTrade(trade, currentPrice);

      if (shouldCloseTrade.close) {
        await this.executeTradeClosure(
          trade,
          currentPrice,
          shouldCloseTrade.reason
        );
      }
    } catch (error) {
      console.error(`Error checking trade ${trade.id}:`, error);
    }
  }

  // Determine if trade should be closed
  // Determine if trade should be closed
  private shouldCloseTrade(
    trade: any,
    currentPrice: number
  ): { close: boolean; reason: string } {
    if (trade.side === "buy") {
      // Check take profit
      if (trade.tp_price && currentPrice >= trade.tp_price) {
        return { close: true, reason: "Take Profit Hit" };
      }

      // Check stop loss
      if (trade.sl_price && currentPrice <= trade.sl_price) {
        return { close: true, reason: "Stop Loss Hit" };
      }

      // Check trailing stop loss (FIXED!)
      if (trade.trailing_sl) {
        const highestPrice = trade.highest_price || trade.entry_price;
        const trailingStopPrice = highestPrice * (1 - trade.trailing_sl / 100);

        if (currentPrice <= trailingStopPrice) {
          return { close: true, reason: "Trailing Stop Loss Hit" };
        }
      }
    } else {
      // For sell positions
      if (trade.tp_price && currentPrice <= trade.tp_price) {
        return { close: true, reason: "Take Profit Hit" };
      }

      if (trade.sl_price && currentPrice >= trade.sl_price) {
        return { close: true, reason: "Stop Loss Hit" };
      }
    }

    return { close: false, reason: "" };
  }

  // Execute trade closure
  private async executeTradeClosure(
    trade: any,
    currentPrice: number,
    reason: string
  ) {
    try {
      console.log(`🔔 Closing trade ${trade.id} - ${reason}`);

      // Execute the closing order
      if (trade.exchange_type === "dex") {
        await this.closeDEXTrade(trade, currentPrice);
      } else {
        await this.closeCEXTrade(trade, currentPrice);
      }

      // Calculate P&L
      const pnl = this.calculatePnL(trade, currentPrice);
      const pnlPercentage =
        ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

      // Close trade in database
      await tradeService.closeTrade(trade.id, currentPrice, pnl, pnlPercentage);

      // Notify user
      await this.notifyUser(trade, currentPrice, pnl, pnlPercentage, reason);

      console.log(`✅ Trade ${trade.id} closed successfully`);
    } catch (error) {
      console.error(`Error closing trade ${trade.id}:`, error);
    }
  }

  // Close CEX trade
  private async closeCEXTrade(trade: any, currentPrice: number) {
    const keys = await userService.getDecryptedApiKeys(trade.telegram_id);
    if (!keys) throw new Error("API keys not found");

    const exchange = await exchangeService.createExchangeInstance(
      keys.exchange as exchangeService.SupportedExchange,
      keys.apiKey,
      keys.apiSecret,
      process.env.USE_TESTNET === "true"
    );

    if (trade.side === "buy") {
      await exchangeService.executeMarketSell(
        exchange,
        trade.symbol,
        trade.amount
      );
    } else {
      await exchangeService.executeMarketBuy(
        exchange,
        trade.symbol,
        trade.amount
      );
    }
  }

  // Close DEX trade
  private async closeDEXTrade(trade: any, currentPrice: number) {
    // Get user's specific wallet private key (FIXED!)
    const privateKey = await userService.getDecryptedSolanaWalletNew(
      trade.telegram_id
    );

    if (!privateKey) {
      throw new Error("User wallet not found");
    }

    if (trade.side === "buy") {
      // Sell the tokens back to SOL
      const result = await dexService.sellMemecoin(
        privateKey,
        trade.token_address,
        trade.amount,
        trade.slippage || 1
      );

      if (!result) {
        throw new Error("Failed to execute sell on DEX");
      }

      console.log(`✅ DEX sell executed: ${result.signature}`);
    }
  }

  // Calculate P&L
  private calculatePnL(trade: any, closePrice: number): number {
    if (trade.side === "buy") {
      return (closePrice - trade.entry_price) * trade.amount;
    } else {
      return (trade.entry_price - closePrice) * trade.amount;
    }
  }

  // Notify user via Telegram
  private async notifyUser(
    trade: any,
    closePrice: number,
    pnl: number,
    pnlPercentage: number,
    reason: string
  ) {
    try {
      const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
      const pnlSign = pnl >= 0 ? "+" : "";
      const sideEmoji = trade.side === "buy" ? "📈" : "📉";

      const message =
        `🔔 *${reason}*\n\n` +
        `${sideEmoji} ${trade.symbol} ${trade.side.toUpperCase()}\n` +
        `💰 Entry: $${trade.entry_price.toFixed(6)}\n` +
        `💵 Exit: $${closePrice.toFixed(6)}\n` +
        `${pnlEmoji} P&L: ${pnlSign}$${pnl.toFixed(
          2
        )} (${pnlSign}${pnlPercentage.toFixed(2)}%)\n\n` +
        `✅ Position automatically closed`;

      await this.bot.telegram.sendMessage(trade.telegram_id, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Failed to notify user:", error);
    }
  }

  // Get monitoring status
  getStatus() {
    return {
      isRunning: this.isRunning,
      message: this.isRunning
        ? "Price monitor is active"
        : "Price monitor is stopped",
    };
  }
}

export let priceMonitor: PriceMonitor;

export function initializePriceMonitor(bot: Telegraf) {
  priceMonitor = new PriceMonitor(bot);
  priceMonitor.start();
  return priceMonitor;
}
