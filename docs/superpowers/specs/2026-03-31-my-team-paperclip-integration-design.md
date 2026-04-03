# My Team — Paperclip Integration Design

**Date:** 2026-03-31
**Status:** Draft
**Author:** Brainstorming session with Omer

---

## Problem

Atlas Chief of Staff is a powerful dashboard — briefings, task tracking, call intelligence, outcomes. But it's passive. The user still does the work; the product just organizes it.

Local business owners don't want another dashboard. They want help. They want to hire someone to handle social media, follow up with leads, manage bookkeeping — but they can't afford full-time staff for every role.

## Vision

Turn the AI Chief of Staff from a dashboard into an actual AI executive. It manages a team of AI employees that work for your business 24/7. You set goals, it hires, delegates, and manages. Your org chart, your team, your rules.

**No tech jargon.** No "agents," "adapters," or "heartbeats." AI employees are team members with roles, schedules, skills, and work hours — just like real staff.

## Integration Approach

**Hybrid: Paperclip backend, custom frontend.**

- Paperclip runs as a sidecar service (its own Express server + embedded Postgres)
- Chief of Staff's web app provides the entire user-facing experience
- A bridge layer in the web server translates business-friendly concepts into Paperclip API calls
- Paperclip stays updatable — we fork it but keep the core intact to pull upstream updates

### Architecture

```
You (Browser)
    │
    ▼
Chief of Staff Web App (React + Tailwind)
  └── My Team page → calls Bridge API routes
    │
    ▼
Bridge Layer (in web/src/server/routes/team.ts)
  Translates: "Hire Social Media Manager" → POST /api/companies/{id}/agents
  Translates: "Show work hours" → GET /api/companies/{id}/costs → hours
  Translates: "Set routine" → heartbeat schedule config
    │
    ▼
Paperclip (sidecar service)
  Express + embedded Postgres
  Agent orchestration, heartbeats, cost tracking, task execution
```

### Three Services
1. **Bot** (existing) — Slack integration, cron jobs, task detection
2. **Web** (existing) — React UI + Express API
3. **Paperclip** (new) — Agent orchestration engine

---

## The AI Chief of Staff Concept

The product's namesake becomes real. An AI Chief of Staff sits at the top of the org chart (below the business owner) and:

- Translates business goals into hiring plans and task assignments
- Delegates work to AI employees based on their roles and capabilities
- Proposes new hires when it identifies gaps
- Writes detailed instructions for each employee using the business's context (brand guide, SOPs, examples)
- Reports back to the owner via the Briefing page

**Paperclip mapping:** The Chief of Staff is a Paperclip agent with `role: "ceo"`, configured with the business owner's context and instructions. Other AI employees are agents that report to it.

---

## Page: My Team

New top-level page in the sidebar navigation, alongside Briefing, Intelligence, Tasks, Outcomes, Settings.

### Tab Structure

| Tab | Purpose | Paperclip Mapping |
|---|---|---|
| **Org Chart** | Visual hierarchy of your AI team | Agents + reports_to + status |
| **Hire** | Role catalog + Industry Blueprints | Agent creation with pre-configured adapters |
| **Activity** | Work timeline + Approval Queue | Heartbeat runs + task comments + work products |
| **Schedule** | Employee routine calendars | Heartbeat schedules + routine configs |
| **Payroll** | Work hours, budgets, trends | Cost events + budgets converted to hours |

---

### Tab 1: Org Chart

**Layout:** Visual tree with the business owner at top, AI Chief of Staff below, departments and employees beneath.

**Node display:** Each node shows name, role, status indicator (Working / Idle / Training / Paused), hours used this month.

**Employee Profile Panel:** Click any node to slide open a detail panel:
- **Overview:** Role, department, hire date, trust level (Training / Autonomous)
- **Skills:** Installed capabilities (e.g., "Instagram Posting", "Email Campaigns")
- **Training Materials:** Uploaded documents (brand guide, SOPs, examples) that inform this employee's work
- **Standing Instructions:** What this employee does every check-in — the translated "heartbeat" checklist
- **Performance:** Approval rate, deliverables completed, hours worked

**Import Blueprint:** Button to import an industry blueprint — selects an industry, imports entire team structure including Chief of Staff + employees.

**Paperclip data:**
- Agent list: `GET /api/companies/{id}/agents`
- Agent hierarchy: `reports_to` field on each agent
- Agent status: `status` field (idle/running/paused/error → Working/Idle/Training/Paused)
- Org chart rendering: Adapt Paperclip's existing SVG org chart code

