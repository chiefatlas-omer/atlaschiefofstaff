import { anthropic } from '../ai/client';
import { CLASSIFY_COMMUNICATION_STYLE, DRAFT_FOLLOWUP_EMAIL } from '../ai/email-prompts';

export interface FollowUpDraft {
  recipientName: string;
  recipientCompany: string;
  archetype: string;
  emailBody: string;
  meetingTitle: string;
  callAnalysisId: number;
}

/**
 * Classify whether a meeting is external and profile participants.
 */
export async function classifyMeeting(transcript: string, meetingTitle?: string): Promise<{
  isExternal: boolean;
  meetingType: string;
  participants: Array<{
    name: string;
    company: string;
    archetype: string;
    their_keywords: string[];
    their_pain: string;
    warmth_level: string;
    detail_preference: string;
  }>;
  nextSteps: string[];
  keyTopics: string[];
} | null> {
  try {
    const truncated = transcript.length > 20000 ? transcript.substring(0, 20000) + '\n[...truncated]' : transcript;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: CLASSIFY_COMMUNICATION_STYLE,
      messages: [{ role: 'user', content: `Meeting title: ${meetingTitle || 'Unknown'}\n\nTranscript:\n${truncated}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return {
      isExternal: parsed.is_external_meeting || false,
      meetingType: parsed.meeting_type || 'other',
      participants: parsed.external_participants || [],
      nextSteps: parsed.agreed_next_steps || [],
      keyTopics: parsed.key_topics_discussed || [],
    };
  } catch (err) {
    console.error('[followup] Classification failed:', err);
    return null;
  }
}

/**
 * Draft a follow-up email for each external participant.
 */
export async function draftFollowUpEmail(input: {
  recipientName: string;
  recipientCompany: string;
  archetype: string;
  their_keywords: string[];
  their_pain: string;
  warmth_level: string;
  detail_preference: string;
  nextSteps: string[];
  keyTopics: string[];
  meetingTitle: string;
  transcript: string;
}): Promise<string | null> {
  try {
    const truncated = input.transcript.length > 15000 ? input.transcript.substring(0, 15000) + '\n[...truncated]' : input.transcript;

    const context = `Recipient: ${input.recipientName} (${input.recipientCompany})
Archetype: ${input.archetype}
Their keywords: ${input.their_keywords.join(', ')}
Their main pain: ${input.their_pain}
Warmth level: ${input.warmth_level}
Detail preference: ${input.detail_preference}
Agreed next steps: ${input.nextSteps.join('; ')}
Key topics: ${input.keyTopics.join(', ')}
Meeting: ${input.meetingTitle}

Transcript excerpt:
${truncated}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: DRAFT_FOLLOWUP_EMAIL,
      messages: [{ role: 'user', content: context }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return text.trim() || null;
  } catch (err) {
    console.error('[followup] Email draft failed:', err);
    return null;
  }
}

/**
 * Full pipeline: classify meeting → draft emails for each external participant.
 * Returns array of drafts (empty if internal meeting).
 */
export async function generateFollowUpDrafts(input: {
  transcript: string;
  meetingTitle?: string;
  callAnalysisId?: number;
}): Promise<FollowUpDraft[]> {
  const classification = await classifyMeeting(input.transcript, input.meetingTitle);
  if (!classification || !classification.isExternal) {
    console.log('[followup] Internal meeting or classification failed — skipping');
    return [];
  }

  if (classification.participants.length === 0) {
    console.log('[followup] No external participants detected — skipping');
    return [];
  }

  console.log(`[followup] External meeting detected: ${classification.meetingType}, ${classification.participants.length} external participants`);

  const drafts: FollowUpDraft[] = [];
  for (const participant of classification.participants) {
    const emailBody = await draftFollowUpEmail({
      recipientName: participant.name,
      recipientCompany: participant.company,
      archetype: participant.archetype,
      their_keywords: participant.their_keywords,
      their_pain: participant.their_pain,
      warmth_level: participant.warmth_level,
      detail_preference: participant.detail_preference,
      nextSteps: classification.nextSteps,
      keyTopics: classification.keyTopics,
      meetingTitle: input.meetingTitle || 'Meeting',
      transcript: input.transcript,
    });

    if (emailBody) {
      drafts.push({
        recipientName: participant.name,
        recipientCompany: participant.company,
        archetype: participant.archetype,
        emailBody,
        meetingTitle: input.meetingTitle || 'Meeting',
        callAnalysisId: input.callAnalysisId || 0,
      });
      console.log(`[followup] Draft generated for ${participant.name} (${participant.archetype})`);
    }
  }

  return drafts;
}
