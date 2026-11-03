# AI Chat App Blueprint (Ollama + MongoDB)

This document is your single source of truth for building a ChatGPT/Gemini-style app using **local Ollama models** and **MongoDB**.

---

## 1) Product Goal

Build a modern AI chat assistant that supports:

- Multi-turn chat
- Chat history persistence
- RAG (ask questions over uploaded documents)
- Streaming responses
- Model switching
- Clean, premium UI

### v1 Success Criteria

- User can sign up/login
- User can create chat, send message, get streamed response
- Chats and messages persist in MongoDB
- User can upload docs and ask grounded questions from docs
- App runs locally with Ollama + MongoDB

---

## 2) Final Tech Stack

### Frontend

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Query (or SWR)

### Backend

- Next.js API routes
- Node.js + TypeScript
- Zod for request validation

### AI Runtime

- Ollama local server (`http://localhost:11434`)
- Chat model: `qwen3:8b`
- Fallback model: `lfm3:1.7b`
- Embeddings model: `embeddinggemma`

### Database

- MongoDB (Atlas recommended for Vector Search)
- Mongoose or official MongoDB Node driver

### Infra / Tooling

- Docker Compose (optional for local stack)
- ESLint + Prettier
- Vitest/Jest for tests

## 2.1) Styling Reference (Design System)

Use this section as the UI source-of-truth while implementing components.

### Design Principles

- Clarity first: readable chat content, clean hierarchy
- Calm aesthetic: low-noise surfaces, restrained colors
- AI-native feel: streaming states, subtle motion, glass/blur only where useful
- Accessibility by default: keyboard-first, strong contrast, visible focus

### Color Tokens (reference)

Use semantic tokens instead of hardcoded colors in components.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f8fafc` | `#0b1220` | app background |
| `--surface` | `#ffffff` | `#111827` | cards/panels |
| `--surface-2` | `#f1f5f9` | `#1f2937` | secondary panels |
| `--text` | `#0f172a` | `#e5e7eb` | primary text |
| `--text-muted` | `#64748b` | `#94a3b8` | helper text |
| `--border` | `#e2e8f0` | `#334155` | borders/dividers |
| `--primary` | `#2563eb` | `#60a5fa` | buttons/highlight |
| `--success` | `#16a34a` | `#22c55e` | success states |
| `--warning` | `#d97706` | `#f59e0b` | warning states |
| `--danger` | `#dc2626` | `#ef4444` | destructive/error |

### Typography Scale (Tailwind reference)

- App title: `text-xl font-semibold tracking-tight`
- Section title: `text-sm font-medium`
- Body: `text-sm leading-6`
- Chat message: `text-[15px] leading-7`
- Caption/meta: `text-xs text-muted-foreground`
- Code block: `text-sm font-mono leading-6`

### Spacing, Radius, Elevation

- Base spacing unit: `4px`
- Common gaps: `gap-2`, `gap-3`, `gap-4`, `gap-6`
- Radius: cards `rounded-xl`, inputs/buttons `rounded-lg`, pills `rounded-full`
- Borders: `border border-border/70`
- Shadows:
  - default card: `shadow-sm`
  - elevated/floating: `shadow-md`
  - modal/popover: `shadow-xl`

### Layout Blueprint

- Desktop shell: left sidebar + main chat pane
  - Sidebar width: `280px`
  - Main chat max width: `840px` centered
- Mobile shell:
  - Collapsible sidebar (sheet/drawer)
  - Sticky composer at bottom with safe-area padding

### Component Styling Recipes

Use these as quick utility references.

```txt
App shell:       min-h-screen bg-[var(--bg)] text-[var(--text)]
Sidebar:         border-r border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur
Chat container:  mx-auto w-full max-w-[840px] px-4 md:px-6
User bubble:     rounded-2xl rounded-br-md bg-[var(--primary)] text-white px-4 py-3
AI bubble:       rounded-2xl rounded-bl-md bg-[var(--surface-2)] px-4 py-3 border border-[var(--border)]
Composer:        rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm
Primary button:  rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50
Ghost button:    rounded-lg hover:bg-[var(--surface-2)]
```

