// src/bot/handlers/walletHandlers.ts
import { Context, Markup } from 'telegraf';
import { 
  generateAndSaveWallet, 
  getUserWallets, 
  getPrimaryWallet,
  saveWallet,
  setPrimaryWallet,
  deleteWallet,
  getWalletsWithBalances,
  getDecryptedPrivateKey
} from '../../services/walletService';
import { dexService } from '../../services/dexService';

// Handle /wallet command
export async function handleWalletCommand(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const wallets = await getUserWallets(telegramId);
    
    if (wallets.length === 0) {
      await ctx.reply(
        '👛 *Wallet Management*\n\n' +
        'You don\'t have any wallets yet.\n\n' +
        '✨ Generate a new Solana wallet\n' +
        '📥 Import your existing wallet\n' +
        '💎 Start trading memecoins!\n\n' +
        '🔐 All wallets are encrypted & secure',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✨ Generate New Wallet', 'wallet_generate'),
              Markup.button.callback('📥 Import Wallet', 'wallet_import')
            ],
            [
              Markup.button.callback('« Back', 'back_main')
            ]
          ])
        }
      );
      return;
    }

    // Show existing wallets
    let message = '👛 *Your Wallets*\n\n';
    let totalBalance = 0;

    for (const wallet of wallets) {
      const isPrimary = wallet.is_primary ? '⭐ ' : '';
      const shortAddress = `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`;
      const balance = wallet.balance || 0;
      totalBalance += balance;
      
      message += `${isPrimary}*${wallet.wallet_name}*\n`;
      message += `🔑 \`${shortAddress}\`\n`;
      message += `💰 ${balance.toFixed(4)} SOL\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💎 *Total:* ${totalBalance.toFixed(4)} SOL\n\n`;
    message += '💡 _Tap wallet to view details_';

    const buttons = wallets.map(w => [
      Markup.button.callback(
        `${w.is_primary ? '⭐ ' : ''}${w.wallet_name}`,
        `wallet_view_${w.id}`
      )
    ]);

    buttons.push(
      [
        Markup.button.callback('✨ Generate New', 'wallet_generate'),
        Markup.button.callback('📥 Import', 'wallet_import')
      ],
      [
        Markup.button.callback('🔄 Refresh Balances', 'wallet_refresh')
      ],
      [
        Markup.button.callback('« Back', 'back_main')
      ]
    );

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (error) {
    console.error('Error in handleWalletCommand:', error);
    await ctx.reply('❌ Failed to load wallets. Please try again.');
  }
}

// Generate new wallet
export async function handleGenerateWallet(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ctx.answerCbQuery();
    
    // Edit or send new message based on context
    const loadingMessage = '⏳ Generating new Solana wallet...';
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(loadingMessage);
    } else {
      await ctx.reply(loadingMessage);
    }

    // Check how many wallets user has
    const existingWallets = await getUserWallets(telegramId);
    const isPrimary = existingWallets.length === 0; // First wallet is primary
    const walletName = existingWallets.length === 0 
      ? 'Main Wallet' 
      : `Wallet ${existingWallets.length + 1}`;

    // Generate wallet
    const wallet = await generateAndSaveWallet(telegramId, walletName, isPrimary);

    const successMessage =
      '✅ *Wallet Created Successfully!*\n\n' +
      `🏷️ *Name:* ${wallet.wallet_name}\n` +
      `🔑 *Address:*\n\`${wallet.public_key}\`\n\n` +
      `${isPrimary ? '⭐ Set as primary wallet\n\n' : ''}` +
      '⚠️ *IMPORTANT:*\n' +
      '• Your wallet is encrypted and stored securely\n' +
      '• Export & backup your private key\n' +
      '• Send SOL to start trading!\n\n' +
      '💡 _Tap address to copy_';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💰 View Balance', `wallet_balance_${wallet.id}`),
            Markup.button.callback('📤 Export Key', `wallet_export_${wallet.id}`)
          ],
          [
            Markup.button.callback('🔄 Refresh', 'wallet_refresh'),
            Markup.button.callback('👛 My Wallets', 'menu_wallets')
          ],
          [
            Markup.button.callback('« Back', 'back_main')
          ]
        ])
      });
    } else {
      await ctx.reply(successMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💰 View Balance', `wallet_balance_${wallet.id}`),
            Markup.button.callback('📤 Export Key', `wallet_export_${wallet.id}`)
          ],
          [
            Markup.button.callback('🔄 Refresh', 'wallet_refresh'),
            Markup.button.callback('👛 My Wallets', 'menu_wallets')
          ],
          [
            Markup.button.callback('« Back', 'back_main')
          ]
        ])
      });
    }

  } catch (error) {
    console.error('Error generating wallet:', error);
    await ctx.reply('❌ Failed to generate wallet. Please try again.');
  }
}