---

### Tab 2: Hire

**Section 1 — Industry Blueprints** (top of page)
Horizontal scrollable cards for industry templates:
- Dental Office, Real Estate Agency, Roofing Company, Restaurant, Marketing Agency, E-commerce Store, Service Business
- Each card shows: industry icon, name, team size ("5 employees"), key roles preview
- One-click "Deploy" imports the full Paperclip company config (Chief of Staff + all agents with pre-configured adapters, instructions, and routines)

**Section 2 — Role Catalog** (below blueprints)
Grid of role cards organized by department:

**Sales & Marketing:**
- Social Media Manager — content creation, scheduling, analytics (~20 hrs/mo)
- Email Marketer — campaigns, drip sequences, A/B testing (~15 hrs/mo)
- Lead Qualifier — lead scoring, prospect research, routing (~25 hrs/mo)
- Content Writer — blog posts, copy, brand voice content (~20 hrs/mo)
- Follow-Up Specialist — post-meeting/call follow-ups, nurture sequences (~15 hrs/mo)

**Operations:**
- Bookkeeper — expense categorization, reconciliation, financial summaries (~10 hrs/mo)
- Appointment Scheduler — calendar management, booking, reminders (~15 hrs/mo)
- Inventory Tracker — stock levels, reorder alerts, supplier communication (~10 hrs/mo)

**Customer Service:**
- Customer Service Rep — inquiry responses, FAQ handling, ticket routing (~30 hrs/mo)
- Review Manager — review monitoring, response drafting, sentiment tracking (~10 hrs/mo)
- Client Follow-Up — post-service check-ins, satisfaction surveys (~10 hrs/mo)

**Each role card shows:** Icon, role name, department label, description, skill tags, estimated monthly hours, "Hire" button.

**"Create Custom Role"** card with dashed border → opens a wizard:
1. Name the role
2. Describe what they should do (plain language)
3. Set monthly work hours
4. Chief of Staff auto-configures the Paperclip agent (adapter, instructions, tools)

**Paperclip mapping:**
- Role catalog = JSON config mapping role names to Paperclip adapter configs (adapter_type, adapter_config, capabilities, budget)
- Industry blueprints = JSON bundles that call Paperclip's company import API or batch-create agents
- Hire action = `POST /api/companies/{id}/agents` with pre-configured payload
- Custom role = Chief of Staff agent generates adapter config from user's description

---

### Tab 3: Activity

**Section 1 — Approval Queue** (top, shown when employees are in Training mode)
- Cards for pending deliverables that need review
- Each shows: employee name, what they did, preview of output, timestamp
- Actions: **Approve** / **Request Changes** (with feedback text box)
- Promotion prompt after N approvals: "Your Social Media Manager has had 15 deliverables approved with no changes. Promote to Autonomous?"

**Section 2 — Activity Feed** (below)
- Reverse chronological timeline of all employee work
- Each entry: employee avatar + name, action description, timestamp, link to output
- Expandable entries to preview deliverable inline
- Filters: by employee, by department, by date range

**Paperclip mapping:**
- Approval queue = issues with `status: in_review` assigned to agents in "training" trust level
- Activity feed = `GET /api/companies/{id}/activity` + heartbeat_runs + issue comments
- Approve = `PATCH /api/companies/{id}/issues/{id}` status → done
- Request changes = add comment + status → blocked

---

### Tab 4: Schedule

**Layout:** Weekly calendar view per employee, or "All Employees" view.

**Routine display:** Time blocks showing recurring work:
- "Mon-Fri 9:00 AM — Check and respond to social mentions"
- "Daily 2:00 PM — Create and schedule social content"
- "Friday 4:00 PM — Generate weekly analytics report"

**Actions:**
- Click routine to edit timing, frequency, or instructions
- "Add Routine" button to create new recurring work
- Toggle routines on/off
- Chief of Staff can suggest routines based on the industry blueprint

**Paperclip mapping:**
- Routines = heartbeat schedules + recurring issue templates
- Schedule config = agent heartbeat interval + task template definitions
- Toggle = pause/resume heartbeat for specific routine

---

### Tab 5: Payroll

**Team Summary (top):**
- Total hours used / total allocated across all employees
- Number of active employees
- Monthly trend line (hours over past 3 months)

