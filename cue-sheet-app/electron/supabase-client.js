/**
 * Supabase Client - Cloud database connection
 * 
 * Configuration:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment
 * - Or create a .env file in the project root
 */

const { createClient } = require('@supabase/supabase-js');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Try to load from .env file if it exists
function loadEnvFile() {
  try {
    // Check if app is available and isPackaged is defined
    const isPackaged = app && typeof app.isPackaged !== 'undefined' ? app.isPackaged : false;
    const envPath = isPackaged 
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '.env');
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      });
    }
  } catch (e) {
    console.log('[Supabase] No .env file found, using environment variables');
  }
}

// Load env file on module load
loadEnvFile();

// Supabase configuration - bundled for packaged app
const supabaseUrl = process.env.SUPABASE_URL || 'https://sxvbidtnophfgkosfyej.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_eHbS8oXtwhdzSYQwtNXLOA_JIep7rZu';

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  console.warn('[Supabase] Cloud features will be disabled until configured.');
}

// Create Supabase client (or null if not configured)
let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  });
  console.log('[Supabase] Client initialized');
}

/**
 * Check if Supabase is configured and available
 */
function isConfigured() {
  return supabase !== null;
}

/**
 * Get the Supabase client instance
 */
function getClient() {
  return supabase;
}

/**
 * Get current authenticated user
 */
async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get current session
 */
async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Sign in with email and password
 */
async function signIn(email, password) {
  if (!supabase) {
    return { error: { message: 'Supabase not configured' } };
  }
  return await supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email and password
 * Auto-confirms and signs in the user (no email verification required)
 */
async function signUp(email, password) {
  if (!supabase) {
    return { error: { message: 'Supabase not configured' } };
  }
  
  // Sign up the user
  const signUpResult = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      // Skip email confirmation - users are approved on account creation
      emailRedirectTo: undefined
    }
  });
  
  if (signUpResult.error) {
    return signUpResult;
  }
  
  // Auto sign-in after successful signup
  // This works because we're not requiring email confirmation
  const signInResult = await supabase.auth.signInWithPassword({ email, password });
  
  if (signInResult.error) {
    // If sign-in fails, still return the signup result as success
    // The user account was created, they just need to sign in manually
    return signUpResult;
  }
  
  return signInResult;
}

/**
 * Sign out
 */
async function signOut() {
  if (!supabase) return { error: null };
  return await supabase.auth.signOut();
}

// Admin password - can be set via environment variable or hardcoded
// In production, set ADMIN_PASSWORD in your .env file
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'auris2026';

// Local admin session (not persisted)
let isAdminSession = false;

/**
 * Check if current session has admin access
 */
async function isAdmin() {
  return isAdminSession;
}

/**
 * Verify admin password and enable admin mode
 */
function verifyAdminPassword(password) {
  if (password === ADMIN_PASSWORD) {
    isAdminSession = true;
    console.log('[Supabase] Admin mode enabled');
    return true;
  }
  return false;
}

/**
 * Exit admin mode
 */
function exitAdminMode() {
  isAdminSession = false;
  console.log('[Supabase] Admin mode disabled');
}

/**
 * Listen for auth state changes
 */
function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: null } };
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Fetch global API keys from the app_config table.
 * Returns an object like { anthropic_api_key: '...', voyage_api_key: '...' }
 */
async function fetchGlobalKeys() {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value');

    if (error) {
      console.error('[Supabase] Failed to fetch global keys:', error.message);
      return {};
    }

    const keys = {};
    for (const row of data || []) {
      if (row.value) {
        keys[row.key] = row.value;
      }
    }
    console.log('[Supabase] Fetched global keys:', Object.keys(keys).length, 'configured');
    return keys;
  } catch (e) {
    console.error('[Supabase] Error fetching global keys:', e.message);
    return {};
  }
}

/**
 * Set a global key in the app_config table (admin only).
 * @param {string} keyName - e.g. 'anthropic_api_key'
 * @param {string} keyValue - the API key value
 */
async function setGlobalKey(keyName, keyValue) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  if (!isAdminSession) {
    return { success: false, error: 'Admin access required' };
  }
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert(
        { key: keyName, value: keyValue, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[Supabase] Failed to set global key:', error.message);
      return { success: false, error: error.message };
    }
    console.log('[Supabase] Global key updated:', keyName);
    return { success: true };
  } catch (e) {
    console.error('[Supabase] Error setting global key:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  supabase,
  isConfigured,
  getClient,
  getCurrentUser,
  getSession,
  signIn,
  signUp,
  signOut,
  isAdmin,
  verifyAdminPassword,
  exitAdminMode,
  onAuthStateChange,
  fetchGlobalKeys,
  setGlobalKey
};
