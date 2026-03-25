import {
  findOrCreatePerson,
  findOrCreateCompany,
  createDecision,
  createDocument,
  createMeeting,
  findMeetingByZoomId,
  linkEntities,
} from './graph-service';
import { ingestText } from './embedding-service';
import { extractEntities, ExtractedEntities } from '../ai/entity-extractor';

// --- Zoom Transcript Ingestion ---

export interface IngestZoomTranscriptInput {
  transcriptText: string;
  zoomMeetingId: string;
  title?: string;
  date?: number;
  duration?: number;
  meetingType?: string;
  participants?: Array<{ name: string; slackUserId?: string }>;
}

export interface IngestZoomTranscriptResult {
  meetingId: string;
  entities: ExtractedEntities;
  chunkCount: number;
}

export async function ingestZoomTranscript(
  input: IngestZoomTranscriptInput,
): Promise<IngestZoomTranscriptResult> {
  console.log(`[ingestion] Processing Zoom transcript: ${input.zoomMeetingId}`);

  // Create or find meeting entity
  let meeting = findMeetingByZoomId(input.zoomMeetingId);
  if (!meeting) {
    meeting = createMeeting({
      title: input.title ?? `Meeting ${input.zoomMeetingId}`,
      date: input.date,
      duration: input.duration,
      source: 'zoom',
      zoomMeetingId: input.zoomMeetingId,
      transcriptText: input.transcriptText,
      meetingType: input.meetingType,
    });
    console.log(`[ingestion] Created meeting: ${meeting.id}`);
  } else {
    console.log(`[ingestion] Found existing meeting: ${meeting.id}`);
  }

  // Create/link explicit participants
  if (input.participants) {
    for (const participant of input.participants) {
      try {
        const person = findOrCreatePerson({
          name: participant.name,
          slackUserId: participant.slackUserId,
          source: 'zoom',
        });
        linkEntities('meeting', meeting.id, 'person', person.id, 'attendee');
        console.log(`[ingestion] Linked attendee: ${person.name}`);
      } catch (err) {
        console.error(`[ingestion] Error linking participant ${participant.name}:`, err);
      }
    }
  }

  // Extract entities from transcript
  let entities: ExtractedEntities = {
    people: [],
    companies: [],
    decisions: [],
    topics: [],
    followups: [],
  };

  try {
    entities = await extractEntities(input.transcriptText);
    console.log(
      `[ingestion] Extracted entities: ${entities.people.length} people, ${entities.companies.length} companies, ${entities.decisions.length} decisions`,
    );
  } catch (err) {
    console.error('[ingestion] Error extracting entities from transcript:', err);
  }

  // Create people from extraction as 'mentioned_in'
  for (const person of entities.people) {
    try {
      const p = findOrCreatePerson({ name: person.name, role: person.role, source: 'zoom' });
      linkEntities('meeting', meeting.id, 'person', p.id, 'mentioned_in');
    } catch (err) {
      console.error(`[ingestion] Error creating person ${person.name}:`, err);
    }
  }

  // Create companies as 'discussed_in'
  for (const company of entities.companies) {
    try {
      const c = findOrCreateCompany({ name: company.name, industry: company.industry });
      linkEntities('meeting', meeting.id, 'company', c.id, 'discussed_in');
    } catch (err) {
      console.error(`[ingestion] Error creating company ${company.name}:`, err);
    }
  }

  // Create decisions linked to meeting as 'produced'
  for (const decision of entities.decisions) {
    try {
      const d = createDecision({
        what: decision.what,
        context: decision.context,
        decidedBy: decision.decided_by,
        meetingId: meeting.id,
        sourceType: 'meeting',
        sourceRef: meeting.id,
      });
      linkEntities('meeting', meeting.id, 'decision', d.id, 'produced');
    } catch (err) {
      console.error(`[ingestion] Error creating decision:`, err);
    }
  }

  // Embed transcript chunks
  let chunkCount = 0;
  try {
    chunkCount = await ingestText({
      sourceType: 'zoom_transcript',
      sourceId: meeting.id,
      text: input.transcriptText,
      metadata: { zoomMeetingId: input.zoomMeetingId, title: input.title },
    });
    console.log(`[ingestion] Embedded ${chunkCount} chunks for meeting ${meeting.id}`);
  } catch (err) {
    console.error('[ingestion] Error embedding transcript:', err);
  }

  return { meetingId: meeting.id, entities, chunkCount };
}

// --- Slack Message Ingestion ---