### Message Rendering Rules

- Max line length for text blocks: ~80 chars visual width
- Use Markdown with consistent typography styles
- Code blocks:
  - dark surface in both themes
  - copy button top-right
  - horizontal scroll only inside block
- Tables and long content should scroll within message body, not whole page

### UX States to Style Early

- `loading`: skeletons + “Thinking…” indicator
- `streaming`: cursor pulse + stop button
- `empty chat`: first-run prompt cards
- `error`: inline error banner + retry action
- `offline`: subtle top warning bar + disabled send state

### Motion Guidelines

- Duration: `120ms` (micro), `200ms` (default), `280ms` (enter/exit)
- Easing: `ease-out` for enter, `ease-in-out` for transitions
- Animate:
  - message enter (fade + translateY 4px)
  - sidebar expand/collapse
  - typing/streaming indicator
- Avoid heavy motion for frequent token streaming updates

### Accessibility Checklist (must-pass)

- Color contrast >= WCAG AA
- Full keyboard navigation (including chat list and composer actions)
- Visible focus ring on all interactive elements
- `aria-live="polite"` for streamed assistant messages
- Touch targets at least 40x40px on mobile

### Styling Implementation Order

1. Define CSS variables + Tailwind theme extensions
2. Create base primitives (`Button`, `Input`, `Card`, `Badge`, `Tooltip`)
3. Build chat-specific components (`MessageBubble`, `Composer`, `ChatSidebar`)
4. Add dark mode and validate contrast
5. Add motion + state variants

---

## 3) High-Level Architecture

1. Frontend sends user prompt to backend (`/api/chat/send`)
2. Backend loads chat history from MongoDB
3. If RAG enabled:
   - backend embeds query via Ollama (`/api/embed`)
   - backend runs vector search in MongoDB
   - backend builds context block
4. Backend calls Ollama chat endpoint
5. Stream response back to frontend
6. Store assistant response in MongoDB

---

## 4) App Modules

- `auth` (signup/login/session)
- `chat` (threads, messages, streaming)
- `models` (available models + current selection)
- `documents` (upload, parse, chunk)
- `embeddings` (vector generation)
- `retrieval` (vector + keyword search)
- `rag` (context builder + citations)
- `admin` (optional usage metrics)

---

## 5) Project Folder Structure

```txt
ai-chat-app/
  apps/
    web/                         # Next.js frontend
      src/
        app/
        components/
        features/
        lib/
        hooks/
  services/
    api/                         # Backend service (if separate)
      src/
        modules/
          auth/
          chat/
          models/
          documents/
          embeddings/
          retrieval/
          rag/
        shared/
          db/
          config/
          logger/
  packages/
    ui/
    types/
  docs/
    AI_CHAT_APP_BLUEPRINT.md
```

If you keep it simple, start with **single Next.js app** and place API routes inside `app/api/*`.

---

## 6) Environment Variables

```env
# app
NODE_ENV=development
APP_URL=http://localhost:3000

# mongodb
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB=ai_chat

# auth
AUTH_SECRET=replace-with-long-random-string

# ollama
OLLAMA_BASE_URL=http://localhost:11434
CHAT_MODEL=qwen3:8b
FALLBACK_MODEL=lfm3:1.7b
EMBED_MODEL=embeddinggemma

# uploads
MAX_FILE_SIZE_MB=20
UPLOAD_DIR=./uploads
```

---

## 7) Data Model (MongoDB)

## 7.1 `users`

```json
{
  "_id": "ObjectId",
  "email": "string",
  "name": "string",
  "passwordHash": "string",
  "role": "user|admin",
  "createdAt": "date",
  "updatedAt": "date"
}
```

Indexes:

- unique: `email`

