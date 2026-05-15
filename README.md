# Self-hosted Shopping List

A full-stack household shopping list app with AI-powered item categorisation, recipe import, meal planning, and optional Alexa integration.

Built because every commercial alternative either doesn't model how real households shop, costs a subscription, or ships your data to someone else. This one runs on your own hardware.

---

## What it does

- **Shopping list** with category-based grouping and aisle-sorted view (add your own aisle order to match your supermarket)
- **AI categorisation** — drop in an item name and the AI figures out which category it belongs to; it learns your rules over time
- **Recipe import** — paste a URL, it pulls the ingredients. Works on most recipe sites via JSON-LD schema; falls back to AI parsing for the rest
- **Meal planner** — plan the week's meals and push the ingredients straight to the list
- **Item suggestions** — AI suggests what you likely need based on what you typically buy
- **Gift card tracker** — optional, tracks gift card balances by scraping retailer sites
- **Alexa integration** — optional, two-way sync with an Alexa shopping list if you're running the companion alexa-lists service

---

## Tech stack

| Layer | What |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Express + TypeScript |
| Database | PostgreSQL 16 via Drizzle ORM |
| AI | Groq (primary) + Google Gemini (recipe fallback) + Ollama (optional local fallback) |
| Auth | Google OAuth 2.0 |
| Containers | Docker + Docker Compose |
| Web server | Nginx (serves the Vite build, proxies `/api/*` to Express) |

---

## Prerequisites

- Docker and Docker Compose
- A Google account (for OAuth — it's free)
- A Groq API key (also free — more on this below)
- Node.js 20+ and pnpm if you want to run locally without Docker

---

## Getting started

### 1. Clone and configure

```bash
git clone https://github.com/richatnort/AASL.git
cd AASL
cp .env.example .env
```

Open `.env` and fill in the required values. See the [environment variables](#environment-variables) section below.

### 2. Google OAuth setup

You need a Google OAuth client to handle sign-in. It's free and takes about five minutes.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project
2. Navigate to **APIs & Services > Credentials**
3. Create an **OAuth 2.0 Client ID** — type: Web application
4. Add your redirect URIs:
   - Development: `http://localhost:3001/auth/google/callback`
   - Production: `https://your-domain.com/auth/google/callback`
5. Copy the Client ID and Client Secret into your `.env`

### 3. Set up AI (optional but recommended)

Without AI, the app still works — you just categorise items manually. With it, items get categorised automatically and suggestions improve over time.

**Groq is what we use and recommend.** It's free, fast, and the free tier comfortably covers home-scale usage. Sign up at [console.groq.com](https://console.groq.com), grab an API key, and drop it into `GROQ_API_KEY` in your `.env`.

The app uses `llama-3.3-70b-versatile` for categorisation and item suggestions.

For recipe parsing on sites that don't have structured data, it falls back to **Google Gemini** (also free). Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and set `GEMINI_API_KEY`.

If you're running Ollama locally, set `OLLAMA_HOST` and that'll be tried first for recipe parsing before hitting the external APIs.

### 4. Start the app

```bash
docker compose up -d
```

That's it. The app runs on port 80. Open your browser and sign in with your Google account.

The first Google account to sign in gets admin status automatically — set `ADMIN_EMAIL` in your `.env` to your address before the first login to make sure it's you.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | From the Google OAuth console |
| `GOOGLE_CLIENT_SECRET` | Yes | From the Google OAuth console |
| `GOOGLE_CALLBACK_URL` | Yes | Must match what you set in the OAuth console |
| `SESSION_SECRET` | Yes | Any long random string — rotate it if it leaks |
| `ADMIN_EMAIL` | Yes | This email gets admin on first login |
| `PRE_APPROVED_EMAILS` | No | Comma-separated emails — gets access on first login without needing admin approval |
| `DATABASE_URL` | Yes | Set automatically by Docker Compose if you use `DB_PASSWORD` |
| `DB_PASSWORD` | Yes | Change this before deploying — anything is better than the default |
| `GROQ_API_KEY` | No | Required for AI categorisation and suggestions |
| `GEMINI_API_KEY` | No | Required for AI recipe parsing fallback |
| `OLLAMA_HOST` | No | If you're running a local Ollama instance |
| `ALEXA_SERVICE_URL` | No | Only needed if you're running the Alexa companion service |
| `TELEGRAM_BOT_TOKEN` | No | Meal reminder notifications via Telegram |
| `TELEGRAM_CHAT_ID` | No | Target chat for Telegram notifications |

---

## User access

The app uses an approval model — anyone can attempt to sign in with Google, but they don't get access until an admin approves them. This makes it safe to expose to the internet without running an open registration.

- Set `ADMIN_EMAIL` to your email before first login — you'll get admin access automatically
- Add `PRE_APPROVED_EMAILS` for anyone else in your household who should get access without you having to manually approve them
- Everyone else lands in a pending queue; you approve them from the admin panel

---

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` handles CI and deployment. It expects a self-hosted runner on your server — set one up following [GitHub's docs](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners).

The workflow:
1. Runs type checks, linting, and tests on every push and PR
2. On a merge to `main`, deploys to the server via the self-hosted runner

Store your production `.env` somewhere safe on the server (the workflow expects it at `/opt/shopping-list/.env` — adjust the path in `deploy.yml` if you put it elsewhere).

If you're not using GitHub Actions, `docker compose up -d` on the server works fine on its own.

---

## Running locally (without Docker)

```bash
# Install dependencies
pnpm install

# Start the database (still needs Docker for Postgres)
docker compose up -d db

# Build the shared package
pnpm --filter @shopping-list/shared build

# Start the API and frontend in parallel
pnpm --filter @shopping-list/api dev
pnpm --filter @shopping-list/web dev
```

The frontend runs on `http://localhost:5173`, the API on `http://localhost:3001`.

---

## Database

Drizzle ORM manages the schema. Migrations run automatically on startup — no manual steps needed.

If you want to make schema changes:

```bash
# Generate a migration after editing apps/api/src/db/schema.ts
pnpm --filter @shopping-list/api db:generate

# Apply it
pnpm --filter @shopping-list/api db:migrate
```

---

## Alexa integration

If you have an Alexa device and want two-way list sync, the companion service is at [richatnort/alexa-lists](https://github.com/richatnort/alexa-lists). Run that separately and point `ALEXA_SERVICE_URL` at it.

---

## Licence

MIT
