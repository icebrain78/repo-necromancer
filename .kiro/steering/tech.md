---
inclusion: always
---
# Tech

## Stack
- Language: TypeScript everywhere (strict mode). Node.js 22 LTS. Package manager: pnpm workspaces.
- Web: Next.js (App Router) + Tailwind CSS. Animations with CSS/Canvas; no heavy 3D.
- Worker: Node.js service that clones repos and runs builds inside Docker containers.
- Tests: Vitest + fast-check (property-based tests).

## LLM
- All LLM calls go through `packages/core/llm` with a provider interface; select by `LLM_PROVIDER=local|anthropic`.
- `local`: OpenAI-compatible endpoint on the self-hosted inference server (Ollama), base URL from `LOCAL_LLM_BASE_URL`.
- `anthropic`: Claude API. Always use prompt caching: put stable system prompts and templates first with `cache_control`; send the first request before any parallel ones; log `cache_creation_input_tokens` and `cache_read_input_tokens` for every call.
- Never hardcode keys; read from env. Never send secrets from scanned repos to the LLM.

## External data
- endoflife.date API (runtime EOL), npm registry metadata, PyPI JSON API, OSV.dev (vulnerabilities), GitHub REST API.

## Sandbox safety
- Builds run in throwaway containers: no host mounts except the work dir, CPU/memory/time limits, network only for package registries.
- Work dirs live on the worker host's data disk, never in the repo.

## Deployment
- Web on Vercel; worker on Fly.io or Railway. Must stay up until 2027-01-29 for judging. Rate-limit live resurrections; demo repos use cached replay.
