import { dexService } from './dexService';
import { supabase } from '../config/supabase';
import { encrypt, decrypt } from '../utils/encryption';

export interface WalletInfo {
  id: string;
  user_id: string;
  telegram_id: number;
  wallet_name: string;
  public_key: string;
  private_key_encrypted: string;
  balance?: number;
  is_primary: boolean;
  created_at: string;
}

interface GeneratedWallet {
  publicKey: string;
  privateKey: string;
}

// Save wallet to database
export async function saveWallet(
  telegramId: number,
  publicKey: string,
  privateKey: string,
  walletName: string = 'Main Wallet',
  isPrimary: boolean = true
): Promise<WalletInfo> {
  const encryptedKey = encrypt(privateKey);

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) {
    throw new Error('User not found');
  }

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: user.id,
      telegram_id: telegramId,
      wallet_name: walletName,
      public_key: publicKey,
      private_key_encrypted: encryptedKey,
      is_primary: isPrimary,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to save wallet: ' + error.message);
  return data;
}

// Get user's wallets
export async function getUserWallets(telegramId: number): Promise<WalletInfo[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Failed to fetch wallets: ' + error.message);
  return data || [];
}

// Get primary wallet
export async function getPrimaryWallet(telegramId: number): Promise<WalletInfo | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('is_primary', true)
    .single();

  if (error) return null;
  return data;
}

// Get decrypted private key
export async function getDecryptedPrivateKey(walletId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('private_key_encrypted')
    .eq('id', walletId)
    .single();

  if (error || !data) return null;
  return decrypt(data.private_key_encrypted);
}

// Update wallet balance
export async function updateWalletBalance(walletId: string, balance: number): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('id', walletId);

  if (error) throw new Error('Failed to update balance: ' + error.message);
}

// Set primary wallet
export async function setPrimaryWallet(telegramId: number, walletId: string): Promise<void> {
  // First, unset all primary wallets
  await supabase
    .from('wallets')
    .update({ is_primary: false })
    .eq('telegram_id', telegramId);

  // Then set the new primary
  const { error } = await supabase
    .from('wallets')
    .update({ is_primary: true })
    .eq('id', walletId);

  if (error) throw new Error('Failed to set primary wallet: ' + error.message);
}

// Delete wallet
export async function deleteWallet(walletId: string): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', walletId);

  if (error) throw new Error('Failed to delete wallet: ' + error.message);
}

// Generate and save new wallet
export async function generateAndSaveWallet(
  telegramId: number,
  walletName: string = 'Generated Wallet',
  isPrimary: boolean = false
): Promise<WalletInfo> {
  const wallet: GeneratedWallet = dexService.generateWallet();
  return await saveWallet(telegramId, wallet.publicKey, wallet.privateKey, walletName, isPrimary);
}

// Generate multiple wallets
export async function generateAndSaveMultipleWallets(
  telegramId: number,
  count: number
): Promise<WalletInfo[]> {
  const wallets: WalletInfo[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const wallet = await generateAndSaveWallet(
        telegramId,
        `Wallet ${i + 1}`,
        false
      );
      wallets.push(wallet);
    } catch (error) {
      console.error(`Failed to generate wallet ${i + 1}:`, error);
    }
  }

  return wallets;
}

// Get all wallets with balances
export async function getWalletsWithBalances(telegramId: number): Promise<WalletInfo[]> {
  const wallets = await getUserWallets(telegramId);
  
  // Update balances for all wallets
  for (const wallet of wallets) {
    try {
      const balance = await dexService.getWalletBalance(wallet.public_key);
      wallet.balance = balance;
      await updateWalletBalance(wallet.id, balance);
    } catch (error) {
      console.error(`Failed to update balance for wallet ${wallet.id}:`, error);
    }
  }

  return wallets;
}

// Get total balance across all wallets
export async function getTotalBalance(telegramId: number): Promise<number> {
  const wallets = await getUserWallets(telegramId);
  let total = 0;

  for (const wallet of wallets) {
    try {
      const balance = await dexService.getWalletBalance(wallet.public_key);
      total += balance;
    } catch (error) {
      console.error(`Failed to get balance for wallet ${wallet.id}:`, error);
    }
  }

  return total;
}