// bot/handlers/walletHandlers.ts - FIXED WALLET IMPORT
import { Context, Markup } from 'telegraf';
import * as userService from '../../services/userService';

// Import wallet service
let walletService: any;
try {
  walletService = require('../../services/walletService');
} catch (e) {
  console.log('Wallet service not available');
}

// User states for wallet operations
export const walletStates = new Map<number, any>();

/**
 * Main wallet command handler
 */
export async function handleWalletCommand(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  try {
    // Check if wallet service is available
    if (!walletService) {
      await ctx.reply(
        `🔧 *Wallet Feature*\n\n` +
        `Multi-wallet management coming soon!\n\n` +
        `Current: Single wallet via /connect`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🪙 Memecoins', 'menu_memecoins')],
            [Markup.button.callback('🏠 Main Menu', 'back_main')]
          ])
        }
      );
      return;
    }

    const wallets = await walletService.getUserWallets(userId);
    
    let message = `💼 *Wallet Manager*\n\n`;
    
    if (wallets.length === 0) {
      message += `No wallets connected.\n\n`;
      message += `Create or import a wallet to get started!`;
    } else {
      const totalBalance = wallets.reduce((sum: number, w: any) => sum + (w.balance || 0), 0);
      message += `💰 Total: ${totalBalance.toFixed(4)} SOL\n`;
      message += `💼 Wallets: ${wallets.length}\n\n`;

      for (const wallet of wallets.slice(0, 5)) {
        const isPrimary = wallet.is_primary ? '⭐' : '';
        message += `${isPrimary} *${wallet.wallet_name}*\n`;
        message += `💰 ${(wallet.balance || 0).toFixed(4)} SOL\n`;
        message += `📍 ${wallet.public_key?.slice(0, 4)}...${wallet.public_key?.slice(-4)}\n\n`;
      }
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Create New', 'wallet_create'),
          Markup.button.callback('📥 Import', 'wallet_import')
        ],
        [
          Markup.button.callback('🔄 Refresh', 'wallet_refresh'),
          Markup.button.callback('⚙️ Manage', 'wallet_manage')
        ],
        [Markup.button.callback('🏠 Main Menu', 'back_main')]
      ])
    });

  } catch (error: any) {
    console.error('Wallet command error:', error);
    await ctx.reply('❌ Error loading wallets. Try again.');
  }
}

/**
 * Handle wallet callbacks
 */
export function handleWalletCallbacks(ctx: Context): boolean {
  if (!('data' in ctx.callbackQuery!) || !ctx.from) return false;

  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  // Wallet menu
  if (data === 'menu_wallets') {
    handleWalletCommand(ctx);
    return true;
  }

  // Create wallet
  if (data === 'wallet_create') {
    handleCreateWallet(ctx);
    return true;
  }

  // Import wallet
  if (data === 'wallet_import') {
    handleImportWallet(ctx);
    return true;
  }

  // Refresh wallets
  if (data === 'wallet_refresh') {
    handleWalletCommand(ctx);
    return true;
  }

  // Manage wallets
  if (data === 'wallet_manage') {
    handleManageWallets(ctx);
    return true;
  }

  // Select wallet
  if (data.startsWith('select_wallet_')) {
    const walletId = data.replace('select_wallet_', '');
    handleSelectWallet(ctx, walletId);
    return true;
  }

  // Set primary wallet
  if (data.startsWith('set_primary_')) {
    const walletId = data.replace('set_primary_', '');
    handleSetPrimary(ctx, walletId);
    return true;
  }

  // Delete wallet
  if (data.startsWith('delete_wallet_')) {
    const walletId = data.replace('delete_wallet_', '');
    handleDeleteWallet(ctx, walletId);
    return true;
  }

  // Confirm delete
  if (data.startsWith('confirm_delete_')) {
    const walletId = data.replace('confirm_delete_', '');
    handleConfirmDelete(ctx, walletId);
    return true;
  }

  return false;
}

/**
 * Handle text messages for wallet operations
 */
