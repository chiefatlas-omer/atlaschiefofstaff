import { sqlite } from './connection';

/**
 * Logs voice interactions to the shared knowledge_entries table.
 * Uses raw SQL since the desktop app shares the bot's SQLite DB
 * and the knowledge_entries table is created by the bot.
 *
 * No embeddings are generated here — the bot's embedding service
 * handles that on its next ingestion pass, or we accept text-only
 * entries for now (searchable by content, not by vector similarity).
 */
export function logVoiceInteraction(input: {
  transcript: string;
  response: string;
  intent: string;
  userId?: string;
}) {
  try {
    const combined = `Voice command: ${input.transcript}\nResponse: ${input.response}`;
    const now = Math.floor(Date.now() / 1000);
    const metadata = JSON.stringify({
      transcript: input.transcript,
      intent: input.intent,
      userId: input.userId,
      timestamp: Date.now(),
    });

    sqlite.prepare(`
      INSERT INTO knowledge_entries (source_type, source_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('voice', `voice_${Date.now()}`, combined, metadata, now);

    console.log('[VOICE] Logged interaction to knowledge graph');
  } catch (err) {
    // Non-fatal — knowledge_entries table may not exist yet if bot hasn't run
    console.error('[VOICE] Failed to log interaction (non-fatal):', err);
  }
}
