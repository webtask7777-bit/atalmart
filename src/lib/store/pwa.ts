import { create } from "zustand";

/**
 * Shared PWA-install state. The `beforeinstallprompt` event can only be fired
 * once and must be captured immediately, so PWAProvider stashes it here and any
 * UI (the auto-banner, a footer "Download App" button) triggers the SAME
 * deferred prompt. iOS Safari never fires the event — `isIos` lets the button
 * fall back to "Add to Home Screen" instructions instead.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

interface PwaState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isIos: boolean;
  isStandalone: boolean;
  installed: boolean;
  setPrompt: (e: BeforeInstallPromptEvent | null) => void;
  setIos: (v: boolean) => void;
  setStandalone: (v: boolean) => void;
  setInstalled: (v: boolean) => void;
  /** Fire the native install prompt. Returns the outcome, or null if no prompt
   *  was captured (dev, unsupported browser, or already installed). */
  promptInstall: () => Promise<"accepted" | "dismissed" | null>;
}

export const usePwaStore = create<PwaState>((set, get) => ({
  deferredPrompt: null,
  isIos: false,
  isStandalone: false,
  installed: false,
  setPrompt: (e) => set({ deferredPrompt: e }),
  setIos: (v) => set({ isIos: v }),
  setStandalone: (v) => set({ isStandalone: v }),
  setInstalled: (v) => set({ installed: v }),
  promptInstall: async () => {
    const dp = get().deferredPrompt;
    if (!dp) return null;
    await dp.prompt();
    const { outcome } = await dp.userChoice;
    // The event is single-use — clear it once consumed.
    set({ deferredPrompt: null, installed: outcome === "accepted" });
    return outcome;
  },
}));
