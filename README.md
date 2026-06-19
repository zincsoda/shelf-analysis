# ShelfSight

AI-powered supermarket shelf analysis — estimate empty shelf space from photos using OpenRouter vision models. Built entirely on Cloudflare.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Pages (React)  │────▶│  Workers (API)   │────▶│  OpenRouter │
│  frontend/      │     │  worker/         │     │  Vision API │
└─────────────────┘     └────────┬─────────┘     └─────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
                  D1 DB        R2 Images    KV Rate Limit
```

## Project Structure

```
shelf-analysis/
├── shared/          # Shared TypeScript types
├── worker/          # Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts           # Router entry point
│   │   ├── lib/               # JWT, PBKDF2, rate limiting
│   │   ├── middleware/        # Auth middleware
│   │   ├── routes/            # API route handlers
│   │   └── services/          # OpenRouter, R2 storage
│   ├── migrations/            # D1 SQL migrations
│   └── wrangler.toml
└── frontend/        # Cloudflare Pages (React + Vite)
    └── src/
```

## Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v4+
- Cloudflare account
- Each user adds their own OpenRouter API key in Settings

## Quick Start (Local)

### 1. Install dependencies

```bash
npm install
```

### 2. Create Cloudflare resources

```bash
# D1 database
cd worker
npx wrangler d1 create shelf-analysis-db
# Copy the database_id into wrangler.toml

# R2 bucket
npx wrangler r2 bucket create shelf-analysis-images

# KV namespace for rate limiting
npx wrangler kv namespace create RATE_LIMIT
# Copy the id into wrangler.toml
```

### 3. Configure secrets

```bash
cp worker/.dev.vars.example worker/.dev.vars
# Edit .dev.vars with your JWT_SECRET
```

### 4. Run migrations

```bash
npm run db:migrate:local
```

### 5. Seed admin user

```bash
cd worker
npx wrangler dev scripts/seed-admin.ts --local
# Then visit http://localhost:8787 in browser to trigger seed
# Default: admin@shelfsight.local / admin12345
```

### 6. Start dev servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8787

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | — | Email + password login |
| POST | `/api/logout` | — | Clear session cookie |
| GET | `/api/me` | User | Current user info |
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/users` | Admin | Create user |
| PUT | `/api/admin/users/:id` | Admin | Update role / disable / reset password |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |
| POST | `/api/analyze` | User | Upload image + analyze |
| GET | `/api/analyses` | User | List analyses (all for admin) |
| GET | `/api/analyses/:id` | User | Get analysis detail |
| GET | `/api/images/:id` | User | Serve image from R2 |

## Deployment

### Worker API

```bash
cd worker
npx wrangler secret put JWT_SECRET
npm run db:migrate:remote
npm run deploy
```

### Pages Frontend

```bash
cd frontend
cp .env.example .env.production   # sets VITE_API_URL to your Worker URL
npm run deploy
```

The frontend and API are on different domains (`shelfsight.swlabs.cc` vs `*.workers.dev`), so `VITE_API_URL` must be set at build time. Without it, login POSTs hit Pages static hosting and return HTTP 405.

### CORS & Cookies

Set `FRONTEND_URL` in `worker/wrangler.toml` to your Pages URL. For cross-origin cookie auth in production, ensure both apps share a parent domain or configure a reverse proxy.

## Security

- Passwords hashed with PBKDF2-SHA256 (100k iterations)
- JWT in HttpOnly Secure SameSite=Strict cookies (7-day expiry)
- Login rate limited (5 attempts / 15 min via KV)
- Image validation (type + 5 MB max)
- R2 bucket is private; images served via authenticated API route
- API keys stored as Worker secrets, never exposed to frontend

## AI Models

- `openai/gpt-4.1`
- `google/gemini-2.0-flash-exp`
- `anthropic/claude-3.5-sonnet`
- `meta-llama/llama-3.2-90b-vision-instruct`