export async function handleWalletTextInput(ctx: Context, text: string, userId: number): Promise<boolean> {
  const state = walletStates.get(userId);
  
  if (!state) return false;

  try {
    // Import wallet
    if (state.action === 'import_wallet') {
      await processWalletImport(ctx, text, userId);
      return true;
    }

    // Name new wallet
    if (state.action === 'name_wallet') {
      await processWalletName(ctx, text, userId, state.privateKey);
      return true;
    }

  } catch (error: any) {
    console.error('Wallet text input error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
    walletStates.delete(userId);
  }

  return false;
}

/**
 * Create new wallet
 */
async function handleCreateWallet(ctx: Context) {
  if (!ctx.from) return;

  await ctx.answerCbQuery();
  await ctx.editMessageText('⏳ *Creating Wallet...*', {
    parse_mode: 'Markdown'
  });

  try {
    if (!walletService) {
      throw new Error('Wallet service not available');
    }

    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');

    // Generate new keypair
    const keypair = Keypair.generate();
    const privateKey = bs58.default.encode(keypair.secretKey);
    const publicKey = keypair.publicKey.toString();

    // Set state to name the wallet
    walletStates.set(ctx.from.id, {
      action: 'name_wallet',
      privateKey: privateKey
    });

    await ctx.editMessageText(
      `✅ *Wallet Created!*\n\n` +
      `📍 Address:\n\`${publicKey}\`\n\n` +
      `🔑 Private Key:\n\`${privateKey}\`\n\n` +
      `⚠️ *SAVE YOUR PRIVATE KEY!*\n` +
      `Write it down in a safe place.\n\n` +
      `💡 Send a name for this wallet (e.g. "Trading", "Main")`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'menu_wallets')]
        ])
      }
    );

  } catch (error: any) {
    console.error('Create wallet error:', error);
    await ctx.editMessageText(
      `❌ *Failed to Create Wallet*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', 'wallet_create')],
          [Markup.button.callback('« Back', 'menu_wallets')]
        ])
      }
    );
  }
}

/**
 * Import existing wallet
 */
async function handleImportWallet(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  await ctx.answerCbQuery();
  
  // Set state
  walletStates.set(userId, {
    action: 'import_wallet'
  });

  await ctx.editMessageText(
    `📥 *Import Existing Wallet*\n\n` +
    `🔑 Send me your Solana wallet private key\n\n` +
    `⚠️ *Security Notes:*\n` +
    `• Keys are encrypted before storage\n` +
    `• Delete message after importing\n` +
    `• Only import wallets you own\n\n` +
    `💡 *Format:* Base58 private key\n` +
    `📝 *Example:* 5JR8... (long string)`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'menu_wallets')]
      ])
    }
  );
}

/**
 * Process wallet import from text message
 */
async function processWalletImport(ctx: Context, privateKey: string, userId: number) {
  await ctx.reply('⏳ *Verifying wallet...*', { parse_mode: 'Markdown' });

  try {
    // Validate private key format
    if (!privateKey || privateKey.length < 32) {
      throw new Error('Invalid private key format');
    }

    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');

    // Try to decode and create keypair
    let keypair: any;
    try {
      const secretKey = bs58.default.decode(privateKey.trim());
      keypair = Keypair.fromSecretKey(secretKey);
    } catch (e) {
      throw new Error('Invalid Base58 private key');
    }

    const publicKey = keypair.publicKey.toString();

    // Set state to name the wallet
    walletStates.set(userId, {
      action: 'name_wallet',
      privateKey: privateKey.trim()
    });

    await ctx.reply(
      `✅ *Wallet Verified!*\n\n` +
      `📍 Address:\n\`${publicKey}\`\n\n` +
      `💡 Send a name for this wallet (e.g. "Trading", "Import")`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'menu_wallets')]
        ])
      }
    );

    // Try to delete the private key message
    try {
      await ctx.deleteMessage(ctx.message!.message_id);
    } catch (e) {
      await ctx.reply('⚠️ Please delete your private key message manually!');
    }

  } catch (error: any) {
    console.error('Import wallet error:', error);
    
    walletStates.delete(userId);

    await ctx.reply(
      `❌ *Import Failed*\n\n` +
      `${error.message}\n\n` +
      `Please check your private key and try again.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', 'wallet_import')],
          [Markup.button.callback('« Back', 'menu_wallets')]
        ])
      }
    );
  }
}

/**
 * Process wallet name
 */
async function processWalletName(ctx: Context, name: string, userId: number, privateKey: string) {
  await ctx.reply('⏳ *Saving wallet...*', { parse_mode: 'Markdown' });

  try {
    if (!walletService) {
      throw new Error('Wallet service not available');
    }

    if (!name || name.length < 2 || name.length > 20) {
      throw new Error('Name must be 2-20 characters');
    }

    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');
    
    const secretKey = bs58.default.decode(privateKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKey = keypair.publicKey.toString();

    // Save wallet
    await walletService.createWallet(
      userId,
      name.trim(),
      publicKey,
      privateKey
    );

    // Clear state
    walletStates.delete(userId);

    await ctx.reply(
      `✅ *Wallet Saved!*\n\n` +
      `💼 Name: ${name}\n` +
      `📍 ${publicKey.slice(0, 4)}...${publicKey.slice(-4)}\n\n` +
      `Your wallet is ready to use!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💼 View Wallets', 'menu_wallets')],
          [Markup.button.callback('🪙 Trade Memecoins', 'menu_memecoins')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

  } catch (error: any) {
    console.error('Save wallet error:', error);
    
    await ctx.reply(
      `❌ *Failed to Save*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'menu_wallets')]
        ])
      }
    );
    
    walletStates.delete(userId);
  }
}

/**
 * Manage wallets
 */
async function handleManageWallets(ctx: Context) {
  if (!ctx.from) return;

  await ctx.answerCbQuery();

  try {
    if (!walletService) {
      throw new Error('Wallet service not available');
    }

    const userId = ctx.from.id;
    const wallets = await walletService.getUserWallets(userId);

    if (wallets.length === 0) {
      await ctx.editMessageText(
        `💼 *No Wallets*\n\nCreate or import a wallet first.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Create', 'wallet_create')],
            [Markup.button.callback('📥 Import', 'wallet_import')],
            [Markup.button.callback('« Back', 'menu_wallets')]
          ])
        }
      );
      return;
    }

    let message = `⚙️ *Manage Wallets*\n\n`;
    message += `Select a wallet to manage:\n\n`;

    const buttons: any[] = [];

    for (const wallet of wallets) {
      const isPrimary = wallet.is_primary ? '⭐' : '';
      message += `${isPrimary} *${wallet.wallet_name}*\n`;
      message += `📍 ${wallet.public_key?.slice(0, 4)}...${wallet.public_key?.slice(-4)}\n\n`;

      buttons.push([
        Markup.button.callback(
          `⚙️ ${wallet.wallet_name}`,
          `select_wallet_${wallet.id}`
        )
      ]);
    }

    buttons.push([Markup.button.callback('« Back', 'menu_wallets')]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (error: any) {
    console.error('Manage wallets error:', error);
    await ctx.editMessageText(
      `❌ Error loading wallets`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'menu_wallets')]
        ])
      }
    );
  }
}

