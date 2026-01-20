/**
 * Auth Context - Manages authentication state and admin role
 * 
 * Provides:
 * - user: Current authenticated user
 * - isAdmin: Whether user has admin role
 * - isLoading: Loading state during auth check
 * - signIn: Sign in function
 * - signUp: Sign up function
 * - signOut: Sign out function
 * - isConfigured: Whether Supabase is configured
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  // Check if Supabase is configured
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const configured = await window.electronAPI.authIsConfigured();
        setIsConfigured(configured);
        
        if (!configured) {
          setIsLoading(false);
          return;
        }

        // Check for existing session
        const session = await window.electronAPI.authGetSession();
        if (session) {
          setUser(session.user);
          const adminStatus = await window.electronAPI.authIsAdmin();
          setIsAdmin(adminStatus);
        }
      } catch (error) {
        console.error('[Auth] Init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkConfig();
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    if (!isConfigured) return;

    window.electronAPI.onAuthStateChange(async ({ event, session }) => {
      console.log('[Auth] State change:', event);
      
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        const adminStatus = await window.electronAPI.authIsAdmin();
        setIsAdmin(adminStatus);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAdmin(false);
      }
    });

    return () => {
      window.electronAPI.removeAuthStateListener();
    };
  }, [isConfigured]);

  const signIn = useCallback(async (email, password) => {
    try {
      const result = await window.electronAPI.authSignIn(email, password);
      if (result.success) {
        setUser(result.user);
        const adminStatus = await window.electronAPI.authIsAdmin();
        setIsAdmin(adminStatus);
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const signUp = useCallback(async (email, password) => {
    try {
      const result = await window.electronAPI.authSignUp(email, password);
      if (result.success) {
        setUser(result.user);
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await window.electronAPI.authSignOut();
      setUser(null);
      setIsAdmin(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const verifyAdminPassword = useCallback(async (password) => {
    try {
      const result = await window.electronAPI.authVerifyAdminPassword(password);
      if (result.success) {
        setIsAdmin(true);
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const exitAdminMode = useCallback(async () => {
    try {
      await window.electronAPI.authExitAdminMode();
      setIsAdmin(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const value = {
    user,
    isAdmin,
    isLoading,
    isConfigured,
    signIn,
    signUp,
    signOut,
    verifyAdminPassword,
    exitAdminMode
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
