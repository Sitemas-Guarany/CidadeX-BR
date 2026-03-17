# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CidadeX is a Brazilian PWA (Progressive Web App) focused on cities in Ceará, Brazil. It provides urban information, a local social network, map navigation, personal agenda, and real-time communication. The app is in Portuguese (pt-BR).

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Run tests once (vitest)
npm run test:watch   # Run tests in watch mode
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite (SWC)
- **Styling**: Tailwind CSS + shadcn/ui (default style, slate base color, CSS variables)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Maps**: Leaflet + React-Leaflet
- **Mobile**: Capacitor (Android) — app ID: `com.cidadex.br`
- **PWA**: vite-plugin-pwa with autoUpdate
- **State**: React Query (@tanstack/react-query), React Context
- **Forms**: react-hook-form + zod
- **Routing**: react-router-dom v6

## Architecture

**Path alias**: `@/` maps to `src/`.

**Provider hierarchy** (App.tsx): `GlobalErrorBoundary → QueryClientProvider → AuthProvider → ProfileProvider → VoiceCallProvider → TooltipProvider → BrowserRouter`

**Key patterns**:
- Authentication via `useAuth()` hook (Context-based, wraps Supabase auth). Has ban-check and auto-logout logic — **do not modify `useAuth.tsx` without care** (see warning comment in file).
- Supabase client auto-generated at `src/integrations/supabase/` — do not edit `client.ts` or `types.ts` manually.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (loaded via `import.meta.env`).
- Routes: most pages behind `<ProtectedRoute>` (requires auth). Public routes: `/auth`, `/reset-password`, `/install`, `/privacidade`.
- The Index page uses drag-and-drop tab reordering (`@hello-pangea/dnd`) and lazy-loads section components.

**Component organization**:
- `components/ui/` — shadcn/ui primitives (add new ones via `npx shadcn-ui@latest add <component>`)
- `components/common/` — shared app components (error boundaries, guards, modals)
- `components/city/` — city information module (map, weather, neighborhoods, events, news)
- `components/social/` — social features (feed, chat, groups, contacts, voice/video calls via WebRTC)
- `components/navigation/` — urban navigation (routes, step-by-step, traffic alerts)
- `components/agenda/` — personal agenda, dictionary, shopping list
- `components/finances/` — personal finance management
- `components/admin/` — admin panel features

**Edge Functions** (`supabase/functions/`): Deno-based serverless functions for city-assistant (AI), data fetching (news, events, places, bus schedules), audio transcription, text translation, CEP lookup, medication search, and more.

## TypeScript Config

- `strictNullChecks: false`, `noImplicitAny: false` — the project uses relaxed TS settings.
- ESLint has `@typescript-eslint/no-unused-vars` turned off.

## Testing

- Vitest with jsdom environment
- Setup file: `src/test/setup.ts`
- Test files: `src/**/*.{test,spec}.{ts,tsx}`
