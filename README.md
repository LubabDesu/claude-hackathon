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

Optional model-powered guidance uses OpenRouter:

```bash
export OPENROUTER_API_KEY=...
export OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

Without an API key, the backend returns deterministic demo-safe guidance.
