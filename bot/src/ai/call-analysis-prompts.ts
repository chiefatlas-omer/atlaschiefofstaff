export const CALL_ANALYSIS_PROMPT = `You are a sales intelligence analyst. Analyze this sales call transcript and extract structured intelligence.

Extract the following and return ONLY valid JSON (no markdown, no code fences):

{
  "businessName": "Company name if mentioned, or null",
  "businessType": "Type of business (e.g. HVAC, plumbing, landscaping, retail, etc.), or null",
  "businessStage": "startup | growth | established | enterprise | unknown",
  "estimatedRevenue": "Revenue estimate if mentioned (e.g. '$500k/year'), or null",
  "employeeCount": "Employee count if mentioned (e.g. '5-10'), or null",

  "objections": ["List of objections the prospect raised, as concise strings"],
  "pains": ["List of pain points or problems the prospect described"],
  "desires": ["List of outcomes, goals, or desires the prospect expressed"],
  "awarenessLevel": "unaware | problem_aware | solution_aware | product_aware | most_aware",

  "talkListenRatio": "Estimated percentage of time the REP was talking (0-100 integer), or null",
  "questionCount": "Total number of questions asked by the rep (integer), or null",
  "openQuestionCount": "Number of open-ended questions asked by the rep (integer), or null",
  "nextSteps": ["List of agreed next steps from the call"],
  "outcome": "closed_won | closed_lost | follow_up | demo_scheduled | no_show | disqualified | unknown",
  "riskFlags": ["List of risk flags, e.g. 'prospect mentioned competitor', 'no decision timeline', 'price objection unresolved'"],

  "summary": "2-3 sentence summary of the call",

  "productSignals": [
    {
      "type": "feature_request | bug_report | churn_reason | competitor_mention | pricing_feedback | integration_request | other",
      "description": "Clear description of the signal",
      "category": "billing | onboarding | product | support | integrations | pricing | other",
      "severity": "critical | high | medium | low",
      "verbatimQuote": "Direct quote from transcript if available, or null"
    }
  ]
}

Rules:
- awarenessLevel: unaware = doesn't know they have a problem, problem_aware = knows the problem, solution_aware = knows solutions exist, product_aware = knows about our product, most_aware = ready to buy
- talkListenRatio: estimate based on relative speaking time; good range is 30-50% for the rep
- If you cannot determine a value, use null for strings or empty arrays for lists
- Do NOT invent information not in the transcript
- productSignals should only include items explicitly mentioned in the transcript

Transcript:
{{TRANSCRIPT}}`;

export const COACHING_SUMMARY_PROMPT = `You are a sales coach analyzing a rep's performance data from the past week.

Given the following call data for {{REP_NAME}}, identify coaching opportunities and generate actionable flags.

Call Data:
{{CALL_DATA}}

Return ONLY valid JSON (no markdown, no code fences):

{
  "coachingFlags": [
    {
      "flag": "Short label for the issue (e.g. 'High Talk Ratio', 'Too Few Questions')",
      "severity": "critical | high | medium | low",
      "observation": "What the data shows",
      "suggestion": "Specific, actionable advice to improve"
    }
  ],
  "strengths": ["List of things the rep is doing well"],
  "focusArea": "The single most important area to improve this week"
}

Coaching criteria:
- Talk ratio above 60%: flag as high risk (rep is talking too much)
- Talk ratio below 20%: flag as low risk (rep may not be engaging enough)
- Fewer than 3 questions per call on average: flag as needing improvement
- Open question ratio below 40%: flag as over-relying on closed questions
- Multiple calls with 'closed_lost' or 'disqualified': analyze for patterns in objections
- Recurring objections across calls: note as pattern to address
- No next steps on multiple calls: flag as pipeline risk

Return only the JSON, no other text.`;