**Per-Employee Table:**
| Employee | Role | Hours Used | Hours Allocated | Usage | Status |
|---|---|---|---|---|---|
| Social Media Mgr | Sales & Marketing | 12 | 20 | [████████░░] 60% | Working |
| Bookkeeper | Operations | 3 | 10 | [███░░░░░░░] 30% | Idle |

**Actions per employee:** Adjust hours allocation, Pause / Resume toggle

**Paperclip mapping:**
- Hours = `GET /api/companies/{id}/costs` → convert cents to hours using configurable rate
- Budget = `budget_monthly_cents` on agent → converted to hours
- Adjust = `PATCH /api/companies/{id}/agents/{id}` update budget
- Pause/Resume = agent status toggle

---

## Trust & Training System

**Training mode (default for new hires):**
- Every deliverable goes to the Approval Queue
- Owner reviews and approves/rejects each piece of work
- Feedback on rejections updates the employee's standing instructions

**Autonomous mode (earned):**
- After a configurable number of clean approvals (default: 15), system suggests promotion
- Owner can promote manually at any time
- Autonomous employees execute and report; no approval gate
- Owner can demote back to Training if quality drops

**Paperclip mapping:**
- Trust level = custom metadata on agent
- Training mode = issues auto-set to `in_review` status before completion
- Autonomous mode = issues go directly to `done`
- Approval gate = bridge layer logic that intercepts task completion

---

## Vocabulary Translation

| Paperclip Term | Chief of Staff Term |
|---|---|
| Agent | Team Member / Employee |
| Company | Your Business / Organization |
| Heartbeat | Check-in / Shift |
| Heartbeat schedule | Work Schedule / Routine |
| Issue / Task | Assignment / To-Do |
| Budget (cents) | Work Hours / Monthly Plan |
| Adapter type | Hidden (internal config) |
| Adapter config | Hidden (internal config) |
| Goal | Business Goal / Objective |
| Work Product | Deliverable / Output |
| Approval (board) | Review / Sign-off |
| Skills | Skills / Capabilities |
| Import Company | Industry Blueprint |
| CEO Agent | AI Chief of Staff |
| reports_to | Reports To / Department |

---

## Key Files to Create/Modify

### New Files
- `web/src/client/pages/Team.tsx` — My Team page with 5 tabs
- `web/src/client/components/team/OrgChart.tsx` — Org chart visualization
- `web/src/client/components/team/HireTab.tsx` — Role catalog + blueprints
- `web/src/client/components/team/ActivityTab.tsx` — Activity feed + approval queue
- `web/src/client/components/team/ScheduleTab.tsx` — Routine calendar
- `web/src/client/components/team/PayrollTab.tsx` — Hours/budget dashboard
- `web/src/client/components/team/EmployeeProfile.tsx` — Slide-out profile panel
- `web/src/client/components/team/RoleCard.tsx` — Reusable role card component
- `web/src/client/components/team/BlueprintCard.tsx` — Industry blueprint card
- `web/src/server/routes/team.ts` — Bridge API routes
- `web/src/server/services/paperclip-bridge.ts` — Translation layer
- `web/src/client/lib/team-api.ts` — Frontend API client for team routes
- `config/roles.json` — Role catalog definitions
- `config/blueprints/` — Industry blueprint JSON bundles

### Modified Files
- `web/src/client/App.tsx` — Add `/team` route
- `web/src/client/components/Layout.tsx` — Add "My Team" to sidebar navigation
- `web/src/client/lib/api.ts` — Add team-related TypeScript interfaces
- `package.json` (root) — Add Paperclip as dependency/submodule reference

---

## Verification Plan

1. **Paperclip sidecar runs:** Start Paperclip alongside existing services, confirm health endpoint responds
2. **Bridge API works:** Hit bridge routes, verify they translate to correct Paperclip API calls
3. **Hire flow:** Click "Hire" on a role card → agent appears in Paperclip → shows on Org Chart
4. **Org chart renders:** Tree displays correctly with owner → Chief of Staff → employees
5. **Activity feed populates:** After agent heartbeat runs, activity entries appear
6. **Approval queue:** Training-mode employee's deliverable appears for review
7. **Schedule view:** Routines display correctly, edits persist
8. **Payroll accuracy:** Hours display matches Paperclip cost data (with conversion)
9. **Blueprint import:** One-click imports full team, all agents appear on org chart
10. **Custom role:** Wizard creates a functional agent via Chief of Staff
