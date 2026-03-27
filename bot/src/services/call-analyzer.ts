import { eq } from 'drizzle-orm';
import { db } from '../db/connection';
import { callAnalyses, productSignals } from '../db/schema';
import { anthropic } from '../ai/client';
import { CALL_ANALYSIS_PROMPT, INTERNAL_PRODUCT_SIGNALS_PROMPT } from '../ai/call-analysis-prompts';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_TRANSCRIPT_CHARS = 25000;

export interface AnalyzeCallInput {
  transcript: string;
  zoomMeetingId: string;
  meetingId?: string;
  title?: string;
  date?: number;
  duration?: number;
  repSlackId?: string;
  repName?: string;
}

export interface AnalyzeCallResult {
  analysisId: number;
  productSignalCount: number;
  outcome: string | null;
  awarenessLevel: string | null;
}

interface RawProductSignal {
  type: string;
  description: string;
  category?: string;
  severity?: string;
  verbatimQuote?: string;
}

interface CallAnalysisJson {
  businessName?: string | null;
  businessType?: string | null;
  businessStage?: string | null;
  estimatedRevenue?: string | null;
  employeeCount?: string | null;
  objections?: string[];
  pains?: string[];
  desires?: string[];
  awarenessLevel?: string | null;
  talkListenRatio?: number | null;
  questionCount?: number | null;
  openQuestionCount?: number | null;
  nextSteps?: string[];
  outcome?: string | null;
  riskFlags?: string[];
  summary?: string | null;
  productSignals?: RawProductSignal[];
}

export async function analyzeCall(input: AnalyzeCallInput): Promise<AnalyzeCallResult> {
  // Dedup: check if we've already analyzed this zoom meeting
  const existing = db
    .select({ id: callAnalyses.id, outcome: callAnalyses.outcome, awarenessLevel: callAnalyses.awarenessLevel })
    .from(callAnalyses)
    .where(eq(callAnalyses.zoomMeetingId, input.zoomMeetingId))
    .get();

  if (existing) {
    console.log(`[call-analyzer] Already analyzed zoomMeetingId=${input.zoomMeetingId}, skipping.`);
    const signalCount = db
      .select({ id: productSignals.id })
      .from(productSignals)
      .where(eq(productSignals.callAnalysisId, existing.id))
      .all().length;
    return {
      analysisId: existing.id,
      productSignalCount: signalCount,
      outcome: existing.outcome ?? null,
      awarenessLevel: existing.awarenessLevel ?? null,
    };
  }

  // Truncate transcript
  const truncatedTranscript = input.transcript.slice(0, MAX_TRANSCRIPT_CHARS);

  const prompt = CALL_ANALYSIS_PROMPT.replace('{{TRANSCRIPT}}', truncatedTranscript);

  console.log(`[call-analyzer] Analyzing call for zoomMeetingId=${input.zoomMeetingId}`);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('');

  let analysis: CallAnalysisJson = {};
  try {
    analysis = JSON.parse(rawText) as CallAnalysisJson;
  } catch (err) {
    console.error('[call-analyzer] Failed to parse Claude response as JSON:', err);
    console.error('[call-analyzer] Raw response:', rawText.slice(0, 500));
    analysis = {};
  }

  const now = Math.floor(Date.now() / 1000);

  // Insert into callAnalyses
  const inserted = db
    .insert(callAnalyses)
    .values({
      meetingId: input.meetingId ?? null,
      zoomMeetingId: input.zoomMeetingId,
      title: input.title ?? null,
      date: input.date ?? now,
      duration: input.duration ?? null,
      repSlackId: input.repSlackId ?? null,
      repName: input.repName ?? null,
      businessName: analysis.businessName ?? null,
      businessType: analysis.businessType ?? null,
      businessStage: analysis.businessStage ?? null,
      estimatedRevenue: analysis.estimatedRevenue ?? null,
      employeeCount: analysis.employeeCount ?? null,
      objections: analysis.objections ?? [],
      pains: analysis.pains ?? [],
      desires: analysis.desires ?? [],
      awarenessLevel: analysis.awarenessLevel ?? null,
      talkListenRatio: analysis.talkListenRatio ?? null,
      questionCount: analysis.questionCount ?? null,
      openQuestionCount: analysis.openQuestionCount ?? null,
      nextSteps: analysis.nextSteps ?? [],
      outcome: analysis.outcome ?? null,
      riskFlags: analysis.riskFlags ?? [],
      summary: analysis.summary ?? null,
      rawAnalysis: analysis,
      createdAt: now,
    })
    .returning({ id: callAnalyses.id })
    .get();

  const analysisId = inserted.id;

  // Insert product signals
  const rawSignals: RawProductSignal[] = analysis.productSignals ?? [];
  for (const signal of rawSignals) {
    db.insert(productSignals)
      .values({
        type: signal.type,
        description: signal.description,
        category: signal.category ?? null,
        severity: signal.severity ?? null,
        verbatimQuote: signal.verbatimQuote ?? null,
        businessName: analysis.businessName ?? null,
        businessRevenue: analysis.estimatedRevenue ?? null,
        callAnalysisId: analysisId,
        meetingId: input.meetingId ?? null,
        reportedBy: input.repSlackId ?? null,
        createdAt: now,
      })
      .run();
  }

  console.log(
    `[call-analyzer] Stored analysis id=${analysisId}, outcome=${analysis.outcome}, signals=${rawSignals.length}`,
  );

  return {
    analysisId,
    productSignalCount: rawSignals.length,
    outcome: analysis.outcome ?? null,
    awarenessLevel: analysis.awarenessLevel ?? null,
  };
}

