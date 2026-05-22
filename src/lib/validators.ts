/**
 * Shared client+server input validators. Kept tiny on purpose — no zod or
 * any runtime dependency. Each function returns either `null` (valid) or a
 * human-readable error message safe to display to the user.
 *
 * For form fields, prefer pattern:
 *   const err = validatePhone10(phone);
 *   if (err) return toast.error(err);
 */

/** 10-digit Indian phone (no country code). */
export function validatePhone10(phone: string): string | null {
  const cleaned = phone.trim();
  if (!cleaned) return "Phone number is required";
  if (!/^\d{10}$/.test(cleaned)) return "Valid 10-digit phone required";
  return null;
}

/** Indian 6-digit pincode. */
export function validatePincode(pincode: string): string | null {
  const cleaned = pincode.trim();
  if (!cleaned) return "Pincode is required";
  if (!/^\d{6}$/.test(cleaned)) return "Valid 6-digit pincode required";
  return null;
}

/** Recipient name — 2-60 chars, letters/spaces/common punctuation. */
export function validateName(name: string): string | null {
  const cleaned = name.trim();
  if (cleaned.length < 2) return "Name must be at least 2 characters";
  if (cleaned.length > 60) return "Name must be under 60 characters";
  return null;
}

/** Address — 5-200 chars freeform. */
export function validateAddress(address: string): string | null {
  const cleaned = address.trim();
  if (cleaned.length < 5) return "Please enter a complete address";
  if (cleaned.length > 200) return "Address too long";
  return null;
}
