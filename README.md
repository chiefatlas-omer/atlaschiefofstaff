# Atlas Chief of Staff

Atlas Chief of Staff is the internal AI ops layer extracted from Atlas Growth.

## Included
- `bot/`: Slack + Zoom chief-of-staff bot
- `desktop/`: voice-driven desktop copilot and meeting assistant
- `docs/superpowers/`: product design and implementation docs

## How it fits together
- The Slack bot owns task capture, reminders, escalations, and Zoom processing.
- The desktop app reads and writes the same SQLite task database for voice task access, meeting briefs, and follow-up drafting.
- Both apps are designed to work against the same `chiefofstaff.db` file.

## Setup
1. In `bot/`, copy `.env.example` to `.env` and fill in the Slack, Anthropic, and Zoom secrets.
2. In `desktop/`, copy `.env.example` to `.env` and fill in the OpenAI, Anthropic, Slack user, and optional Google OAuth values.
3. Run `npm install` in `bot/` and `desktop/`.
4. Run `npm run db:migrate` in `bot/`.
5. Start the bot with `npm run dev` in `bot/`.
6. Start the desktop app with `npm run dev` in `desktop/`.

## Notes
- `bot/data/` is intentionally empty in version control. The SQLite database is created locally.
- The desktop app expects the bot database path by default at `../bot/data/chiefofstaff.db`.
