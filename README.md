# Venture Gain (beta)

A gamified health tracker for logging workouts, food, water, sleep, and energy, with a pixel-art companion that reacts to how your day is going.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)

**Live app:** [venture-gain.vercel.app](https://venture-gain.vercel.app)

## Overview

Venture Gain is a mobile-first web app built around five tabs: Workout, Food + Water, Overview, Sleep + Energy, and Log. Each signed-in user's daily logs, workouts, and goals are stored in Supabase. AI features (meal and workout estimation, photo scanning, and a chat assistant) go through small serverless proxies so API keys never reach the browser. Steps, sleep, cardio minutes, and calories burned can also be pulled from a Fitbit account through the Google Health API.

This is a TypeScript rewrite of [Venture_Gain](https://github.com/SummerPandey/Venture_Gain), an earlier Flutter prototype that set up the same tab layout and retro visual style.

## Features

- **Accounts:** email and password sign-up and sign-in with Supabase Auth, plus a first-run setup screen for goals and companion choice.
- **Workout:** log strength sets (reps and weight) or energy-only sessions, organize them by training category, mark rest days, and browse previous days. Weight converts when switching between kg and lbs, and the reps and weight fields accept quick expressions like `10+5`.
- **AI workout logging:** add exercises from a screenshot (Gemini), a voice note (browser speech recognition), or typed text, and chat with a coach. Personal records are detected automatically, and each session gets a short performance verdict.
- **Food + Water:** track water, calories, protein, and sugar against daily targets. Meals can be estimated from a photo, a voice note, or a text description. A pending scan survives a page reload, and a banner appears when the water or calorie goal is reached.
- **Sleep + Energy:** log sleep time and energy level with a weekly bar chart.
- **Overview:** the companion's mood (fired up, happy, tired, or resting) is computed from the day's workout, energy, sleep, water, and calories. Also shows a radar chart of the day's stats and per-exercise progress charts.
- **Log:** a monthly calendar of past days with a mini radar chart for each, exercise info lookups, and a chat box that can turn messages like "had two eggs and a protein shake" into log entries.
- **Fitbit sync:** optional read-only connection to the Google Health API for steps, sleep, cardio minutes, and calories burned.
- **Settings:** daily targets for water, calories, protein, and cardio, plus body weight, height, and companion sprite.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6 |
| Styling | Tailwind CSS 4, shadcn/ui (Radix UI), Lucide icons |
| Charts | Recharts |
| Auth and data | Supabase |
| AI | Groq (`openai/gpt-oss-120b`) for text, Google Gemini for images |
| Health data | Google Health API (Fitbit) |
| Hosting | Vercel (static build plus serverless functions in `api/`) |

## Getting started

### Prerequisites

- Node.js and npm
- A Supabase project with `user_profiles`, `daily_logs`, and `workout_entries` tables (the schema is not included in this repo)
- Groq and Gemini API keys for the AI features

### Install and run

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # starts the Vite dev server
```

Other scripts:

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

During development, `vite.config.ts` adds middleware that mirrors each function in `api/`, so the AI and Fitbit features work under `npm run dev` without the Vercel CLI.

### Environment variables

See [`.env.example`](.env.example) for details on each one.

| Variable | Used by |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser (Supabase client) |
| `VITE_SUPABASE_ANON_KEY` | Browser (Supabase client) |
| `GROQ_API_KEY` | Server only (`api/groq.ts`) |
| `GEMINI_API_KEY` | Server only (`api/gemini.ts`) |
| `GOOGLE_HEALTH_CLIENT_ID` | Server only (`api/google-health-*`) |
| `GOOGLE_HEALTH_CLIENT_SECRET` | Server only (`api/google-health-*`) |
| `GOOGLE_HEALTH_REFRESH_TOKEN` | Server only (`api/google-health-*`) |
| `VITE_GOOGLE_HEALTH_CLIENT_ID` | Browser (builds the Google consent link) |

Only the `VITE_` variables are bundled into the client. Set the same variables in the Vercel project settings for production.

### Connecting Fitbit (optional)

The Fitbit integration is set up for a single account and stores its refresh token in an environment variable rather than a database.

1. In Google Cloud Console, create an OAuth 2.0 Client ID of type "Web application".
2. Under Data Access, add these read-only scopes:
   - `googlehealth.activity_and_fitness.readonly`
   - `googlehealth.sleep.readonly`
   - `googlehealth.health_metrics_and_measurements.readonly`
3. Add `<your-origin>/api/google-health-callback` as an authorized redirect URI.
4. Set `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, and `VITE_GOOGLE_HEALTH_CLIENT_ID`.
5. Open Settings in the app and use the Connect button. After you approve access, the callback page shows a refresh token once.
6. Copy it into `GOOGLE_HEALTH_REFRESH_TOKEN` (in `.env.local` and/or Vercel) and restart or redeploy.

While the OAuth app is in Google's "Testing" mode, refresh tokens expire after about seven days, so step 5 has to be repeated periodically. Reconnect again if you add a scope later.

## Project structure

```
api/                    Vercel serverless functions (Groq, Gemini, Google Health proxies)
public/                 Favicon, logo, and static images
src/
  app/
    App.tsx             App shell, tab navigation, settings sheet
    components/
      auth/             Sign-in and sign-up page
      features/         One folder per tab (workout, nutrition, overview, sleep, log)
      shared/           Shared UI pieces such as PixelBar
      ui/               shadcn/ui components
  constants/            Targets, training categories, and level values
  contexts/             Auth, health data, and user settings providers
  hooks/                Per-tab state and Supabase persistence
  lib/                  API clients (Supabase, Groq, Gemini, Google Health) and helpers
  styles/               Tailwind setup, theme, and fonts
  types/                Shared TypeScript types
vite.config.ts          Vite config plus dev-only API middleware
vercel.json             Vercel build settings
```

## Related

- [Venture_Gain](https://github.com/SummerPandey/Venture_Gain): the original Flutter prototype of this app.