## 7.2 `chats`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "title": "string",
  "model": "string",
  "systemPrompt": "string|null",
  "lastMessageAt": "date",
  "createdAt": "date",
  "updatedAt": "date"
}
```

Indexes:

- `{ userId: 1, lastMessageAt: -1 }`

## 7.3 `messages`

```json
{
  "_id": "ObjectId",
  "chatId": "ObjectId",
  "role": "user|assistant|tool|system",
  "content": "string",
  "tokensIn": "number|null",
  "tokensOut": "number|null",
  "latencyMs": "number|null",
  "citations": [
    {
      "documentId": "ObjectId",
      "chunkId": "ObjectId",
      "score": "number"
    }
  ],
  "createdAt": "date"
}
```

Indexes:

- `{ chatId: 1, createdAt: 1 }`

## 7.4 `documents`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "chatId": "ObjectId|null",
  "filename": "string",
  "mimeType": "string",
  "sizeBytes": "number",
  "status": "uploaded|processing|ready|failed",
  "error": "string|null",
  "createdAt": "date",
  "updatedAt": "date"
}
```

Indexes:

- `{ userId: 1, createdAt: -1 }`
- `{ status: 1 }`

## 7.5 `chunks`

```json
{
  "_id": "ObjectId",
  "documentId": "ObjectId",
  "userId": "ObjectId",
  "chatId": "ObjectId|null",
  "text": "string",
  "embedding": [0.0123, -0.9812, 0.2231],
  "metadata": {
    "chunkIndex": 0,
    "start": 0,
    "end": 750,
    "source": "filename.pdf"
  },
  "createdAt": "date"
}
```

Indexes:

- `{ documentId: 1, "metadata.chunkIndex": 1 }`
- vector search index on `embedding` (Atlas Vector Search)

---

## 8) MongoDB Search Strategy

### Option A (Recommended): Atlas Vector Search + Atlas Search

- Use vector index on `chunks.embedding`
- Use text index/search index on `chunks.text`
- Hybrid retrieve: vector + keyword rerank

### Option B (Basic): Self-managed MongoDB text search only

- Use `$text` for keyword retrieval
- No semantic retrieval unless you implement custom vector store logic elsewhere

---

## 9) Ollama Integration Strategy

Use either one style consistently:

### Style 1: Native Ollama API

- Chat: `POST /api/chat`
- Embeddings: `POST /api/embed`

### Style 2: OpenAI-Compatible

- Chat: `/v1/chat/completions`
- Responses: `/v1/responses` (non-stateful)
- Embeddings: `/v1/embeddings`

**Recommendation:** start with native endpoints for clarity and fewer edge cases.

---

## 10) API Contracts (v1)

## 10.1 Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## 10.2 Chat

- `POST /api/chats` → create chat
- `GET /api/chats` → list chats
- `GET /api/chats/:chatId/messages` → message history
- `POST /api/chats/:chatId/messages` → send user message + stream assistant

## 10.3 Models

- `GET /api/models` → available local models
- `PUT /api/chats/:chatId/model` → switch model

## 10.4 Documents + RAG

- `POST /api/documents/upload`
- `POST /api/documents/:id/process`
- `GET /api/documents`
- `DELETE /api/documents/:id`

---

## 11) Core Flows

## 11.1 Send Message Flow

1. Validate request
2. Save user message
3. Fetch last N messages (e.g., 20)
4. (Optional) retrieve RAG context
5. Call Ollama chat
6. Stream tokens to client
7. Save final assistant message
8. Update chat timestamp/title

## 11.2 Document Ingestion Flow

1. Upload file
2. Extract text (PDF/DOC/TXT)
3. Chunk text (e.g., 600-900 tokens with overlap)
4. Embed chunks using Ollama embed model
5. Store chunks in MongoDB
6. Mark document as ready

## 11.3 Retrieval Flow

