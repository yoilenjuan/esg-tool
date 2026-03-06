// ─── Retail Rule Helpers ──────────────────────────────────────────────────────
// Pure, side-effect-free utility functions.  All functions are exported so they
// can be unit-tested independently of the engine.

// ── String normalisation ──────────────────────────────────────────────────────

/**
 * Lowercase + Unicode NFKD accent strip.
 * "Señor" → "senor",  "Prénom" → "prenom"
 */
export function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .trim();
}

/**
 * Returns true when `normalize(value)` contains at least one of the supplied
 * keywords (exact substring match after normalisation).
 */
export function includesAny(value: string, keywords: string[]): boolean {
  const n = normalize(value);
  return keywords.some((kw) => n.includes(normalize(kw)));
}

// ── Gender option helpers ─────────────────────────────────────────────────────

const BINARY_GENDER_TOKENS = new Set([
  'male', 'female', 'hombre', 'mujer', 'masculino', 'femenino',
  'man', 'woman', 'senor', 'senora', 'sr', 'sra', 'mr', 'mrs',
  'm', 'f', 'h', 'v',
]);

const NEUTRAL_GENDER_TOKENS: string[] = [
  'non-binary', 'nonbinary', 'no binari', 'no-binari',
  'other', 'otro', 'otra',
  'prefer not', 'prefiero no',
  'neutral', 'diverse', 'diverso',
  'they', 'elle', '@',
  'nb', 'x',
];

const PREFER_NOT_TOKENS: string[] = [
  'prefer not', 'prefiero no', 'no especificar', 'no contestar',
  'rather not', 'decline', 'not say',
];

/**
 * Returns true when the option set contains ONLY binary tokens and no neutral
 * options.  Placeholder options (empty / "select…") are ignored.
 */
export function isBinaryOnly(options: string[]): boolean {
  const meaningful = options
    .map(normalize)
    .filter((o) => o !== '' && !isPlaceholder(o));

  if (meaningful.length === 0) return false;

  const hasNeutral = meaningful.some((o) => includesAny(o, NEUTRAL_GENDER_TOKENS));
  if (hasNeutral) return false;

  return meaningful.every((o) => BINARY_GENDER_TOKENS.has(o) || /^[mfhv]$/.test(o));
}

/**
 * Returns true when the option set includes at least one neutral / non-binary
 * variant.
 */
export function includesNeutralOption(options: string[]): boolean {
  return options.some((o) => includesAny(o, NEUTRAL_GENDER_TOKENS));
}

/**
 * Returns true when the option set includes a "prefer not to say" variant.
 */
export function includesPreferNotToSay(options: string[]): boolean {
  return options.some((o) => includesAny(o, PREFER_NOT_TOKENS));
}

// ── Numeric utilities ─────────────────────────────────────────────────────────

/**
 * Clamps a numeric score to the [0, 100] range.
 */
export function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

/** Returns true for common placeholder option texts. */
export function isPlaceholder(value: string): boolean {
  return includesAny(value, [
    'select', 'selecciona', 'choose', 'elige', 'pick',
    '---', '...', 'please',
  ]);
}

/**
 * Returns true when the field name/label looks like a mandatory national-ID
 * field typical of Spain / EU retail forms.
 */
export function isNationalIdField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, [
    'dni', 'nie', 'passport', 'pasaporte',
    'national_id', 'nationalid', 'national id',
    'tax_id', 'taxid', 'tax id',
    'nif', 'cif', 'documento', 'document',
  ]);
}

/**
 * Returns true when the field name/label looks like a marital-status field.
 */
export function isMaritalStatusField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, [
    'civil', 'marital', 'estado_civil', 'estadocivil',
    'matrimonial', 'married',
  ]);
}

/**
 * Returns true when the field name/label looks like a date-of-birth / age
 * field.
 */
export function isAgeField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, [
    'dob', 'date_of_birth', 'dateofbirth', 'fecha_nacimiento',
    'fechanacimiento', 'birthdate', 'birth_date', 'nacimiento',
    'age', 'edad',
  ]);
}

/**
 * Returns true when the field name/label looks like a gender field.
 */
export function isGenderField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, [
    'gender', 'genero', 'sexo', 'sex', 'titulo', 'title',
    'salutation', 'tratamiento', 'honorific',
  ]);
}

/**
 * Returns true when the field name looks like an email field.
 */
export function isEmailField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, ['email', 'correo', 'mail', 'e-mail']);
}

/**
 * Returns true when the field name looks like a country selector.
 */
export function isCountryField(nameOrLabel: string): boolean {
  return includesAny(nameOrLabel, [
    'country', 'pais', 'país', 'nation', 'region',
  ]);
}

const EU_WALLET_TOKENS: string[] = [
  'paypal', 'klarna', 'stripe', 'apple pay', 'applepay',
  'google pay', 'googlepay', 'bizum', 'sepa', 'ideal',
  'sofort',
];

/**
 * Returns true when the provided set of payment method strings contains at
 * least one recognised EU digital wallet.
 */
export function hasEuWallet(paymentMethods: string[]): boolean {
  return paymentMethods.some((m) => includesAny(m, EU_WALLET_TOKENS));
}
