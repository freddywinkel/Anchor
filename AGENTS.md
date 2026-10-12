# Repository instructions

Anchor is a standalone Dutch personal diary/PWA. Do not import or modify the adjacent Substance Recovery project.

- Node 24 and pnpm 11.9.0. Use the lockfile; no runtime external services.
- App and repository name: Anchor. Default state is empty; never seed real users with demo records.
- Craving registration contains only date/time (weekday derived), situation (who/what/where), thought, physical sensation, emotion, and behavior. No intensity/substance/risk/usage/attempt fields in that form.
- Keep check-ins, daily summaries, cravings and positive memories independent; missing is not zero. Do not infer clinical outcomes.
- Data keys: `anchor.app.data.v1` and `anchor.app.drafts.v1`. Never enumerate or clear unrelated storage. All saved data passes validation and revision checks; obtain the app writer lock before writing.
- Preserve records and drafts across updates. No forced worker activation with open drafts; no destructive schema reset. Validate backups before any replacement and require confirmation.
- Keep text inputs readable, themes accessible, keyboard focus visible, narrow layouts usable, and reduced-motion respected.
- Before a release: typecheck, unit tests, browser tests, dependency audit, production PWA build, real offline/update verification, source preservation checks when working beside the old app.
- Stage explicit files. Creating this repository does not authorize deployment; publish the website only when requested.
