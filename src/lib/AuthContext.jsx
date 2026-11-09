import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

// Routes that are always public — no auth check needed
const PUBLIC_PATHS = new Set(["/", "/Home", "/home", "/pricing", "/Pricing", "/WidgetHost", "/login", "/Login", "/auth", "/Auth", "/beta", "/lead-capture", "/onboarding", "/invite", "/agent-program", "/agency-enquiry", "/free-trial", "/privacy", "/terms", "/about", "/contact", "/refund-policy", "/shipping-policy"]);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // For fully public paths, skip all auth loading immediately
  const isPublicPath = PUBLIC_PATHS.has(window.location.pathname);

  useEffect(() => {
    if (isPublicPath) {
      // Skip auth check for public pages — just render them
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      return;
    }
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token,
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          } else if (reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          } else {
            setAuthError({ type: reason, message: appError.message });
          }
        } else {
          // Don't block the app for unknown errors — just continue without settings
          console.warn('Non-fatal auth error, continuing:', appError.message);
          setAuthError(null);
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      // Don't block the app — just clear loading states
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  };

  const logout = () => {
    // Clear all cached tokens so the next login always prompts fresh credentials
    localStorage.removeItem("base44_access_token");
    localStorage.removeItem("base44_refresh_token");
    sessionStorage.removeItem("base44_access_token");
    sessionStorage.clear();
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout("/auth");
  };

  // BUG-001 FIX: Guard against redirect loop — don't redirect if already on login/auth
  const navigateToLogin = () => {
    const _now = Date.now();
    const _last = Number(sessionStorage.getItem('__nav_login_ts') || 0);
    if (_now - _last < 2500) return; // debounce — don't double-redirect within 2.5s
    sessionStorage.setItem('__nav_login_ts', String(_now));
    const p = window.location.pathname.toLowerCase();
    if (p === '/auth' || p === '/login') return; // already on auth page
    window.location.href = '/auth';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};