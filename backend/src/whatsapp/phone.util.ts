/**
 * Normalize phone numbers to E.164.
 * Pakistan-friendly defaults: 03XXXXXXXXX → +923XXXXXXXXX, 923… → +923…
 * Returns null when the value cannot be normalized safely.
 */
export function normalizeE164Phone(
  raw?: string | null,
  defaultCountryCode = '92',
): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;

  // Keep leading +; strip other non-digits
  const hasPlus = value.startsWith('+');
  value = value.replace(/[^\d+]/g, '');
  if (hasPlus) {
    value = '+' + value.replace(/\D/g, '');
  } else {
    value = value.replace(/\D/g, '');
  }

  if (!value) return null;

  if (value.startsWith('+')) {
    const digits = value.slice(1);
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // Local Pakistani mobile: 03XXXXXXXXX (11 digits)
  if (defaultCountryCode === '92' && /^03\d{9}$/.test(value)) {
    return `+92${value.slice(1)}`;
  }

  // Country code without plus: 923XXXXXXXXX
  if (defaultCountryCode === '92' && /^92\d{10}$/.test(value)) {
    return `+${value}`;
  }

  // Generic: prepend default country if looks like national number (8–11 digits)
  if (/^\d{8,11}$/.test(value)) {
    const national = value.replace(/^0+/, '');
    return `+${defaultCountryCode}${national}`;
  }

  if (/^\d{12,15}$/.test(value)) {
    return `+${value}`;
  }

  return null;
}
