import { supabase } from '../config/supabase';
import { encrypt, decrypt } from '../utils/encryption';
import { getPrimaryWallet, getDecryptedPrivateKey } from './walletService';

export interface User {
  id: string;
  telegram_id: number;
  username: string;
  exchange: string;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  solana_wallet_encrypted?: string;
  risk_profile?: 'conservative' | 'moderate' | 'aggressive';
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error) return null;
  return data;
}

export async function createUser(
  telegramId: number,
  username: string,
  exchange: string = 'bybit'
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: username,
      exchange: exchange,
      risk_profile: 'moderate',
    })
    .select()
    .single();

  if (error) throw new Error('Failed to create user: ' + error.message);
  return data;
}

export async function saveApiKeys(
  telegramId: number,
  apiKey: string,
  apiSecret: string,
  exchange?: string
): Promise<void> {
  const encryptedKey = encrypt(apiKey);
  const encryptedSecret = encrypt(apiSecret);

  const updateData: any = {
    api_key_encrypted: encryptedKey,
    api_secret_encrypted: encryptedSecret,
    updated_at: new Date().toISOString(),
  };

  if (exchange) {
    updateData.exchange = exchange;
  }

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('telegram_id', telegramId);

  if (error) throw new Error('Failed to save API keys: ' + error.message);
}

export async function getDecryptedApiKeys(
  telegramId: number
): Promise<{ apiKey: string; apiSecret: string; exchange: string } | null> {
  const user = await getUserByTelegramId(telegramId);
  
  if (!user || !user.api_key_encrypted || !user.api_secret_encrypted) {
    return null;
  }

  return {
    apiKey: decrypt(user.api_key_encrypted),
    apiSecret: decrypt(user.api_secret_encrypted),
    exchange: user.exchange || 'bybit',
  };
}

// Save Solana wallet private key
export async function saveSolanaWallet(
  telegramId: number,
  privateKey: string
): Promise<void> {
  const encryptedWallet = encrypt(privateKey);

  const { error } = await supabase
    .from('users')
    .update({
      solana_wallet_encrypted: encryptedWallet,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) throw new Error('Failed to save Solana wallet: ' + error.message);
}

// Get decrypted Solana wallet
export async function getDecryptedSolanaWallet(
  telegramId: number
): Promise<string | null> {
  const user = await getUserByTelegramId(telegramId);
  
  if (!user || !user.solana_wallet_encrypted) {
    return null;
  }

  return decrypt(user.solana_wallet_encrypted);
}

// Update risk profile
export async function updateRiskProfile(
  telegramId: number,
  riskProfile: 'conservative' | 'moderate' | 'aggressive'
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      risk_profile: riskProfile,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) throw new Error('Failed to update risk profile: ' + error.message);
}

// Get user risk profile
export async function getUserRiskProfile(
  telegramId: number
): Promise<'conservative' | 'moderate' | 'aggressive'> {
  const user = await getUserByTelegramId(telegramId);
  return user?.risk_profile || 'moderate';
}

// Check if user has CEX connection
export async function hasCEXConnection(telegramId: number): Promise<boolean> {
  const keys = await getDecryptedApiKeys(telegramId);
  return keys !== null;
}

// Check if user has DEX connection (Solana wallet)
export async function hasDEXConnection(telegramId: number): Promise<boolean> {
  const wallet = await getDecryptedSolanaWallet(telegramId);
  return wallet !== null;
}

// Get user's complete connection status
// Get user's complete connection status - UPDATED
export async function getConnectionStatus(telegramId: number) {
  const user = await getUserByTelegramId(telegramId);
  const hasCEX = await hasCEXConnection(telegramId);
  const hasDEX = await hasDEXConnectionNew(telegramId); // CHANGED

  return {
    hasCEX,
    hasDEX,
    exchange: user?.exchange || null,
    riskProfile: user?.risk_profile || 'moderate',
    fullyConnected: hasCEX || hasDEX,
  };
}

// Delete API keys
export async function deleteApiKeys(telegramId: number): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      api_key_encrypted: null,
      api_secret_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) throw new Error('Failed to delete API keys: ' + error.message);
}

// Delete Solana wallet
export async function deleteSolanaWallet(telegramId: number): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      solana_wallet_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) throw new Error('Failed to delete Solana wallet: ' + error.message);
}

export async function hasDEXConnectionNew(telegramId: number): Promise<boolean> {
  try {
    const wallet = await getPrimaryWallet(telegramId);
    return wallet !== null;
  } catch (error) {
    console.error('Error checking DEX connection:', error);
    // Fallback to old system if new system fails
    return await hasDEXConnection(telegramId);
  }
}

// Get wallet private key from NEW wallet system
export async function getDecryptedSolanaWalletNew(telegramId: number): Promise<string | null> {
  try {
    const wallet = await getPrimaryWallet(telegramId);
    if (!wallet) {
      // Fallback to old system
      return await getDecryptedSolanaWallet(telegramId);
    }
    
    return await getDecryptedPrivateKey(wallet.id);
  } catch (error) {
    console.error('Error getting wallet:', error);
    // Fallback to old system if new system fails
    return await getDecryptedSolanaWallet(telegramId);
  }
}

// Get wallet details for display in menus
export async function getWalletDetails(telegramId: number): Promise<{
  connected: boolean;
  walletCount: number;
  totalBalance: number;
  primaryWallet: string | null;
} | null> {
  try {
    const { getUserWallets } = require('./walletService');
    const wallets = await getUserWallets(telegramId);
    
    if (wallets.length === 0) {
      return {
        connected: false,
        walletCount: 0,
        totalBalance: 0,
        primaryWallet: null
      };
    }

    const totalBalance = wallets.reduce((sum: number, w: any) => sum + (w.balance || 0), 0);
    const primary = wallets.find((w: any) => w.is_primary);

    return {
      connected: true,
      walletCount: wallets.length,
      totalBalance: totalBalance,
      primaryWallet: primary ? primary.wallet_name : null
    };
  } catch (error) {
    console.error('Error getting wallet details:', error);
    // Try old system as fallback
    const hasOld = await hasDEXConnection(telegramId);
    return {
      connected: hasOld,
      walletCount: hasOld ? 1 : 0,
      totalBalance: 0,
      primaryWallet: hasOld ? 'Legacy Wallet' : null
    };
  }
}