// // src/bot/handlers/walletCommands.ts
// import { Telegraf, Context } from 'telegraf';
// import {
//   handleWalletsMenu,
//   handleCreateWallet,
//   handleImportWallet,
//   processWalletImport,
//   handleWalletList,
//   handleWalletRefresh,
//   handleWalletExport,
//   confirmWalletExport,
// } from './walletHandlers';

// /**
//  * Register all wallet-related commands and callbacks
//  */
// export function registerWalletCommands(bot: Telegraf<Context>) {
  
//   // Main wallets menu
//   bot.action('menu_wallets', handleWalletsMenu);
  
//   // Create new wallet
//   bot.action('wallet_create', handleCreateWallet);
  
//   // Import wallet
//   bot.action('wallet_import', handleImportWallet);
  
//   // View all wallets
//   bot.action('wallet_list', handleWalletList);
  
//   // Refresh balances
//   bot.action('wallet_refresh', handleWalletRefresh);
  
//   // Export wallet (shows confirmation)
//   bot.action(/^export_(.+)$/, async (ctx) => {
//     const walletId = ctx.match[1];
//     await handleWalletExport(ctx, walletId);
//   });
  
//   // Confirm export (actually sends private key)
//   bot.action(/^confirm_export_(.+)$/, async (ctx) => {
//     const walletId = ctx.match[1];
//     await confirmWalletExport(ctx, walletId);
//   });

//   // Listen for private key input when importing
//   bot.on('text', async (ctx, next) => {
//     const session = (ctx as any).session;
    
//     if (session?.waitingFor === 'wallet_import') {
//       const text = ctx.message.text;
      
//       // Check if user wants to cancel
//       if (text === '/cancel') {
//         (ctx as any).session = null;
//         await ctx.reply('❌ Wallet import cancelled.', {
//           reply_markup: {
//             inline_keyboard: [[{ text: '« Back to Wallets', callback_data: 'menu_wallets' }]]
//           }
//         });
//         return;
//       }
      
//       // Process the private key
//       await processWalletImport(ctx, text);
//       return;
//     }
    
//     // Continue to next handler if not importing wallet
//     return next();
//   });

//   console.log('✅ Wallet commands registered');
// }