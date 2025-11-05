// src/bot/handlers/walletCallbacks.ts
import { Context } from 'telegraf';
import {
  handleWalletCommand,
  handleGenerateWallet,
  handleImportWallet,
  handleViewWallet,
  handleRefreshBalances,
  handleSetPrimaryWallet,
  handleExportPrivateKey,
  handleExportPrivateKeyConfirm,
  handleDeleteWalletConfirm,
  handleDeleteWallet,
  handleNoop
} from './walletHandlers';

// Register all wallet-related callbacks
export function handleWalletCallbacks(ctx: Context): boolean {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return false;
  }

  const action = ctx.callbackQuery.data;

  // Main wallet menu
  if (action === 'menu_wallets') {
    handleWalletCommand(ctx);
    return true;
  }

  // Generate new wallet
  if (action === 'wallet_generate') {
    handleGenerateWallet(ctx);
    return true;
  }

  // Import wallet
  if (action === 'wallet_import') {
    handleImportWallet(ctx);
    return true;
  }

  // View wallet details - matches pattern: wallet_view_<walletId>
  if (action.startsWith('wallet_view_')) {
    const walletId = action.replace('wallet_view_', '');
    handleViewWallet(ctx, walletId);
    return true;
  }

  // Refresh wallet balance - matches pattern: wallet_balance_<walletId>
  if (action.startsWith('wallet_balance_')) {
    const walletId = action.replace('wallet_balance_', '');
    handleViewWallet(ctx, walletId);
    return true;
  }

  // Refresh all balances
  if (action === 'wallet_refresh') {
    handleRefreshBalances(ctx);
    return true;
  }

  // Set primary wallet - matches pattern: wallet_primary_<walletId>
  if (action.startsWith('wallet_primary_')) {
    const walletId = action.replace('wallet_primary_', '');
    handleSetPrimaryWallet(ctx, walletId);
    return true;
  }

  // Export private key - matches pattern: wallet_export_<walletId>
  if (action.startsWith('wallet_export_') && !action.includes('confirm')) {
    const walletId = action.replace('wallet_export_', '');
    handleExportPrivateKey(ctx, walletId);
    return true;
  }

  // Confirm export - matches pattern: wallet_export_confirm_<walletId>
  if (action.startsWith('wallet_export_confirm_')) {
    const walletId = action.replace('wallet_export_confirm_', '');
    handleExportPrivateKeyConfirm(ctx, walletId);
    return true;
  }

  // Delete confirmation - matches pattern: wallet_delete_confirm_<walletId>
  if (action.startsWith('wallet_delete_confirm_')) {
    const walletId = action.replace('wallet_delete_confirm_', '');
    handleDeleteWalletConfirm(ctx, walletId);
    return true;
  }

  // Delete wallet - matches pattern: wallet_delete_<walletId>
  if (action.startsWith('wallet_delete_') && !action.includes('confirm')) {
    const walletId = action.replace('wallet_delete_', '');
    handleDeleteWallet(ctx, walletId);
    return true;
  }

  // Noop (disabled buttons)
  if (action === 'noop') {
    handleNoop(ctx);
    return true;
  }

  // No wallet callback matched
  return false;
}