"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile } from "@/types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isDemo: boolean;
  signInWithOtp: (phone: string) => Promise<{ error: string | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  /**
   * Email + password sign-in. Used by admins (who don't have SMS-OTP set up
   * yet) and any operator account created via the Supabase Auth Admin API.
   * Customers continue using phone OTP via signInWithOtp.
   */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
}

const defaultState: AuthState = {
  user: null,
  profile: null,
  session: null,
  loading: true,
  isAdmin: false,
  isDemo: true,
  signInWithOtp: async () => ({ error: "Not connected" }),
  verifyOtp: async () => ({ error: "Not connected" }),
  signInWithPassword: async () => ({ error: "Not connected" }),
  signOut: async () => {},
  updateProfile: async () => {},
};

export const AuthContext = createContext<AuthState>(defaultState);

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemo = isDemoMode();

  const fetchProfile = useCallback(async (userId: string) => {
    if (isDemo) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data as Profile);
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) fetchProfile(s.user.id);
        else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [isDemo, fetchProfile]);

  const signInWithOtp = async (phone: string) => {
    if (isDemo) return { error: "Demo mode — connect Supabase to enable auth" };
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+91${phone}`,
    });
    return { error: error?.message ?? null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (isDemo) return { error: "Demo mode — connect Supabase to enable auth" };
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (isDemo) return { error: "Demo mode — connect Supabase to enable auth" };
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      phone: `+91${phone}`,
      token,
      type: "sms",
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (isDemo) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (isDemo || !user) return;
    const supabase = createClient();
    await supabase.from("profiles").update(data).eq("id", user.id);
    setProfile((prev) => (prev ? { ...prev, ...data } : null));
  };

  return {
    user,
    profile,
    session,
    loading,
    isAdmin: profile?.role === "admin",
    isDemo,
    signInWithOtp,
    verifyOtp,
    signInWithPassword,
    signOut,
    updateProfile,
  };
}
