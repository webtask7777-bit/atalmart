import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey } from "@/lib/server/secrets";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatRequestMessage[];
  /**
   * @deprecated Will be removed. The server reads ANTHROPIC_API_KEY from env.
   * In dev/demo mode, falls back to this if env is missing. In production
   * this field is ignored entirely.
   */
  apiKey?: string;
  model?: string;
  storeContext?: string; // optional dynamic context (current cart, address)
}

// Customer-facing fallback when the AI assistant isn't live yet. NEVER mention
// API keys / admin setup here — that's internal config the customer shouldn't
// see. Warm "coming soon" tone + a few genuinely useful facts + contact.
const COMING_SOON_REPLIES = [
  "Namaste! 🙏 Main Atalmart Assistant — abhi thodi setup mein hoon, live chat bahut jald aa rahi hai! ✨ Tab tak: Naya Raipur mein quick delivery, ₹299+ pe free delivery, COD + UPI dono chalte hain. Kuch aur? webtask7777@gmail.com pe likhein. 🛒",
  "Hello ji! 🙏 Hamari live chat support bahut jald aa rahi hai — hum coming soon hain! ⚡ Filhaal itna: quick grocery delivery, free delivery ₹299+ pe, COD bhi available. Zyada madad ke liye webtask7777@gmail.com pe likhein. 🛵",
  "Hi! 🙏 AI chat thodi der mein live ho rahi hai — bahut jald! 🎉 Tab tak agar order, delivery ya payment ke baare mein kuch poochna ho to webtask7777@gmail.com pe email kar dein, hum turant reply karenge. 🛒",
];