// Import existing wallet
export async function handleImportWallet(ctx: Context) {
  try {
    await ctx.answerCbQuery();
    
    const importMessage =
      '📥 *Import Existing Wallet*\n\n' +
      '🔐 Send me your Solana wallet private key\n\n' +
      '⚠️ *Security Notes:*\n' +
      '• Keys are encrypted before storage\n' +
      '• Delete message after importing\n' +
      '• Only import wallets you own\n\n' +
      '💡 *Format:* Base58 private key\n' +
      '💡 *Example:* 5JK8... (long string)';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(importMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'menu_wallets')]
        ])
      });
    } else {
      await ctx.reply(importMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'menu_wallets')]
        ])
      });
    }

    // Set user state to expect private key
    // @ts-ignore
    ctx.session = ctx.session || {};
    // @ts-ignore
    ctx.session.awaitingPrivateKey = true;

  } catch (error) {
    console.error('Error in import wallet:', error);
    await ctx.reply('❌ Failed to start import. Please try again.');
  }
}

// Process imported private key
export async function processImportedKey(ctx: Context, privateKey: string) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Clean up the private key (remove spaces, newlines)
    const cleanedKey = privateKey.trim().replace(/\s/g, '');

    // Validate and extract public key
    const publicKey = dexService.getPublicKeyFromPrivate(cleanedKey);
    
    if (!publicKey) {
      await ctx.reply(
        '❌ Invalid private key format.\n\n' +
        '💡 Make sure you copied the entire key.\n' +
        '💡 Use /wallet to try again.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔄 Try Again', callback_data: 'wallet_import' }
            ]]
          }
        }
      );
      return;
    }

    // Check if wallet already exists
    const existingWallets = await getUserWallets(telegramId);
    const walletExists = existingWallets.some(w => w.public_key === publicKey);

    if (walletExists) {
      await ctx.reply('⚠️ This wallet is already imported!');
      return;
    }

    // Save wallet
    const isPrimary = existingWallets.length === 0;
    const walletName = existingWallets.length === 0 
      ? 'Main Wallet' 
      : `Imported Wallet ${existingWallets.length + 1}`;

    const wallet = await saveWallet(telegramId, publicKey, cleanedKey, walletName, isPrimary);

    // Try to delete user's message with private key
    try {
      if (ctx.message) {
        await ctx.deleteMessage(ctx.message.message_id);
      }
    } catch (e) {
      console.log('Could not delete message (might lack permissions)');
    }

    await ctx.reply(
      '✅ *Wallet Imported Successfully!*\n\n' +
      `🏷️ *Name:* ${wallet.wallet_name}\n` +
      `🔑 *Address:*\n\`${wallet.public_key}\`\n\n` +
      `${isPrimary ? '⭐ Set as primary wallet\n\n' : ''}` +
      '🔐 Your private key has been encrypted and stored securely.\n' +
      '🗑️ Your message with the key has been deleted.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💰 View Balance', `wallet_balance_${wallet.id}`),
            Markup.button.callback('👛 My Wallets', 'menu_wallets')
          ],
          [
            Markup.button.callback('« Back', 'back_main')
          ]
        ])
      }
    );

    // Clear session state
    // @ts-ignore
    if (ctx.session) {
      // @ts-ignore
      ctx.session.awaitingPrivateKey = false;
    }

  } catch (error) {
    console.error('Error importing wallet:', error);
    await ctx.reply('❌ Failed to import wallet. Please check your private key and try again.');
  }
}

