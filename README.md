# Kaam Sakhi — WhatsApp AI Agent for Gig Workers

A real (not a demo) WhatsApp bot that onboards gig workers in Hindi/regional languages,
understands both typed and voice-note messages, and answers their questions afterwards —
built on the flow from the two HTML mockups.

I can't click "deploy" on your behalf (I don't have a Twilio/hosting account of my own),
but everything below is copy-paste — about 15 minutes, no coding needed.

## What it does
- Greets a worker on WhatsApp, asks their language (Hindi/English/Kannada/Tamil/Telugu/Marathi/Bengali)
- Runs the onboarding chat: name → city → languages spoken → hometown → current work/platform
- Accepts **voice notes**, transcribes them, and replies in text (voice-note *replies* are a
  possible next step — see "What's not included" below)
- After onboarding, acts as an ongoing assistant for gig-work questions (safety, schemes like
  e-Shram/PM-JAY, dealing with delivery/ride apps, etc.)
- Remembers each person's conversation while the server is running
- **Saves each completed onboarding as a row in a Google Sheet** (name, city, languages,
  hometown, work platform, work city, phone number, timestamp) — this is your lead list

## What you need (all free to start)
1. An **Anthropic API key** — console.anthropic.com → API Keys
2. A **Twilio account** (free trial) — console.twilio.com → activate the WhatsApp Sandbox
   (Messaging → Try it out → Send a WhatsApp message). This gives you a test WhatsApp number
   immediately, no Meta business approval needed.
3. *(Optional, for voice notes)* an **OpenAI API key** — platform.openai.com, used only for
   Whisper speech-to-text. Skip this and the bot will just ask voice-note senders to type instead.
4. A place to host it — **Railway** or **Render** both have free tiers and deploy straight from
   a GitHub repo in a couple of clicks.

## Step-by-step

### 1. Push this folder to GitHub
Create a new empty GitHub repo and push these files to it (or upload them directly from the
GitHub web UI — no git command line needed).

### 2. Deploy it
- **Railway**: railway.app → New Project → Deploy from GitHub repo → pick your repo.
- **Render**: render.com → New → Web Service → connect your repo → Build command `npm install`,
  Start command `npm start`.

Either way, add these environment variables in the platform's dashboard (from `.env.example`):
`ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `OPENAI_API_KEY` if using voice.
Add `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET` too if you set up lead capture in step 2b below (do
that first if you want it wired in before you deploy).

Deploy. You'll get a public URL like `https://kaam-sakhi.up.railway.app`.

### 2b. Set up the lead-capture Google Sheet (optional but recommended)
Many Google Workspace orgs block creating service-account key files (`disableServiceAccountKeyCreation`
policy) — you don't need one at all. Instead, this uses a small Apps Script "web app" that lives
inside the Sheet itself, which is unaffected by that policy:

1. Create a blank Google Sheet. Add a header row: `Timestamp | Phone | Name | City | Languages | Hometown | Work Platform | Work City`.
2. In that Sheet, go to **Extensions → Apps Script**. Delete the placeholder code and paste in
   the contents of `apps-script.gs` from this project.
3. In the pasted code, change `SHARED_SECRET` to your own random string (anything unguessable —
   this is what stops a stranger from writing junk rows into your sheet if they ever find the URL).
4. Click **Deploy → New deployment**. Type: **Web app**. Execute as: **Me**. Who has access:
   **Anyone**. Click Deploy, and authorize it when prompted (it'll warn "Google hasn't verified
   this app" — that's expected since it's your own script; click Advanced → Go to [project] (unsafe)).
5. Copy the deployment URL (ends in `/exec`) → this is `APPS_SCRIPT_URL`.
6. The random string you set in step 3 → this is `APPS_SCRIPT_SECRET`.

Every time someone finishes onboarding, a new row appears in this sheet automatically. If you ever
edit `apps-script.gs`, you'll need to create a new deployment (or "Manage deployments" → edit the
existing one) for the change to take effect.

### 3. Connect Twilio to your server
In the Twilio console → Messaging → Try it out → WhatsApp Sandbox Settings:
- Set **"WHEN A MESSAGE COMES IN"** to `https://YOUR-URL/whatsapp/incoming`, method `POST`.
- Save.

### 4. Test it
On your own phone, WhatsApp the Twilio sandbox number the `join <your-code>` message shown on
that same settings page (one-time, per phone number, this is a Twilio sandbox requirement).
Then just message "Hi" — Kaam Sakhi should reply within a couple of seconds.

## Going live beyond the sandbox
The Twilio Sandbox only replies to numbers that sent it the `join` code — good for testing, not
for real workers. To message anyone: in Twilio, apply for a **WhatsApp Business Profile** (or use
Meta's Cloud API directly) with your own business-verified number. No code changes needed, just
swap the sandbox number for your approved one.

## What's not included (intentionally, to keep this simple to stand up)
- **Voice replies**: the bot currently replies in text even to voice notes. Adding this back means
  wiring up a text-to-speech API (e.g. ElevenLabs or OpenAI TTS) and sending Twilio a `MediaUrl`
  instead of `Message` text — happy to add this next if you want the full voice experience.
- **Persistent conversation memory**: the live back-and-forth is still in RAM and resets if the
  server restarts mid-conversation — but the *finished* profile is now safely saved to your Google
  Sheet the moment onboarding completes, so a restart no longer loses a completed lead, only an
  in-progress chat. Swap the `sessions` Map for Redis or a DB table if you also want in-progress
  chats to survive restarts.

## Files
- `server.js` — the whole bot (Express webhook + Claude + optional Whisper transcription)
- `apps-script.gs` — paste into your Google Sheet's Script Editor for lead capture (no GCP/service account needed)
- `package.json` — dependencies
- `.env.example` — copy to `.env` locally, or paste into your host's env var settings
- `Procfile` — tells Render/Railway/Heroku how to start the app
