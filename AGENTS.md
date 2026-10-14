# Repository instructions

Anchor is a standalone Dutch personal diary/PWA. Do not import or modify the adjacent Substance Recovery project.

- Node 24 and pnpm 11.9.0. Use the lockfile; no runtime external services.
- App and repository name: Anchor. Default state is empty; never seed real users with demo records.
- Craving registration contains date/time (weekday derived), optional substances or behaviors, situation (who/what/where), thought, physical sensation, emotion, and behavior. Preserve legacy `substance` and optional `substances` arrays without inferring names from goals; never write both fields. Keep craving save actions after the last question in normal document flow. No intensity/risk/usage/attempt fields in that form. After a craving is saved, a separate explicit action may set `usedAfterCraving: true`; absence means unknown, never no use. Only the separate removal action clears that marker. Normal form saves must preserve the current saved marker over stale draft metadata; never infer use or which substances were used from narrative text or selected substances.
- Keep check-ins, daily summaries, cravings and positive memories independent; missing is not zero. Do not infer clinical outcomes.
- Explicit use confirmation may also save `usedConfirmedAt` as a canonical UTC timestamp, only alongside `usedAfterCraving: true`. Preserve missing historical timestamps; never backfill them. Display confirmation time and elapsed time from the recorded craving without claiming this is the actual use time. Normal craving saves preserve both current metadata fields over stale drafts; removing the marker clears both.
- Data keys: `anchor.app.data.v1` and `anchor.app.drafts.v1`. Never enumerate or clear unrelated storage. All saved data passes validation and revision checks; obtain the app writer lock before writing.
- Preserve records and drafts across updates. No forced worker activation with open drafts; no destructive schema reset. Validate backups before any replacement and require confirmation.
- Keep text inputs readable, themes accessible, keyboard focus visible, narrow layouts usable, and reduced-motion respected.
- All form save actions stay after the last question in normal document flow, including check-ins, follow-ups and daily summaries; no sticky save overlays. History search/filter controls open from the magnifier and apply only on explicit submission.
- Before a release: typecheck, unit tests, browser tests, dependency audit, production PWA build, real offline/update verification, source preservation checks when working beside the old app.
- Stage explicit files. Creating this repository does not authorize deployment; publish the website only when requested.
