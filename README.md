# VentureGain 🔥

A gamified personal health tracker PWA — log workouts, nutrition, sleep, and energy, and watch a Chimchar companion react to how well you're actually taking care of yourself.

**Live app:** [venture-gain.vercel.app](https://venture-gain.vercel.app)

## What it does

VentureGain turns daily health tracking into something you actually want to open. A Chimchar companion's mood — fired up, happy, tired, or resting — is computed live from your real logged data across workouts, energy, sleep, and hydration, so the app reflects how your day is actually going instead of just storing numbers.

- **Workout & Energy** — log cardio, strength sessions, and energy levels; hit cardio targets and get a celebration banner
- **Food & Water** — track water, calories, protein, and sugar against daily goals, with an AI photo-scan flow (powered by Gemini vision) that estimates nutrition from a picture of your meal
- **Sleep & Energy** — log sleep hours and see how rest feeds into your overall score
- **Overview** — the Chimchar companion, a radar chart of your stats, and a streak counter
- **Log** — a chat-style log for freeform entries

Goal celebrations fire automatically when you cross a threshold (3L water, 2500 cal, 170g protein, 120 min cardio) and clear themselves a couple seconds later — no dismiss button needed.

## Tech stack

| | |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 |
| Styling | Tailwind CSS v4, custom theme (`theme.css`) |
| Charts | Recharts (bar / line / radar) |
| Icons | Lucide React |
| Components | shadcn/ui (Radix primitives) |
| AI vision | Google Gemini, via a server-side proxy |
| Backend | Supabase |
| Hosting | Vercel |

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build to dist/
```

Copy `.env.example` to `.env.local` and fill in the required keys before running the AI photo-scan or Supabase-backed features.

## Project structure

```
src/
  app/
    App.tsx                        # Root shell, 5-tab bottom nav
    components/
      features/
        workout/WorkoutTab.tsx     # Workout & Energy tab
        nutrition/FoodWaterTab.tsx # Food & Water tab
        overview/OverviewTab.tsx   # Overview + Chimchar companion
        sleep/SleepTab.tsx         # Sleep & Energy tab
        log/LogTab.tsx             # Log tab
      shared/PixelBar.tsx          # Reusable progress bar
      ui/                          # shadcn components
  hooks/                           # Per-tab state (useWorkout, useNutrition, useSleep, useLog)
  store/healthSnapshot.ts          # Cross-tab bridge that feeds the Chimchar mood system
  constants/                       # Targets, limits, level boosts, theme values
  types/                           # TypeScript interfaces per feature
  styles/theme.css                 # Custom CSS: cards, animations, mood filters
```

## Design system

| Role | Color |
|---|---|
| Background | `#F5E6D3` |
| Primary text | `#6B4423` |
| Secondary text | `#8B5A3E` / `#A0725A` |
| Accent | `#FF9F66` / `#FFB88A` |
| Water | `#7BAFD4` |
| Calories | `#E8956A` |
| Protein | `#C4A45A` |
| Sugar | `#C4809A` |
| Vitamins | `#8BAF8C` |

Deployed as a PWA — add it to your phone's home screen for the full app-like experience.
