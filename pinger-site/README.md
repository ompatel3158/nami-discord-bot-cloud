# Nami Pinger Site

Vercel-hosted page plus an always-on background scheduler.

## How It Works

- The website is deployed on Vercel.
- Automatic pinging runs from GitHub Actions every 5 minutes.
- Each scheduled run waits a random 1-10 seconds before sending a request.
- The schedule is defined in `.github/workflows/ping-render.yml`.

## Target URL

- Default: `https://nami-discord-bot.onrender.com/health`
- Change `TARGET_URL` in `.github/workflows/ping-render.yml` if needed.

## Manual Test

Open the Vercel site and click **Send Manual Ping** to call `/api/cron-ping` immediately.

## Deploy To Vercel

```bash
cd pinger-site
npx vercel deploy --prod --yes
```

## Enable Automatic Pings

Push this repository to GitHub. The workflow in `.github/workflows/ping-render.yml` runs automatically.