1. Embed query
2. Vector search top-k chunks
3. (Optional) keyword search + merge
4. Build context with sources
5. Generate grounded answer

---

## 12) Prompting Guidelines

Use fixed system prompt templates:

- `general_assistant`
- `grounded_rag_answer`
- `code_assistant`

For RAG responses:

- Never hallucinate sources
- If context insufficient, say “I don’t have enough source context”
- Keep answer concise + cite source chunks

---

## 13) Streaming UX Requirements

- Show typing stream token-by-token
- Support “Stop generation” button
- Retry last message
- Copy response
- Show model used + latency

---

## 14) Security + Guardrails

- Hash passwords (argon2/bcrypt)
- Auth middleware on all private routes
- Rate limit chat endpoints
- File type + size validation
- Sanitize extracted text
- Prevent prompt injection from documents:
  - wrap context in clear delimiters
  - enforce instruction hierarchy in system prompt

---

## 15) Observability

Track:

- request count
- avg latency
- tokens in/out estimate
- model error rate
- retrieval hit rate

Log structure:

- requestId, userId, chatId, model, endpoint, durationMs, status

---

## 16) Testing Plan

## Unit Tests

- chunking utility
- prompt builder
- retrieval ranker
- API validators

## Integration Tests

- chat endpoint with mocked Ollama
- document upload + processing
- retrieval pipeline

## E2E Tests

- login → new chat → send msg → response stream
- upload doc → ask grounded question

---

## 17) Development Roadmap (Step-by-Step)

## Phase 0 — Bootstrap (Day 1-2)

- [ ] Initialize repo and package manager
- [ ] Setup Next.js + TypeScript + Tailwind
- [ ] Configure ESLint/Prettier
- [ ] Setup env management

## Phase 1 — Core Chat (Day 3-6)

- [ ] Mongo connection and basic schemas (`users/chats/messages`)
- [ ] Auth (signup/login/logout)
- [ ] Chat CRUD APIs
- [ ] Ollama chat integration
- [ ] Streaming UI in frontend

## Phase 2 — RAG Foundation (Day 7-11)

- [ ] File upload endpoint
- [ ] Text extraction pipeline
- [ ] Chunking service
- [ ] Embedding generation via Ollama
- [ ] Store chunks + vector index

## Phase 3 — Grounded Answers (Day 12-15)

- [ ] Query embedding
- [ ] Vector retrieval
- [ ] Context injection into prompts
- [ ] Citation UI

## Phase 4 — Product Polish (Day 16-20)

- [ ] Model switcher UI
- [ ] Chat search/filter
- [ ] Regenerate response
- [ ] Error states + empty states + toasts

## Phase 5 — Hardening (Day 21-25)

- [ ] Test coverage
- [ ] Rate limiting
- [ ] Logging + metrics
- [ ] Deployment scripts

---

## 18) Definition of Done (v1)

You are done when:

- [ ] Auth + sessions work reliably
- [ ] Chat is streamed and persisted
- [ ] RAG answers use uploaded docs
- [ ] Basic monitoring and error handling exist
- [ ] App is deployable with one command sequence

---

## 19) First Commands You’ll Run

```bash
# 1) Start Ollama server and pull models
ollama serve
ollama pull qwen3:8b
ollama pull lfm3:1.7b
ollama pull embeddinggemma

# 2) Start MongoDB (local or Atlas)
# local example:
docker run -d --name mongo -p 27017:27017 mongo:7

# 3) Start app
pnpm install
pnpm dev
```

---

## 20) Immediate Next Task (Start Here)

When development begins, do this exact order:

1. Create project skeleton + env config
2. Implement Mongo connection + base schemas
3. Build `/api/chats/:chatId/messages` with Ollama streaming
4. Build minimal chat UI wired to streaming
5. Add message persistence

After these 5 are stable, move to document ingestion and RAG.

---

If needed, create a second file later: `IMPLEMENTATION_NOTES.md` for daily decisions and changes from this blueprint.

