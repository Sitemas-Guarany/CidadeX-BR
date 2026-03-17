# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CidadeX is a Brazilian PWA (Progressive Web App) focused on cities in Ceará, Brazil. It provides urban information, a local social network, map navigation, personal agenda, and real-time communication. The app is in Portuguese (pt-BR).

**Production URL**: https://www.cidadex-br.com
**Hosting**: Vercel (auto-deploy from GitHub `main` branch)
**Repository**: https://github.com/cidadexbr-oss/CidadeX-BR

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Run tests once (vitest)
npm run test:watch   # Run tests in watch mode
```

## Deploy

```bash
npx vercel           # Preview deploy
npx vercel --prod    # Production deploy
git push origin main # Also triggers Vercel deploy
```

Version files to update on release: `src/config/version.ts` + `public/version.json`.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite (SWC)
- **Styling**: Tailwind CSS + shadcn/ui (default style, slate base color, CSS variables)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Maps**: Leaflet (vanilla, not React-Leaflet)
- **Mobile**: Capacitor (Android) — app ID: `com.cidadex.br`
- **PWA**: vite-plugin-pwa with autoUpdate, skipWaiting: true
- **State**: React Query (@tanstack/react-query), React Context
- **Forms**: react-hook-form + zod
- **Routing**: react-router-dom v6
- **Navigation**: OSRM (routing), Nominatim (geocoding), Overpass (POI/speed cameras)

## Architecture

**Path alias**: `@/` maps to `src/`.

**Provider hierarchy** (App.tsx): `GlobalErrorBoundary → QueryClientProvider → AuthProvider → ProfileProvider → VoiceCallProvider → TooltipProvider → BrowserRouter → AppShell`

**AppShell** (App.tsx): Renders global overlays (Watermark, UpdatePrompt, WordSelectionPopup) conditionally — hidden on `/navegar` route for clean fullscreen navigation.

**Key patterns**:
- Authentication via `useAuth()` hook (Context-based, wraps Supabase auth). Has ban-check and auto-logout logic — **do not modify `useAuth.tsx` without care** (see warning comment in file).
- Supabase client auto-generated at `src/integrations/supabase/` — do not edit `client.ts` or `types.ts` manually.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (loaded via `import.meta.env`).
- Routes: most pages behind `<ProtectedRoute>` (requires auth). Public routes: `/auth`, `/reset-password`, `/install`, `/privacidade`.
- The Index page uses drag-and-drop tab reordering (`@hello-pangea/dnd`) and lazy-loads section components.

**Routes**:
- `/` — Main app (Index.tsx with tabs: cidade, social, navegar, agenda, etc.)
- `/navegar` — Fullscreen GPS navigation (no header/menu, Fullscreen API on mobile, new tab on desktop)
- `/auth`, `/reset-password` — Authentication
- `/profile`, `/ajuda`, `/admin`, `/visualizador` — Protected pages
- `/install`, `/privacidade` — Public pages

**Component organization**:
- `components/ui/` — shadcn/ui primitives (add new ones via `npx shadcn-ui@latest add <component>`)
- `components/common/` — shared app components (error boundaries, guards, modals)
- `components/city/` — city information module (map, weather, neighborhoods, events, news)
- `components/social/` — social features (feed, chat, groups, contacts, voice/video calls via WebRTC)
- `components/navigation/` — urban navigation (Waze-inspired design)
  - `NavigationSection.tsx` — Main container: fullscreen map, "Para onde?" search pill, bottom sheet, route summary card, FABs
  - `NavigationFullscreen.tsx` — Immersive GPS navigation with HUD (speed, ETA, maneuver, radar alerts, voice)
  - `RoutePanel.tsx` — Route search, transport mode, saved destinations
  - `PoiSearch.tsx` — POI categories + custom search (Nominatim + Overpass)
  - `StepByStepPanel.tsx` — Turn-by-turn instructions with voice
  - `TrafficAlertsSection.tsx` — Community traffic alerts with voting
  - `speedCameras.ts` — Speed camera detection via Overpass API
- `components/agenda/` — personal agenda, dictionary, shopping list, medications
- `components/finances/` — personal finance management
- `components/admin/` — admin panel features

**Navigation design** (Waze-inspired):
- Map fills entire container (absolute positioned)
- "Para onde?" floating search pill at bottom
- Bottom sheet slides up with route planning, POI search, alerts
- Route summary card with big "IR" button, alternatives, ETA
- Circular FABs (GPS, sound, follow, day/night) on right side
- Report alert FAB on left side
- Accent color: `#33C6AA` (teal)
- All overlays use `backdrop-blur` and semi-transparent backgrounds

**Edge Functions** (`supabase/functions/`): Deno-based serverless functions for city-assistant (AI), data fetching (news, events, places, bus schedules), audio transcription, text translation, CEP lookup, medication search, and more.

## TypeScript Config

- `strictNullChecks: false`, `noImplicitAny: false` — the project uses relaxed TS settings.
- ESLint has `@typescript-eslint/no-unused-vars` turned off.

## Testing

- Vitest with jsdom environment
- Setup file: `src/test/setup.ts`
- Test files: `src/**/*.{test,spec}.{ts,tsx}`

## PWA / Service Worker

- `vite-plugin-pwa` with `registerType: "autoUpdate"`, `skipWaiting: true`, `clientsClaim: true`
- Update check: `checkForUpdates()` in Index.tsx (detects SW state changes including `activated` state for skipWaiting compatibility)
- Version fallback: `/version.json` checked when SW detection fails
- `vercel.json` sets `no-cache` headers on `version.json` and `sw.js`
- PWA icons: `pwa-icon-512.png` (any + maskable), `pwa-icon-128.png` — referenced in vite.config.ts manifest and index.html