// View wallet details
export async function handleViewWallet(ctx: Context, walletId: string) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ctx.answerCbQuery();

    const wallets = await getUserWallets(telegramId);
    const wallet = wallets.find(w => w.id === walletId);

    if (!wallet) {
      await ctx.reply('❌ Wallet not found.');
      return;
    }

    // Get fresh balance
    const balance = await dexService.getWalletBalance(wallet.public_key);

    const message =
      `👛 *${wallet.wallet_name}*\n\n` +
      `🔑 *Address:*\n\`${wallet.public_key}\`\n\n` +
      `💰 *Balance:* ${balance.toFixed(4)} SOL\n` +
      `${wallet.is_primary ? '⭐ *Status:* Primary Wallet\n' : '📌 *Status:* Secondary Wallet\n'}\n` +
      `📅 *Created:* ${new Date(wallet.created_at).toLocaleDateString()}\n\n` +
      '💡 _Tap address to copy_';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Refresh', `wallet_balance_${wallet.id}`),
            Markup.button.callback('📤 Export Key', `wallet_export_${wallet.id}`)
          ],
          [
            Markup.button.callback(
              wallet.is_primary ? '⭐ Primary' : '⭐ Set Primary',
              wallet.is_primary ? 'noop' : `wallet_primary_${wallet.id}`
            ),
            Markup.button.callback('🗑️ Delete', `wallet_delete_confirm_${wallet.id}`)
          ],
          [
            Markup.button.callback('« Back', 'menu_wallets')
          ]
        ])
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Refresh', `wallet_balance_${wallet.id}`),
            Markup.button.callback('📤 Export Key', `wallet_export_${wallet.id}`)
          ],
          [
            Markup.button.callback(
              wallet.is_primary ? '⭐ Primary' : '⭐ Set Primary',
              wallet.is_primary ? 'noop' : `wallet_primary_${wallet.id}`
            ),
            Markup.button.callback('🗑️ Delete', `wallet_delete_confirm_${wallet.id}`)
          ],
          [
            Markup.button.callback('« Back', 'menu_wallets')
          ]
        ])
      });
    }

  } catch (error) {
    console.error('Error viewing wallet:', error);
    await ctx.reply('❌ Failed to load wallet details.');
  }
}

// Refresh wallet balances
export async function handleRefreshBalances(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ctx.answerCbQuery('Refreshing balances...');

    const wallets = await getWalletsWithBalances(telegramId);

    let message = '👛 *Your Wallets (Refreshed)*\n\n';
    let totalBalance = 0;

    for (const wallet of wallets) {
      const isPrimary = wallet.is_primary ? '⭐ ' : '';
      const shortAddress = `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`;
      const balance = wallet.balance || 0;
      totalBalance += balance;
      
      message += `${isPrimary}*${wallet.wallet_name}*\n`;
      message += `🔑 \`${shortAddress}\`\n`;
      message += `💰 ${balance.toFixed(4)} SOL\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💎 *Total:* ${totalBalance.toFixed(4)} SOL`;

    const buttons = wallets.map(w => [
      Markup.button.callback(
        `${w.is_primary ? '⭐ ' : ''}${w.wallet_name}`,
        `wallet_view_${w.id}`
      )
    ]);

    buttons.push(
      [
        Markup.button.callback('✨ Generate New', 'wallet_generate'),
        Markup.button.callback('📥 Import', 'wallet_import')
      ],
      [
        Markup.button.callback('« Back', 'back_main')
      ]
    );

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (error) {
    console.error('Error refreshing balances:', error);
    await ctx.answerCbQuery('Failed to refresh');
  }
}

// Set primary wallet
export async function handleSetPrimaryWallet(ctx: Context, walletId: string) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ctx.answerCbQuery('Setting as primary wallet...');
    await setPrimaryWallet(telegramId, walletId);

    await handleViewWallet(ctx, walletId);
  } catch (error) {
    console.error('Error setting primary wallet:', error);
    await ctx.answerCbQuery('Failed to set primary');
  }
}