export interface IngestSlackMessageInput {
  text: string;
  userId: string;
  userName?: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

export interface IngestSlackMessageResult {
  personId: string;
  entities: ExtractedEntities;
}

export async function ingestSlackMessage(
  input: IngestSlackMessageInput,
): Promise<IngestSlackMessageResult> {
  const emptyEntities: ExtractedEntities = {
    people: [],
    companies: [],
    decisions: [],
    topics: [],
    followups: [],
  };

  // Skip short messages
  if (input.text.length < 50) {
    console.log(`[ingestion] Skipping short Slack message (${input.text.length} chars)`);
    return { personId: '', entities: emptyEntities };
  }

  console.log(`[ingestion] Processing Slack message from ${input.userId}`);

  // Find or create person for sender
  const person = findOrCreatePerson({
    name: input.userName ?? input.userId,
    slackUserId: input.userId,
    source: 'slack',
  });

  let entities = emptyEntities;

  // Extract entities only for longer messages
  if (input.text.length >= 100) {
    try {
      entities = await extractEntities(input.text);
      console.log(`[ingestion] Extracted entities from Slack message`);
    } catch (err) {
      console.error('[ingestion] Error extracting entities from Slack message:', err);
    }

    // Link companies
    for (const company of entities.companies) {
      try {
        const c = findOrCreateCompany({ name: company.name, industry: company.industry });
        linkEntities('person', person.id, 'company', c.id, 'mentioned');
      } catch (err) {
        console.error(`[ingestion] Error linking company ${company.name}:`, err);
      }
    }

    // Create decisions linked to person as 'made'
    for (const decision of entities.decisions) {
      try {
        const d = createDecision({
          what: decision.what,
          context: decision.context,
          decidedBy: person.id,
          sourceType: 'slack',
          sourceRef: input.messageTs,
        });
        linkEntities('person', person.id, 'decision', d.id, 'made');
      } catch (err) {
        console.error('[ingestion] Error creating decision from Slack message:', err);
      }
    }
  }

  // Embed the message
  try {
    await ingestText({
      sourceType: 'slack',
      sourceId: input.messageTs,
      text: input.text,
      metadata: {
        userId: input.userId,
        channelId: input.channelId,
        threadTs: input.threadTs,
      },
    });
  } catch (err) {
    console.error('[ingestion] Error embedding Slack message:', err);
  }

  return { personId: person.id, entities };
}

// --- Document Ingestion ---

export interface IngestDocumentInput {
  title: string;
  content: string;
  type: string;
  uploadedBy?: string;
}

export interface IngestDocumentResult {
  docId: string;
  entities: ExtractedEntities;
  chunkCount: number;
}

export async function ingestDocument(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  console.log(`[ingestion] Processing document: ${input.title}`);

  const doc = createDocument({
    title: input.title,
    type: input.type,
    content: input.content,
    createdBy: input.uploadedBy,
  });

  let entities: ExtractedEntities = {
    people: [],
    companies: [],
    decisions: [],
    topics: [],
    followups: [],
  };

  try {
    entities = await extractEntities(input.content);
    console.log(`[ingestion] Extracted entities from document`);
  } catch (err) {
    console.error('[ingestion] Error extracting entities from document:', err);
  }

  // Link companies as 'applies_to'
  for (const company of entities.companies) {
    try {
      const c = findOrCreateCompany({ name: company.name, industry: company.industry });
      linkEntities('document', doc.id, 'company', c.id, 'applies_to');
    } catch (err) {
      console.error(`[ingestion] Error linking company ${company.name} to document:`, err);
    }
  }

  // Embed document
  let chunkCount = 0;
  try {
    chunkCount = await ingestText({
      sourceType: 'document',
      sourceId: doc.id,
      text: input.content,
      metadata: { title: input.title, type: input.type },
    });
    console.log(`[ingestion] Embedded ${chunkCount} chunks for document ${doc.id}`);
  } catch (err) {
    console.error('[ingestion] Error embedding document:', err);
  }

  return { docId: doc.id, entities, chunkCount };
}

// --- Voice Interaction Ingestion ---

export interface IngestVoiceInteractionInput {
  transcript: string;
  response: string;
  intent: string;
  userId?: string;
}

export async function ingestVoiceInteraction(
  input: IngestVoiceInteractionInput,
): Promise<void> {
  console.log(`[ingestion] Processing voice interaction: ${input.intent}`);

  const combined = `Voice command: ${input.transcript}\nResponse: ${input.response}`;

  try {
    await ingestText({
      sourceType: 'voice',
      sourceId: input.userId,
      text: combined,
      metadata: { intent: input.intent, userId: input.userId },
    });
  } catch (err) {
    console.error('[ingestion] Error embedding voice interaction:', err);
  }
}
