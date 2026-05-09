# Multilingual Benefits Navigator

Privacy-first hackathon MVP for helping immigrant and low-income users discover likely government benefits and navigate official application pages with multilingual text-to-speech guidance.

## Apps

- `apps/web`: Next.js + TypeScript discovery interface.
- `apps/api`: FastAPI backend for resource matching, explanations, and page guidance.
- `apps/extension`: Manifest V3 Chrome extension that highlights page elements and speaks guidance.

## Privacy stance

Profile data is session-only by default. The backend does not persist user profiles, does not log request bodies, and rejects highly sensitive fields such as SSNs, exact birth dates, credentials, and document numbers. Users may optionally save a profile on their own device through browser local storage.

## Quick start

```bash
npm install
npm run dev
```

In another terminal:

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```

Open the web app at `http://localhost:3001`. Load `apps/extension` as an unpacked Chrome extension and keep the FastAPI server running at `http://localhost:8001`.

## Environment

OpenDeepSearch-backed benefits discovery uses OpenDeepSearch with Serper or
SearXNG for retrieval and a LiteLLM-compatible model for synthesis:

```bash
export OPENDEEPSEARCH_PROVIDER=serper
export SERPER_API_KEY=...
export OPENROUTER_API_KEY=...
export OPENDEEPSEARCH_MODEL=openrouter/google/gemini-2.0-flash-001
export OPENDEEPSEARCH_RERANKER=jina
export JINA_API_KEY=...
```

For SearXNG instead of Serper:

```bash
export OPENDEEPSEARCH_PROVIDER=searxng
export SEARXNG_INSTANCE_URL=https://your-searxng-instance.com
export SEARXNG_API_KEY=... # optional
```

Without search/model credentials, the backend returns empty live-search results
and keeps deterministic demo-safe guidance for explanation endpoints.
