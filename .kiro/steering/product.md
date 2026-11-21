---
inclusion: always
---
# Product: Repo Necromancer

## One-liner
Resurrect abandoned GitHub repositories: diagnose why they died, bring the build back to green, and restore their "soul" as Kiro context (steering, specs, hooks) so development can continue in Kiro.

## Hackathon context
- Event: Kiroween 2026 (Devpost). Category: **Resurrection**. Deadline: 2026-12-04 14:00 PT.
- Judging (20% each): Potential Impact, Technological Implementation (depth of Kiro usage), Design, Innovation, Presentation.
- Demo video must be under 3 minutes. All user-facing text and docs in English.

## Users
1. Developers reviving their own old side projects.
2. Teams that inherited internal legacy repos after the author left.
3. Maintainers forced to fork a dependency that stopped being maintained.

## Core flow
1. **Graveyard** - enter a GitHub URL; each repo becomes a tombstone (last commit, language, EOL/deprecated deps, build status).
2. **Autopsy** - static analysis + LLM produce a "cause of death" report.
3. **Soul Restore** - generate `.kiro/steering` (product/tech/structure), a resurrection spec (requirements/design/tasks) and build/test hooks for the dead repo.
4. **Resurrect** - in a Docker sandbox: upgrade deps -> build/test -> feed failure logs to the LLM -> patch -> retry (max 5) -> green build produces a PR or zip.
5. **Halloween UI** - graveyard scene; digging, heartbeat and zombie-rising animations per stage; failure = "reburied".

## Scope (solo, 2 weeks)
- Must: Node.js repos. Nice: Python repos, Necromancer MCP server, Lazarus score (before/after EOL deps & vulns).
- Out: Java/Go, GitHub App, multi-user accounts.

## Principles
- A working, demoable path beats breadth. Demo repos are fixed and replayable from cache.
- Never claim numbers in the UI or docs that were not measured.
