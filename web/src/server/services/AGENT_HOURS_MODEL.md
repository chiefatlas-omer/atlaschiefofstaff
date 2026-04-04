# Agent Hours Model

## How AI Hours Work

Every task an AI employee runs consumes "agent hours" from their allocated budget.
The number of hours consumed depends on the **task priority** and **model selection**.

## Token Limits by Priority

| Priority | Max Tokens | Hours Weight | Rationale |
|----------|-----------|--------------|-----------|
| Low      | 4,096     | 0.25 hr      | Quick, routine tasks (status checks, simple lookups) |
| Medium   | 8,192     | 0.5 hr       | Standard tasks (draft emails, score leads, reconcile transactions) |
| High     | 12,288    | 1.0 hr       | Thorough work (blog posts, detailed reports, research briefs) |
| Urgent   | 16,384    | 2.0 hr       | Maximum depth (comprehensive analysis, multi-part deliverables) |

## Model Multipliers

| Model  | Multiplier | Use Case |
|--------|-----------|----------|
| Sonnet | 1.0x      | Default — fast, efficient, great for routine work |
| Opus   | 3.0x      | Premium — maximum quality for complex, high-stakes deliverables |

## Hours Calculation

```
hours_consumed = priority_weight × model_multiplier
```

### Examples
- Medium priority + Sonnet = 0.5 × 1.0 = **0.5 hours**
- High priority + Opus = 1.0 × 3.0 = **3.0 hours**
- Urgent priority + Sonnet = 2.0 × 1.0 = **2.0 hours**
- Low priority + Opus = 0.25 × 3.0 = **0.75 hours**

## Budget Enforcement (TODO)

When implemented, the system should:
1. Check `hoursUsed + estimated_hours <= hoursAllocated` before running a task
2. If over budget, return a 402-style error: "This employee has used all their allocated hours"
3. Show a warning in the UI when an employee is at 80%+ utilization
4. Allow the owner to increase hours from the Payroll tab

## Tracking

Hours are tracked on the `ai_employees` table:
- `hours_used` — cumulative hours consumed
- `hours_allocated` — monthly budget set by the owner

The `ai_tasks` table tracks per-task consumption:
- `tokens_used` — actual tokens consumed (for auditing)
- `duration_ms` — wall-clock execution time

## Pricing Notes (for future billing)

- Token costs vary by model (Opus ~5x more expensive than Sonnet per token)
- The hours abstraction shields users from token math — they just see "hours"
- Priority determines the ceiling, not the actual consumption — a "high" task that finishes in 2K tokens still costs 1.0 hours (this incentivizes proper priority selection)
- Consider offering a "pay as you go" mode where hours are metered by actual usage vs. the fixed-weight model above
