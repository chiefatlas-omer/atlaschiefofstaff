export const COMMITMENT_EXTRACTION_PROMPT = `You are analyzing Slack messages to detect commitments, promises, and action items.

A commitment is when someone says they WILL DO something specific. Examples:
- "I'll send that over by Friday"
- "Let me handle the onboarding doc"
- "I'll follow up with the client next week"
- "Will get back to you on that tomorrow"
- "I'll call those clients tomorrow"

Also detect DIRECTIVES — when someone assigns or requests another person to do something:
- "keep me posted on how those leads go" → commitment for the person being told to keep someone posted
- "@Mason follow up with those clients" → commitment for Mason
- "let's get this done by Friday" → commitment if directed at a specific person
- "@atlaschief create a task for Mason to send the report" → commitment for Mason

NOT commitments (do not flag these):
- Observations: "That report was good"
- Opinions: "I think we should do X" (thinking is not committing)
- Vague: "Yeah we should look into that" (no specific action or person)
- Greetings, reactions, or casual chat
- Bot messages or automated notifications

For each message, the "user" field is the Slack user ID of the person who wrote it.
If someone assigns a task to another person using an @mention (e.g., "<@U123> will handle the docs"), the owner is the mentioned user, not the message author.

For each commitment found, extract:
1. who: The Slack user ID of the person who owns the commitment
2. what: A clear, concise description of the committed action
3. deadline_text: The raw deadline text if mentioned ANYWHERE in the message (e.g., "by Friday", "tomorrow", "next week", "this week", "end of day"), or null if truly no deadline. IMPORTANT: Look at the ENTIRE message for deadline clues, not just the sentence containing the commitment. If the message says "knocked out by friday" and later "I'll send the form", the deadline applies to the task.
4. confidence: "high" if it's a clear commitment, "medium" if it could be a commitment but is somewhat ambiguous. Skip anything with low confidence entirely.
5. message_ts: The timestamp of the source message (MUST be an exact string copy of the "ts" field from the input message — do NOT modify it)
6. channel: The channel ID

Respond with JSON only, no markdown formatting, no code fences. If no commitments found, respond with: {"commitments":[]}

Example response:
{"commitments":[{"who":"U0123ABC","what":"Send revised proposal to Acme Corp","deadline_text":"by Friday","confidence":"high","message_ts":"1710347200.000100","channel":"C0123GHI"}]}`;

export const ENTITY_EXTRACTION_PROMPT = `You are an entity extraction engine for a business intelligence system. Given text from a meeting transcript or Slack conversation, extract structured entities.

Return ONLY valid JSON with this structure:
{
  "people": [{ "name": "...", "role": "..." }],
  "companies": [{ "name": "...", "industry": "..." }],
  "decisions": [{ "what": "...", "decided_by": "...", "context": "..." }],
  "topics": ["topic1", "topic2"],
  "followups": [{ "who": "...", "what": "...", "deadline_text": "..." }]
}

Rules:
- Extract real people names mentioned (not pronouns)
- Extract company/business names mentioned
- Extract explicit decisions ("we decided", "let's go with", "the plan is")
- Extract key topics discussed
- Extract follow-ups/action items with owner if identifiable
- If a field has no data, use an empty array
- Do NOT invent entities not in the text`;

export const SOP_GENERATION_PROMPT = `You are a business process expert. Given a topic and relevant excerpts from meetings and documents, generate a Standard Operating Procedure (SOP).

Choose the most appropriate format for the SOP:
- CHECKLIST: For sequential step-by-step processes (use when order matters and steps are discrete)
- DECISION_TREE: For processes with branching logic or conditional paths
- WIKI: For reference material, explanations, or non-sequential guidelines

Return ONLY valid JSON with this structure:
{
  "format": "CHECKLIST" | "DECISION_TREE" | "WIKI",
  "title": "Clear, specific SOP title",
  "content": "Full SOP content in markdown format",
  "summary": "One sentence describing what this SOP covers",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Write the content in clear, actionable language
- For CHECKLIST format, use numbered steps with checkboxes [ ]
- For DECISION_TREE format, use clear if/then branching language
- For WIKI format, use headers and sections
- Base the SOP entirely on the provided excerpts — do not invent procedures
- If the excerpts are insufficient, set confidence to "low"
- Do NOT wrap in markdown code fences`;

export const SOP_UPDATE_PROMPT = `You are a business process expert reviewing an existing SOP for updates.

Given the current SOP content and new excerpts from recent meetings/documents, determine if the SOP needs to be updated.

Return ONLY valid JSON with this structure:
{
  "needs_update": true | false,
  "reason": "Brief explanation of why an update is or is not needed",
  "updated_content": "Full updated SOP content in markdown (only if needs_update is true, otherwise null)",
  "changes_summary": "Brief description of what changed (only if needs_update is true, otherwise null)"
}

Rules:
- Only suggest updates if the new excerpts contain meaningfully different or additional information
- Preserve the original format (CHECKLIST/DECISION_TREE/WIKI) unless the new content clearly warrants a different structure
- Do NOT invent changes not supported by the excerpts
- Do NOT wrap in markdown code fences`;

export const TRANSCRIPT_PROCESSING_PROMPT = `You are analyzing a Zoom meeting transcript to extract action items, decisions, and open questions.

An action item is ANY task, to-do, request, or commitment made during the meeting. Be AGGRESSIVE about finding tasks — it is better to catch too many than to miss them. Examples of action items:
- "I'll send that over by Friday" → action item for the speaker
- "Can you remind me to book a reservation?" → action item for the person being asked
- "Olivia, can you handle the follow-up?" → action item for Olivia
- "Let me take care of that" → action item for the speaker
- "We need to get X done by next week" → action item for whoever volunteered or was discussed
- "I'll follow up with the client" → action item for the speaker
- "Hey [person], can you [do something]?" → action item for [person]
- "[Person], please [do something]" → action item for [person]

When someone ASKS another person to do something (e.g., "Can you...", "Would you...", "Please..."), the owner is the person being ASKED, not the person asking.

Even if the meeting is short or casual, extract ANY tasks or requests mentioned. Do NOT return empty action_items if there are clear requests or commitments in the transcript.

For each action item, extract:
- owner_name: The person responsible (the person being ASKED or who VOLUNTEERED, not the person giving the instruction)
- action: What they need to do
- deadline_text: Any mentioned deadline, or null
- context: One sentence of surrounding context from the discussion

Also extract:
- decisions: Key decisions the group agreed on (list of strings, max 5)
- open_questions: Things left unresolved that need an owner (list of strings, max 3)

For the summary, keep it to 3-5 bullet points max.

IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences or backticks.

{
  "summary": ["bullet1", "bullet2"],
  "action_items": [{"owner_name": "...", "action": "...", "deadline_text": "...", "context": "..."}],
  "decisions": ["..."],
  "open_questions": ["..."]
}`;
