export const COMMITMENT_EXTRACTION_PROMPT = `You are analyzing Slack messages to detect commitments, promises, and action items.

A commitment is when someone says they WILL DO something specific with a CLEAR DELIVERABLE. Examples:
- "I'll send that proposal over by Friday"
- "Let me handle the onboarding doc"
- "I'll follow up with the client next week"
- "Will get back to you on that tomorrow"
- "I'll call those clients tomorrow"

Also detect DIRECTIVES — when someone assigns or requests another person to do something:
- "keep me posted on how those leads go" → commitment for the person being told to keep someone posted
- "@Mason follow up with those clients" → commitment for Mason
- "let's get this done by Friday" → commitment if directed at a specific person
- "@atlaschief create a task for Mason to send the report" → commitment for Mason

NOT commitments (do NOT flag these — be conservative):
- Observations: "That report was good"
- Opinions: "I think we should do X" (thinking is not committing)
- Vague: "Yeah we should look into that" (no specific action or person)
- Greetings, reactions, or casual chat: "thanks", "nice work", "sounds good", "awesome"
- Casual/exploratory: "play around with X", "check this out", "take a look", "interesting"
- General discussion or brainstorming without a specific deliverable
- Bot messages or automated notifications
- Praise or acknowledgments: "great job", "well done", "love it"
- Short affirmations: "ok", "got it", "sure", "will do" (unless followed by a specific action)

IMPORTANT: Only flag messages as tasks when there is a CLEAR, SPECIFIC deliverable or action. Vague intentions, casual remarks, and general discussion should NOT be flagged. When in doubt, do NOT create a task.

For each message, the "user" field is the Slack user ID of the person who wrote it.

THREAD CONTEXT RULES:
- If the message includes a "thread_parent_user" field, it means this message is a reply in a thread. The thread_parent_user is the Slack user ID of the person who wrote the parent message.
- If the sender is directing/instructing someone else to do something in a thread reply, the assignee should be the person being directed, NOT the sender.
- Context clues that the sender is giving a directive to the parent author: "please do X", "compile X and share", "send X", "follow up on X", "get X done", "handle X", "take care of X", "loop back on X".
- When the sender gives a directive in reply to someone else's message AND there is no explicit @mention of another user, assign the task to thread_parent_user (the person they're replying to).
- If the message has an explicit @mention of a different user, that @mention takes priority over thread_parent_user.

CRITICAL — Assignee extraction rules:
- If the message mentions another user with an @mention (Slack format: <@UXXXXXXXX>), that mentioned person is the ASSIGNEE, NOT the message sender. The person being @mentioned is the one who should do the task.
- Examples: "<@U0567DEF> follow up with the client" → who = "U0567DEF" (the mentioned user, not the sender)
- "remind <@U0567DEF> to send the report" → who = "U0567DEF"
- "<@U0567DEF> can you handle the onboarding?" → who = "U0567DEF"
- If the message is a thread reply with thread_parent_user and the sender is giving a directive (no @mention), assign to thread_parent_user.
- Only assign to the message sender (the "user" field) if NO other person is @mentioned AND this is NOT a directive in a thread reply.
- If multiple users are @mentioned, assign to the first non-bot @mention.
- Ignore @mentions of the bot itself (the bot is often the first mention in @mention messages).
- NEVER assign a task to the bot. The bot is a tool, not a team member. If the only @mention is the bot, look for a plain-text person name in the message instead.
- "remind [PersonName] to [task]" means assign to PersonName, NOT the sender and NOT the bot. If PersonName appears as an @mention (<@UXXXXXXXX>), use that ID. If it's plain text, return the plain text name as the "who" field — the system will resolve it.

For each commitment found, extract:
1. who: The Slack user ID of the person who owns the commitment (see assignee rules above)
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

An action item is ANY task, to-do, request, or commitment made during the meeting by an INTERNAL team member. Examples:
- "I'll send that over by Friday" → action item for the speaker (if internal)
- "Olivia, can you handle the follow-up?" → action item for Olivia (if internal)
- "Let me take care of that" → action item for the speaker (if internal)
- "I'll follow up with the client" → action item for the speaker (if internal)

When someone ASKS another person to do something (e.g., "Can you...", "Would you...", "Please..."), the owner is the person being ASKED, not the person asking.

CRITICAL: Only extract action items for INTERNAL team members (people listed in the participant mapping below). Do NOT extract tasks for external contacts, clients, prospects, or anyone not in your team. If an external person says "I'll send you the contract", that is NOT an action item — it's their responsibility, not your team's. If an internal person says "I need to follow up with them about the contract", that IS an action item for the internal person.

For each action item, extract:
- owner_name: The INTERNAL person responsible (must be someone from the participant mapping). Do NOT assign tasks to external people.
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
