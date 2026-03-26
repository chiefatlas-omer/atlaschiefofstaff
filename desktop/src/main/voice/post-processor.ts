/**
 * post-processor.ts
 *
 * Cleans up raw Whisper output to WhisperFlow-level quality:
 *   1. Capitalise sentence starts and known proper nouns / acronyms
 *   2. Convert spoken numbers and percentages to digits
 *   3. Fix common Whisper misheards for Atlas-domain terms
 *   4. Optionally strip filler words (um, uh, like) — disabled by default so
 *      verbatim dictation is preserved; enable via options.stripFillers
 */

export interface PostProcessOptions {
  /** Remove filler words (um, uh, like). Default: false. */
  stripFillers?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Acronyms / proper-nouns that should always be uppercase or title-cased
// ---------------------------------------------------------------------------
const UPPERCASE_TERMS: string[] = [
  'MRR', 'ARR', 'NRR', 'QBR', 'CAC', 'LTV', 'API', 'CRM', 'SOP',
  'ROI', 'KPI', 'SQL', 'MQL', 'ICP', 'ACV', 'TCV', 'EBITDA',
  'CSS', 'HTML', 'URL', 'HTTP', 'HTTPS', 'SDK', 'UI', 'UX',
  'CoS', // Chief of Staff abbreviation — mixed case
];

// Title-cased proper nouns (exact replacement, case-insensitive match)
const TITLECASE_TERMS: Record<string, string> = {
  'atlas growth': 'Atlas Growth',
  'atlas': 'Atlas',
  'chief of staff': 'Chief of Staff',
  'cos': 'CoS',
  'mirofish': 'MiroFish',
  'slack': 'Slack',
  'google': 'Google',
  'gmail': 'Gmail',
  'openai': 'OpenAI',
  'whisper': 'Whisper',
  'claude': 'Claude',
  'anthropic': 'Anthropic',
  'iphone': 'iPhone',
  'imessage': 'iMessage',
};

// ---------------------------------------------------------------------------
// 2. Number / percentage conversions (spoken → digit form)
//    Handles 0–19 individually, tens, hundreds, thousands, millions.
// ---------------------------------------------------------------------------
const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MAGNITUDE: Record<string, number> = {
  hundred: 100, thousand: 1000, million: 1_000_000, billion: 1_000_000_000,
};

/**
 * Convert a single spoken number phrase like "one hundred thousand" → 100000.
 * Returns null if the phrase cannot be parsed as a number.
 */
function spokenToNumber(phrase: string): number | null {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  let result = 0;
  let current = 0;

  for (const word of words) {
    if (word in ONES) {
      current += ONES[word];
    } else if (word in TENS) {
      current += TENS[word];
    } else if (word === 'hundred') {
      current = current === 0 ? 100 : current * 100;
    } else if (word in MAGNITUDE && word !== 'hundred') {
      const mag = MAGNITUDE[word];
      result += (current === 0 ? 1 : current) * mag;
      current = 0;
    } else {
      return null; // unrecognised word
    }
  }

  return result + current;
}

/** Format a large number with commas: 100000 → "100,000" */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// 3. Whisper misheard corrections for Atlas-domain terms
// ---------------------------------------------------------------------------
const MISHEAR_CORRECTIONS: Array<[RegExp, string]> = [
  // Atlas Growth variations
  [/\batlas\s+groth\b/gi, 'Atlas Growth'],
  [/\batlas\s+grows\b/gi, 'Atlas Growth'],
  [/\batlus\s+growth\b/gi, 'Atlas Growth'],
  [/\batlus\b/gi, 'Atlas'],
  // Chief of Staff
  [/\bchief\s+of\s+staff\b/gi, 'Chief of Staff'],
  [/\bchief\s+of\s+stab\b/gi, 'Chief of Staff'],
  // MRR / ARR misheard as words
  [/\bmonthly\s+recurring\s+revenue\b/gi, 'MRR'],
  [/\bannual\s+recurring\s+revenue\b/gi, 'ARR'],
  [/\bnet\s+revenue\s+retention\b/gi, 'NRR'],
  [/\bquarterly\s+business\s+review\b/gi, 'QBR'],
  [/\bcustomer\s+acquisition\s+cost\b/gi, 'CAC'],
  [/\blifetime\s+value\b/gi, 'LTV'],
  // Common Whisper artefacts
  [/\bum+\s+hm+\b/gi, ''],
  [/\s{2,}/g, ' '],
];

// ---------------------------------------------------------------------------
// 4. Filler-word removal (optional)
// ---------------------------------------------------------------------------
const FILLER_PATTERN = /\b(um+|uh+|er+|hmm+|mhm|like,?\s|you\s+know,?\s|basically,?\s|literally,?\s|actually,?\s)/gi;

// ---------------------------------------------------------------------------
// AI Polish Layer — cleans up dictation for communication contexts
// ---------------------------------------------------------------------------

export type PolishContext = 'slack' | 'email' | 'general';

/**
 * Uses Claude Haiku to polish raw transcribed text for communication.
 * Removes filler words, fixes grammar, and formats for the given context.
 * Falls back to the raw text if the AI call fails.
 */
export async function polishForCommunication(
  rawText: string,
  context: PolishContext = 'general',
): Promise<string> {
  if (!rawText || rawText.trim().length === 0) return rawText;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default();

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a communication polisher. Take this voice-transcribed text and make it ready to send.

Rules:
- Remove ALL filler words (um, uh, like, you know, basically, actually, so, right, I mean)
- Fix grammar and punctuation
- Structure it properly for the context (slack message, email, or general text)
- Keep the person's voice and intent — don't make it sound corporate or AI-generated
- If it sounds like an email, format it with greeting and sign-off
- If it sounds like a Slack message, keep it casual and concise
- Never add information that wasn't in the original
- Keep it natural and human
- Return ONLY the polished text, no explanations or preamble

Context: ${context}
Raw transcription: ${rawText}`,
        },
      ],
    });

    const polished = (response.content[0] as any)?.text?.trim();
    return polished || rawText;
  } catch (err) {
    console.error('[POLISH] AI polish failed, using raw text:', err);
    return rawText;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function postProcess(text: string, options: PostProcessOptions = {}): string {
  if (!text || text.trim().length === 0) return text;

  let out = text;

  // Step 1: Apply misheard corrections first (before we change casing)
  for (const [pattern, replacement] of MISHEAR_CORRECTIONS) {
    out = out.replace(pattern, replacement);
  }

  // Step 2: Convert spoken percentages — "five percent" → "5%"
  out = out.replace(
    /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s+percent)\b/gi,
    (match) => {
      const phraseWithoutPercent = match.replace(/\s+percent$/i, '').trim();
      const n = spokenToNumber(phraseWithoutPercent);
      return n !== null ? `${n}%` : match;
    }
  );

  // Step 3: Convert spoken numbers in common patterns (e.g. dollar amounts, counts)
  // "one hundred thousand dollars" → "$100,000"
  out = out.replace(
    /\$?\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?\s+){0,4}(?:hundred|thousand|million|billion)\b(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)?)/gi,
    (match) => {
      const hasDollar = match.startsWith('$');
      const phrase = hasDollar ? match.slice(1) : match;
      const n = spokenToNumber(phrase.trim());
      if (n === null) return match;
      return hasDollar ? `$${formatNumber(n)}` : formatNumber(n);
    }
  );

  // Step 4: Sentence-start capitalisation
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase());

  // Step 5: Force uppercase acronyms (whole-word match, case-insensitive)
  for (const term of UPPERCASE_TERMS) {
    if (term === 'CoS') {
      // Mixed-case: match "cos" as whole word
      out = out.replace(/\bcos\b/gi, 'CoS');
    } else {
      const re = new RegExp(`\\b${term}\\b`, 'gi');
      out = out.replace(re, term);
    }
  }

  // Step 6: Proper nouns (longest match first to avoid partial replacement)
  const sortedTitleTerms = Object.keys(TITLECASE_TERMS).sort((a, b) => b.length - a.length);
  for (const key of sortedTitleTerms) {
    const re = new RegExp(`\\b${key.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    out = out.replace(re, TITLECASE_TERMS[key]);
  }

  // Step 7: Strip filler words (optional)
  if (options.stripFillers) {
    out = out.replace(FILLER_PATTERN, ' ');
    out = out.replace(/\s{2,}/g, ' ').trim();
  }

  // Step 8: Final trim and cleanup
  out = out.trim();

  return out;
}
