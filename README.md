# Kortex AI

An AI chat workspace featuring document-grounded retrieval-augmented generation (RAG), dynamic Gemini model switching with automatic fallback, and multi-turn conversation persistence.

---

## Architecture

This application is built as a TypeScript monorepo using pnpm workspaces:

- **Frontend (`apps/web`)**: Next.js 15 (App Router), React 19, Tailwind CSS, Framer Motion.
- **Backend API (`services/api`)**: Fastify 5 REST & SSE streaming server, MongoDB native driver, Zod validation.
- **Shared Packages (`packages/`)**:
  - `types`: Shared domain interfaces, request/response contracts, and types.
  - `config`: Shared ESLint and TypeScript base configurations.

---

## Core Capabilities

1. **Multi-Turn Chat Streaming**: Real-time token streaming over Server-Sent Events (SSE) with chat history saved to MongoDB.
2. **Model Fallback Engine**: Primary execution on `gemini-3.5-flash-lite`, automatically falling back to `gemini-3.5-flash` during rate limits (429) or service outages (503).
3. **RAG & Knowledge Documents**: Upload `.pdf`, `.txt`, `.md`, `.csv`, or `.json` files up to 20MB. Includes stream-decompressed PDF text extraction, automated chunking, and semantic vector embeddings via `gemini-embedding-001`.
4. **Custom System Instructions**: Set conversation-specific personas, domain rules, and constraints directly from the header settings modal.
5. **Security**: Asynchronous `scrypt` password hashing, HMAC-SHA256 bearer tokens, and rate limiting.
6. **Observability**: Readiness (`/health/readiness`), liveness (`/health/liveness`), and Prometheus metrics (`/metrics`).

---

## Setup & Local Development

### 1. Requirements

- Node.js 18.18+ or 20+
- pnpm 9+
- MongoDB instance (local or MongoDB Atlas)
- Google Gemini API key

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Variables

Copy the example file to `.env`:

```bash
cp .env.example .env
```

Set your configuration values:

```env
NODE_ENV=development
APP_URL=http://localhost:3000
API_INTERNAL_BASE_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=ai_chat
AUTH_SECRET=your-secure-random-secret
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run the Application

```bash
# Start backend API (Port 4000)
pnpm dev:api

# Start frontend web client (Port 3000)
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Scripts

- `pnpm dev`: Run development server
- `pnpm build`: Build all workspaces
- `pnpm test`: Execute automated test suites
- `pnpm typecheck`: Run TypeScript compiler checks
- `pnpm lint`: Lint codebase
