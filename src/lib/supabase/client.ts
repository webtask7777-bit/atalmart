import { createBrowserClient } from "@supabase/ssr";

// Database type is generated in ./database.types.ts and can be imported a-la-carte
// for new code (e.g. `createBrowserClient<Database>(...)` in a feature-scoped
// helper). It's NOT wired in here because legacy callers reference tables not
// yet in the schema (coupons/wallets/settings) and a typed default client would
// surface them as build errors. Add those migrations first, then re-wire.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