// ─── Internal Product Signal Extraction ─────────────────────────────
// Lighter analysis for internal team meetings — extracts product signals only
// (no call_analyses row, no sales intelligence, no coaching)

export interface ExtractInternalProductSignalsInput {
  meetingId?: string;
  zoomMeetingId: string;
  title?: string;
  transcriptText: string;
}

export interface ExtractInternalProductSignalsResult {
  productSignalCount: number;
}

interface InternalProductSignalJson {
  type: string;
  description: string;
  category?: string;
  severity?: string;
  verbatim_quote?: string;
  source?: string;
}

interface InternalProductSignalsResponse {
  product_signals?: InternalProductSignalJson[];
}

export async function extractInternalProductSignals(
  input: ExtractInternalProductSignalsInput,
): Promise<ExtractInternalProductSignalsResult> {
  // Dedup: check if we already extracted internal signals for this zoom meeting
  const existing = db
    .select({ id: productSignals.id })
    .from(productSignals)
    .where(eq(productSignals.meetingId, input.zoomMeetingId))
    .all();

  if (existing.length > 0) {
    console.log(`[call-analyzer] Already extracted internal signals for zoomMeetingId=${input.zoomMeetingId}, skipping.`);
    return { productSignalCount: existing.length };
  }

  // Truncate transcript
  const truncatedTranscript = input.transcriptText.slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt = INTERNAL_PRODUCT_SIGNALS_PROMPT.replace('{{TRANSCRIPT}}', truncatedTranscript);

  console.log(`[call-analyzer] Extracting internal product signals for zoomMeetingId=${input.zoomMeetingId}`);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('');

  let parsed: InternalProductSignalsResponse = {};
  try {
    parsed = JSON.parse(rawText) as InternalProductSignalsResponse;
  } catch (err) {
    console.error('[call-analyzer] Failed to parse internal signals response as JSON:', err);
    console.error('[call-analyzer] Raw response:', rawText.slice(0, 500));
    parsed = {};
  }

  const signals: InternalProductSignalJson[] = parsed.product_signals ?? [];
  const now = Math.floor(Date.now() / 1000);

  for (const signal of signals) {
    db.insert(productSignals)
      .values({
        type: signal.type,
        description: signal.description,
        category: signal.category ?? null,
        severity: signal.severity ?? null,
        verbatimQuote: signal.verbatim_quote ?? null,
        businessName: null,
        businessRevenue: null,
        callAnalysisId: null,
        meetingId: input.zoomMeetingId,
        reportedBy: 'internal',
        createdAt: now,
      })
      .run();
  }

  console.log(
    `[call-analyzer] Stored ${signals.length} internal product signals for zoomMeetingId=${input.zoomMeetingId}`,
  );

  return { productSignalCount: signals.length };
}
