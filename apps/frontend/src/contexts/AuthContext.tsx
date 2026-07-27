import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * True from the moment Supabase reports PASSWORD_RECOVERY until the password
   * is actually changed (or the user signs out).
   *
   * This exists because a user arriving from a reset email is INDISTINGUISHABLE
   * from an ordinary sign-in by session alone: Supabase has already established
   * a full, valid session by the time React renders. The event is the only
   * signal that says "this session came from a reset link and the password has
   * NOT been changed yet", and it is delivered exactly once. Discarding it —
   * which is what this listener used to do — leaves the router with no way to
   * tell a recovery from a magic link, so the authenticated redirect sends the
   * user to /dashboard and they are silently logged in with the SAME password
   * they came here to replace.
   */
  isRecovering: boolean;
  /** Ends the recovery state. Called once the new password is committed. */
  clearRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // 1. Initial check to see if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Listen for auth changes (login, logout, token refresh, recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // The event is READ, not consumed: session handling below is unchanged
      // for every event, including PASSWORD_RECOVERY. All this adds is a flag
      // the router can key off — see isRecovering above for why it is needed.
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
      // A sign-out ends any pending recovery: there is no longer a session to
      // change the password on, so leaving the flag set would strand the app
      // on the reset screen.
      if (event === 'SIGNED_OUT') setIsRecovering(false);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const clearRecovery = () => setIsRecovering(false);

  const value = {
    session,
    user,
    loading,
    isRecovering,
    clearRecovery,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};