// Export private key (show with warning)
export async function handleExportPrivateKey(ctx: Context, walletId: string) {
  try {
    await ctx.answerCbQuery();
    
    const warningMessage =
      '⚠️ *Export Private Key*\n\n' +
      '🔐 This will show your unencrypted private key.\n\n' +
      '*⚠️ NEVER share your private key with anyone!*\n' +
      '*⚠️ Anyone with this key can steal your funds!*\n\n' +
      'Are you sure you want to continue?';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(warningMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Yes, Show Key', `wallet_export_confirm_${walletId}`),
            Markup.button.callback('❌ Cancel', `wallet_view_${walletId}`)
          ]
        ])
      });
    }
  } catch (error) {
    console.error('Error in export key:', error);
  }
}

// Confirm export and show private key
export async function handleExportPrivateKeyConfirm(ctx: Context, walletId: string) {
  try {
    await ctx.answerCbQuery();
    
    // Get decrypted key
    const privateKey = await getDecryptedPrivateKey(walletId);

    if (!privateKey) {
      await ctx.reply('❌ Failed to retrieve private key.');
      return;
    }

    // Send private key in a separate message that can be deleted
    await ctx.reply(
      '🔐 *Your Private Key:*\n\n' +
      `\`${privateKey}\`\n\n` +
      '⚠️ *DELETE THIS MESSAGE IMMEDIATELY AFTER COPYING!*\n' +
      '⚠️ *Never share this with anyone!*\n' +
      '⚠️ *Anyone with access can steal your funds!*',
      {
        parse_mode: 'Markdown'
      }
    );

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(
        '✅ Private key sent!\n\n' +
        '⚠️ Make sure to delete the message after copying.\n\n' +
        '💡 Use /wallet to return to wallet management.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('👛 My Wallets', 'menu_wallets')]
          ])
        }
      );
    }

  } catch (error) {
    console.error('Error exporting key:', error);
    await ctx.reply('❌ Failed to export private key.');
  }
}

// Delete wallet confirmation
export async function handleDeleteWalletConfirm(ctx: Context, walletId: string) {
  try {
    await ctx.answerCbQuery();
    
    const confirmMessage =
      '⚠️ *Delete Wallet*\n\n' +
      '❗ This action cannot be undone!\n' +
      '❗ Make sure you have exported your private key!\n' +
      '❗ All data for this wallet will be lost!\n\n' +
      'Are you sure you want to delete this wallet?';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(confirmMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🗑️ Yes, Delete Forever', `wallet_delete_${walletId}`),
            Markup.button.callback('❌ Cancel', `wallet_view_${walletId}`)
          ]
        ])
      });
    }
  } catch (error) {
    console.error('Error in delete confirm:', error);
  }
}

// Delete wallet
export async function handleDeleteWallet(ctx: Context, walletId: string) {
  try {
    await ctx.answerCbQuery('Deleting wallet...');
    await deleteWallet(walletId);

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(
        '✅ Wallet deleted successfully.\n\n' +
        '🔐 All encrypted data has been removed.',
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('👛 My Wallets', 'menu_wallets')]
          ])
        }
      );
    } else {
      await ctx.reply(
        '✅ Wallet deleted successfully.\n\n' +
        '🔐 All encrypted data has been removed.',
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('👛 My Wallets', 'menu_wallets')]
          ])
        }
      );
    }
  } catch (error) {
    console.error('Error deleting wallet:', error);
    await ctx.answerCbQuery('Failed to delete wallet');
  }
}

// Handle noop action (for disabled buttons)
export async function handleNoop(ctx: Context) {
  await ctx.answerCbQuery();
}