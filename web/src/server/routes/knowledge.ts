import { Router } from 'express';
import { db } from '../db';
import { documents, knowledgeEntries, qaInteractions } from '../../../../bot/src/db/schema';
import { eq, desc, like, sql } from 'drizzle-orm';
import { ingestDocument } from '../../../../bot/src/services/ingestion-service';
import { createDocument } from '../../../../bot/src/services/graph-service';

const router = Router();

// GET /api/sops — all SOP documents
router.get('/sops', (_req, res) => {
  try {
    const rows = db
      .select()
      .from(documents)
      .where(eq(documents.type, 'sop'))
      .orderBy(desc(documents.updatedAt))
      .all();
    // Extract summary and format from the metadata JSON column
    const enriched = rows.map((d) => ({
      ...d,
      summary: (d.metadata as any)?.summary || null,
      format: (d.metadata as any)?.format || null,
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[knowledge] GET /sops error:', err);
    res.status(500).json({ error: 'Failed to fetch SOPs' });
  }
});

// POST /api/knowledge/upload — ingest a document into the knowledge graph
router.post('/upload', async (req, res) => {
  const { title, type, content } = req.body;
  const validTypes = ['sop', 'playbook', 'pricing_guide', 'process_doc', 'customer_info', 'general'];
  if (!title || !type || !content) {
    res.status(400).json({ error: 'title, type, and content are required' });
    return;
  }
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Valid: ${validTypes.join(', ')}` });
    return;
  }
  try {
    const result = await ingestDocument({ title, content, type });
    res.json({
      success: true,
      docId: result.docId,
      chunkCount: result.chunkCount,
      entities: {
        people: result.entities.people.length,
        companies: result.entities.companies.length,
      },
    });
  } catch (err: any) {
    console.error('[knowledge] POST /upload error:', err);

    // If ingestion failed (e.g. missing OPENAI_API_KEY), fall back to storing
    // the document directly without embeddings
    try {
      const doc = createDocument({
        title,
        type,
        content,
      });

      // Also insert a knowledge entry so the document is searchable via /ask
      db.insert(knowledgeEntries).values({
        sourceType: 'document',
        sourceId: doc.id,
        content: content.slice(0, 10000), // cap at 10k chars for the entry
      }).run();

      const note = !process.env.OPENAI_API_KEY
        ? 'Document saved without embeddings (OPENAI_API_KEY not configured). Text search still works.'
        : 'Document saved without embeddings due to an ingestion error. Text search still works.';

      res.json({
        success: true,
        docId: doc.id,
        chunkCount: 0,
        entities: { people: 0, companies: 0 },
        note,
      });
    } catch (fallbackErr) {
      console.error('[knowledge] POST /upload fallback error:', fallbackErr);
      res.status(500).json({ error: 'Ingestion failed. Check server logs for details.' });
    }
  }
});

// POST /api/ask — knowledge bot Q&A with LIKE-based search
router.post('/ask', (req, res) => {
  const { question, generateEmail } = req.body as { question?: string; generateEmail?: boolean };
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  const q = question.trim();

  try {
    // Extract keywords from the question (words >= 3 chars, skip stop words)
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'what', 'how', 'who', 'where', 'when', 'why', 'which', 'that', 'this', 'with', 'from', 'about', 'does', 'will', 'would', 'could', 'should']);
    const keywords = q.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

    let matches: Array<{ id: number; content: string; sourceType: string; sourceId: string }> = [];

    if (keywords.length > 0) {
      // Search knowledge_entries using LIKE for each keyword, union results
      for (const kw of keywords.slice(0, 5)) {
        const rows = db
          .select({
            id: knowledgeEntries.id,
            content: knowledgeEntries.content,
            sourceType: knowledgeEntries.sourceType,
            sourceId: knowledgeEntries.sourceId,
          })
          .from(knowledgeEntries)
          .where(like(knowledgeEntries.content, `%${kw}%`))
          .limit(10)
          .all();
        matches.push(...rows);
      }

      // Deduplicate by id
      const seen = new Set<number>();
      matches = matches.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      // Sort by relevance: entries matching more keywords first
      matches.sort((a, b) => {
        const aScore = keywords.filter(kw => a.content.toLowerCase().includes(kw)).length;
        const bScore = keywords.filter(kw => b.content.toLowerCase().includes(kw)).length;
        return bScore - aScore;
      });

      matches = matches.slice(0, 5);
    }

    // Also search documents table for broader matches
    let docMatches: Array<{ id: string; title: string; content: string | null; type: string | null }> = [];
    if (keywords.length > 0) {
      for (const kw of keywords.slice(0, 3)) {
        const rows = db
          .select({
            id: documents.id,
            title: documents.title,
            content: documents.content,
            type: documents.type,
          })
          .from(documents)
          .where(like(documents.title, `%${kw}%`))
          .limit(5)
          .all();
        docMatches.push(...rows);
      }
      const seenDocs = new Set<string>();
      docMatches = docMatches.filter(d => {
        if (seenDocs.has(d.id)) return false;
        seenDocs.add(d.id);
        return true;
      });
      docMatches = docMatches.slice(0, 3);
    }

    // Check if this is an email generation request
    const emailKeywords = ['email', 'draft', 'compose', 'write to', 'follow up', 'follow-up', 'message to'];
    const isEmailRequest = generateEmail || emailKeywords.some(ek => q.toLowerCase().includes(ek));

    if (matches.length === 0 && docMatches.length === 0) {
      res.json({
        answer: 'No knowledge entries found matching your question. Upload documents to build your knowledge base, or try rephrasing your question.',
        question: q,
        sources: [],
        isEmail: false,
      });
      return;
    }

    // Build answer from matched entries
    let answer = '';

    if (isEmailRequest) {
      // Generate a draft email from context
      const contextSnippets = matches.map(m => m.content).join('\n\n');
      const docSnippets = docMatches.map(d => `${d.title}: ${(d.content || '').slice(0, 200)}`).join('\n');
      answer = `Here's a draft based on your knowledge base:\n\n---\n\nHi,\n\nFollowing up on our recent discussion. Based on our records:\n\n${contextSnippets.slice(0, 500)}\n\nPlease let me know if you have any questions.\n\nBest regards`;
    } else {
      // Build informational answer
      const parts: string[] = [];
      if (matches.length > 0) {
        parts.push('Here\'s what I found in the knowledge base:\n');
        matches.forEach((m, i) => {
          const snippet = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content;
          parts.push(`**[${i + 1}]** (${m.sourceType}): ${snippet}`);
        });
      }
      if (docMatches.length > 0) {
        parts.push('\n**Related documents:**');
        docMatches.forEach(d => {
          parts.push(`- ${d.title} (${d.type || 'general'})`);
        });
      }
      answer = parts.join('\n');
    }

    // Record the Q&A interaction
    try {
      db.insert(qaInteractions).values({
        question: q,
        answer,
        confidence: matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low',
        sourceEntryIds: matches.map(m => m.id),
        askedVia: 'web',
      }).run();
    } catch { /* non-critical */ }

    res.json({
      answer,
      question: q,
      sources: matches.map(m => ({ id: m.id, sourceType: m.sourceType })),
      isEmail: isEmailRequest,
    });
  } catch (err) {
    console.error('[knowledge] POST /ask error:', err);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

export default router;