/**
 * Select wallet for management
 */
async function handleSelectWallet(ctx: Context, walletId: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery();

  try {
    if (!walletService) throw new Error('Wallet service not available');

    const wallet = await walletService.getWalletById(walletId);

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const isPrimary = wallet.is_primary;

    let message = `⚙️ *Manage Wallet*\n\n`;
    message += `💼 Name: ${wallet.wallet_name}\n`;
    message += `📍 ${wallet.public_key?.slice(0, 4)}...${wallet.public_key?.slice(-4)}\n`;
    message += `💰 Balance: ${(wallet.balance || 0).toFixed(4)} SOL\n`;
    message += `${isPrimary ? '⭐ Primary Wallet' : ''}\n\n`;
    message += `What would you like to do?`;

    const buttons: any[] = [];

    if (!isPrimary) {
      buttons.push([
        Markup.button.callback('⭐ Set as Primary', `set_primary_${walletId}`)
      ]);
    }

    buttons.push([
      Markup.button.callback('🗑️ Delete Wallet', `delete_wallet_${walletId}`)
    ]);
    buttons.push([Markup.button.callback('« Back', 'wallet_manage')]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (error: any) {
    console.error('Select wallet error:', error);
    await ctx.editMessageText(
      `❌ Error: ${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back', 'wallet_manage')]
        ])
      }
    );
  }
}

/**
 * Set primary wallet
 */
async function handleSetPrimary(ctx: Context, walletId: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery('Setting primary...');

  try {
    if (!walletService) throw new Error('Wallet service not available');

    await walletService.setPrimaryWallet(ctx.from.id, walletId);

    await ctx.editMessageText(
      `✅ *Primary Wallet Updated!*\n\nThis wallet will be used for all transactions.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💼 View Wallets', 'menu_wallets')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

  } catch (error: any) {
    console.error('Set primary error:', error);
    await ctx.answerCbQuery(`❌ Error: ${error.message}`);
  }
}

/**
 * Delete wallet confirmation
 */
async function handleDeleteWallet(ctx: Context, walletId: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery();

  await ctx.editMessageText(
    `⚠️ *Delete Wallet?*\n\n` +
    `This action cannot be undone.\n\n` +
    `Make sure you have backed up your private key!\n\n` +
    `Are you sure?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Yes, Delete', `confirm_delete_${walletId}`),
          Markup.button.callback('❌ Cancel', `select_wallet_${walletId}`)
        ]
      ])
    }
  );
}

/**
 * Confirm delete wallet
 */
async function handleConfirmDelete(ctx: Context, walletId: string) {
  if (!ctx.from) return;

  await ctx.answerCbQuery('Deleting...');

  try {
    if (!walletService) throw new Error('Wallet service not available');

    await walletService.deleteWallet(walletId);

    await ctx.editMessageText(
      `✅ *Wallet Deleted*\n\nThe wallet has been removed.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💼 View Wallets', 'menu_wallets')],
          [Markup.button.callback('🏠 Main Menu', 'back_main')]
        ])
      }
    );

  } catch (error: any) {
    console.error('Delete wallet error:', error);
    await ctx.answerCbQuery(`❌ Error: ${error.message}`);
  }
}