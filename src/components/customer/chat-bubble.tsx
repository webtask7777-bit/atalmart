"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";
import { useSettings } from "@/lib/store/settings";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/lib/store/cart";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "atalmart-chat-history";
const MAX_HISTORY = 20;
const GREETING: ChatMessage = {
  id: "g0",
  role: "assistant",
  content:
    "Namaste! 🙏 Main Atalmart Assistant hoon. Delivery, payment, products — kuch bhi poochiye!",
};

export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  const cartItems = useCartStore((s) => s.items);
  const pathname = usePathname();
  // The compact cart bar sits above the mobile bottom nav whenever the cart
  // has items (except on /cart and /checkout); lift the launcher above it so
  // it doesn't cover "View cart".
  const cartBarShown =
    cartItems.length > 0 && !pathname.startsWith("/cart") && !pathname.startsWith("/checkout");

  // Auto-hide on scroll-down, reveal on scroll-up or rest.
  useEffect(() => {
    if (open) return;
    let last = window.scrollY;
    let restTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const now = window.scrollY;
      const dy = now - last;
      if (Math.abs(dy) > 6) {
        setHidden(dy > 0 && now > 120);
        last = now;
      }
      if (restTimer) clearTimeout(restTimer);
      restTimer = setTimeout(() => setHidden(false), 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (restTimer) clearTimeout(restTimer);
    };
  }, [open]);

  // Restore history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_HISTORY)),
      );
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);
    setError(null);

    // Build conversation history (excluding the empty assistant placeholder)
    const history = [...messages, userMsg]
      .filter((m) => m.id !== assistantId)
      .filter((m) => m.id !== "g0") // skip greeting in payload
      .slice(-12) // last 12 turns for context
      .map((m) => ({ role: m.role, content: m.content }));

    // Build dynamic store context (cart state)
    const storeContext =
      cartItems.length > 0
        ? `Customer has ${cartItems.length} items in cart, total ₹${cartItems.reduce(
            (s, i) => s + i.product.price * i.quantity,
            0,
          )}.`
        : "Cart is empty.";

    // Only include apiKey in dev — in production, the server reads ANTHROPIC_API_KEY
    // from env. NODE_ENV check ensures this is dead-stripped from production bundles.
    const isDev = process.env.NODE_ENV !== "production";
    const devApiKey =
      isDev && settings.anthropicEnabled ? settings.anthropicApiKey : undefined;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          ...(devApiKey && { apiKey: devApiKey }),
          model: settings.anthropicModel,
          storeContext,
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text();
        try {
          const j = JSON.parse(errBody) as { error?: string };
          throw new Error(j.error || `HTTP ${res.status}`);
        } catch {
          throw new Error(errBody || `HTTP ${res.status}`);
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // keep partial line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              delta?: string;
              done?: boolean;
              error?: string;
            };
            if (data.error) {
              setError(data.error);
              break;
            }
            if (data.delta) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: msg.content + data.delta }
                    : msg,
                ),
              );
            }
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[chat] malformed SSE chunk", err);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      // Remove the empty assistant placeholder on error
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, settings, cartItems]);

  const resetChat = () => {
    setMessages([GREETING]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat support"
          className={`fixed ${cartBarShown ? "bottom-[calc(7.25rem+env(safe-area-inset-bottom,0px))]" : "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]"} right-3 md:bottom-6 md:right-6 z-40 w-11 h-11 md:w-12 md:h-12 rounded-full bg-saffron text-white shadow-md hover:shadow-lg hover:bg-orange-600 transition-all flex items-center justify-center group ${
            hidden ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
          }`}
        >
          <MessageCircle size={18} />
          <span className="absolute -top-9 right-0 bg-brown text-white text-[11px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Help
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-md h-[70vh] max-h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-saffron to-orange-600 text-white p-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-indian-green rounded-full ring-2 ring-saffron" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">Atalmart Assistant</p>
                <p className="text-[10px] opacity-90 truncate">
                  {settings.anthropicEnabled && settings.anthropicApiKey
                    ? "AI-powered · Online"
                    : "Live chat coming soon ✨"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={resetChat}
                title="Reset chat"
                className="text-[10px] font-semibold px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2 bg-gray-50"
          >
            {messages.map((m) => (
              <ChatBubbleRow key={m.id} message={m} />
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 border border-gray-200">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-saffron rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-saffron rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-saffron rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Quick suggestions when starting */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {[
                "Delivery kitne time mein?",
                "COD available hai?",
                "Pet food bhi milta hai?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-saffron-light text-saffron border border-orange-200 hover:bg-orange-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-100 p-2.5 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Apna sawal type karein..."
                disabled={streaming}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:border-saffron focus:bg-white transition-colors disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={streaming || !input.trim()}
                aria-label="Send message"
                className="w-9 h-9 shrink-0 rounded-full bg-saffron text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {streaming ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatBubbleRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-saffron text-white rounded-2xl rounded-br-sm"
            : "bg-white text-brown border border-gray-200 rounded-2xl rounded-bl-sm"
        }`}
      >
        {message.content || (isUser ? "" : "…")}
      </div>
    </div>
  );
}
