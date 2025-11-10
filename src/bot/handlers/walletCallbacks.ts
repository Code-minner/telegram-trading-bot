// bot/handlers/walletCallbacks.ts - COMPATIBILITY WRAPPER
// This file is kept for backwards compatibility
// All functionality is now in walletHandlers.ts

import { Context } from 'telegraf';
import { 
  handleWalletCallbacks as handleCallbacks,
  handleWalletCommand,
  walletStates
} from './walletHandlers';

/**
 * Main callback handler - delegates to walletHandlers
 */
export function handleWalletCallbacks(ctx: Context): boolean {
  return handleCallbacks(ctx);
}

/**
 * Re-export wallet command for convenience
 */
export { handleWalletCommand, walletStates };

/**
 * Noop handler for buttons that don't need action
 */
export async function handleNoop(ctx: Context) {
  await ctx.answerCbQuery();
}

// Note: All other wallet functions are now internal to walletHandlers.ts
// This includes:
// - handleGenerateWallet → now handleCreateWallet (internal)
// - handleImportWallet (internal)
// - handleViewWallet → now handleSelectWallet (internal)
// - handleRefreshBalances → now part of handleWalletCommand
// - handleSetPrimaryWallet → now handleSetPrimary (internal)
// - handleExportPrivateKey (removed - security risk)
// - handleDeleteWallet (internal)
// - handleDeleteWalletConfirm → now handleConfirmDelete (internal)

// These are all handled automatically by handleWalletCallbacks