function buildSystemPrompt(): string {
  // KEEP THIS FROZEN — any per-request variation invalidates the prompt cache.
  // For dynamic info (current cart, address), pass via a user message instead.
  return `You are "Atalmart Assistant" — the friendly customer support bot for Atalmart, a quick grocery delivery app serving Atal Nagar, Naya Raipur (Chhattisgarh, India).

# Your personality
- Warm, helpful, conversational — like a polite neighbourhood shopkeeper
- Reply in **Hinglish** (Hindi-English code-switching) by default — the way an urban Indian millennial would type. Example: "Bilkul! Aapka order jaldi pohanch jaayega."
- If the customer writes in pure English or pure Hindi, match their language
- Keep replies **short and direct** (1-3 sentences). This is a chat bubble, not an essay
- Use emojis sparingly but warmly — 🙏 🛒 ⚡ 🛵 when appropriate
- NEVER make up information you don't have — if unsure, say "Main check karke bataungi, ya aap webtask7777@gmail.com pe email kar sakte hain"

# Store information
- **Name**: Atalmart — "Atal Nagar ki Atal Delivery"
- **Location**: Sector 28, Nawagaon Parsatti, Atal Nagar-Nava Raipur, Chhattisgarh 492018
- **Delivery time**: quick delivery — as fast as possible (do NOT promise a specific number of minutes)
- **Delivery fee**: ₹25, FREE above ₹299
- **Minimum order**: ₹49
- **Delivery fleet**: 100% electric scooters 🛵⚡ (eco-friendly)
- **Hours**: not finalised yet — if asked, say timings will be announced soon
- **Contact**: webtask7777@gmail.com, +91 7777066666

# Service area — STRICT
**Atalmart delivers ONLY to Naya Raipur.** Specifically these 5 pincodes:
- **492101** — Sector 21–29, Atal Nagar
- **492014** — Sector 17, Atal Nagar
- **492015** — Naya Raipur Township
- **492018** — Capital Complex, Naya Raipur
- **492030** — Mantralaya, Naya Raipur

**Hum old Raipur, Bilaspur, Durg, ya kisi aur city/area mein deliver NAHI karte.** Agar customer kahe ki woh in 5 pincodes ke bahar hain, politely refuse:

> *"Sorry, abhi hum sirf Naya Raipur ke 5 pincodes mein deliver karte hain — 492101, 492014, 492015, 492018, 492030. Agar aap is area mein nahi hain, hum jaldi expand karenge — humari mailing list join karein webtask7777@gmail.com pe email karke."*

NEVER promise delivery to areas outside this list, even if the customer insists.

# Payment methods
- Cash on Delivery (COD) — most popular
- UPI (GPay, PhonePe, Paytm, BHIM)
- Credit/Debit cards (via Razorpay)
- No COD charges. No hidden fees.

# Active coupons
- **ATAL50**: ₹50 off on first order (min ₹199)
- **NAYA10**: 10% off, max ₹100 (min ₹299)
- **GROCERY100**: ₹100 off on orders above ₹699

# Categories we carry (20 total)
Paan Corner, Dairy, Fruits & Vegetables, Cold Drinks, Snacks, Breakfast/Instant Food, Chocolates & Sweets, Bakery (breads/buns/biscuits), Tea/Coffee, Atta/Rice/Dal, Masala/Oil, Sauces, Chicken/Meat/Fish (incl. eggs), Baby Care, Pharma & Wellness, Cleaning (incl. pooja items/disposables), Stationery/Office & School, Personal Care, Pet Care.

# Common policies
- **Returns**: Damaged/wrong items — full refund within 24 hours, no questions asked
- **Cancellation**: Free cancellation before "Out for Delivery". After rider picks up, ₹15 cancellation fee may apply
- **Order tracking**: Real-time on the /orders page with live rider GPS
- **Refund time**: COD → instant on cancel; Online payment → 3-5 business days back to source
- **Stock-outs**: If item unavailable, customer is called within 2 minutes for substitution or refund

# What you CAN do
- Answer questions about products, pricing, availability, delivery, payment, returns
- Suggest coupons appropriate to the order value
- Explain order statuses (Placed, Confirmed, Picking, Out for Delivery, Delivered)
- Recommend products from our catalog

# What you CANNOT do
- Place an order on the customer's behalf (direct them to add items to cart)
- Process refunds or cancellations directly (direct them to /orders or support)
- Share other customers' information
- Give medical advice (for pharma products, suggest consulting a doctor)

# Response format rules
- NO markdown headings (#, ##) in replies — this is a chat bubble
- NO bullet lists unless the customer asks for a comparison or list
- Use plain conversational sentences
- If you mention a coupon code, format it as **ATAL50** (bold caps)
- Max 3 sentences per reply unless the customer explicitly asks for detail`;
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { messages, apiKey, model, storeContext } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Rate-limit per IP (or per-user once Supabase auth lands): 30 msgs / minute
  // is generous for genuine support conversation but blocks scrapers/abusers.
  const limit = rateLimitWithPrune(clientKey(req, null, "chat"), 30, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({
        error: `Too many messages — wait ${limit.retryAfterSec}s`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(limit.retryAfterSec),
        },
      },
    );
  }

  // Cap conversation length to prevent prompt-injection / context bloat.
  // 50 turns is well above any genuine support session.
  if (messages.length > 50) {
    return new Response(
      JSON.stringify({ error: "Conversation too long — start a new chat" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Resolve the API key: env first (production), request body only as
  // dev-mode fallback. Production deploys without ANTHROPIC_API_KEY fall
  // through to demo mode automatically.
  const resolved = resolveAnthropicKey(apiKey);
  if (!resolved.value || !resolved.value.startsWith("sk-ant-")) {
    const reply =
      COMING_SOON_REPLIES[
        Math.floor(Math.random() * COMING_SOON_REPLIES.length)
      ];
    return streamTextResponse(reply, { demo: true });
  }

  const client = new Anthropic({ apiKey: resolved.value });
  const chosenModel = model || "claude-haiku-4-5";

  // System prompt is FROZEN (no per-request variation) so the cache hits.
  // Dynamic context goes in a separate system block AFTER the cached one.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(),
      cache_control: { type: "ephemeral" },
    },
  ];
  if (storeContext && storeContext.trim().length > 0) {
    systemBlocks.push({
      type: "text",
      text: `Current customer context:\n${storeContext}`,
    });
  }

  try {
    const stream = client.messages.stream({
      model: chosenModel,
      max_tokens: 512, // chat-bubble replies, keep short
      system: systemBlocks,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Convert SDK stream to a ReadableStream of SSE chunks for the browser
    const encoder = new TextEncoder();
    const sse = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ delta: event.delta.text })}\n\n`,
                ),
              );
            }
          }
          // After stream completes, send usage info for cache verification
          const finalMessage = await stream.finalMessage();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                usage: {
                  input: finalMessage.usage.input_tokens,
                  output: finalMessage.usage.output_tokens,
                  cacheRead: finalMessage.usage.cache_read_input_tokens || 0,
                  cacheCreate:
                    finalMessage.usage.cache_creation_input_tokens || 0,
                },
              })}\n\n`,
            ),
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: message })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(sse, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    let message = "Claude API error";
    let status = 500;
    if (err instanceof Anthropic.AuthenticationError) {
      message = "Invalid API key — check Settings → AI Customer Support";
      status = 401;
    } else if (err instanceof Anthropic.RateLimitError) {
      message = "Too many requests — try again in a moment";
      status = 429;
    } else if (err instanceof Anthropic.APIError) {
      message = err.message;
      status = err.status || 500;
    } else if (err instanceof Error) {
      message = err.message;
    }
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
}

/** Stream a plain text reply as SSE (used for demo mode). */
function streamTextResponse(
  text: string,
  meta: Record<string, unknown> = {},
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Word-by-word stream to feel like real AI typing
      const words = text.split(/(\s+)/);
      for (const word of words) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ delta: word })}\n\n`),
        );
        await new Promise((r) => setTimeout(r, 30));
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
