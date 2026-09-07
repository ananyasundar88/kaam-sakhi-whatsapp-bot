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
Add `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` too if you set up lead
capture in step 3 below (do that first if you want it wired in before you deploy).

Deploy. You'll get a public URL like `https://kaam-sakhi.up.railway.app`.

### 2b. Set up the lead-capture Google Sheet (optional but recommended)
1. Create a blank Google Sheet. Add a header row: `Timestamp | Phone | Name | City | Languages | Hometown | Work Platform | Work City`.
2. Copy the Sheet ID out of its URL (the long string between `/d/` and `/edit`) → this is `GOOGLE_SHEET_ID`.
3. In [Google Cloud Console](https://console.cloud.google.com), create a project (or use an
   existing one), enable the **Google Sheets API**, then create a **Service Account** under
   IAM & Admin → Service Accounts.
4. Open that service account → Keys → Add Key → JSON. This downloads a JSON file — open it, you
   need two fields from it:
   - `client_email` → this is `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is `GOOGLE_PRIVATE_KEY` (paste the whole thing, `-----BEGIN...` and all)
5. Back in your Google Sheet, click **Share** and give that same `client_email` **Editor** access.
   (This step is easy to miss — without it, every save will silently fail.)

Every time someone finishes onboarding, a new row appears in this sheet automatically.

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
- `package.json` — dependencies
- `.env.example` — copy to `.env` locally, or paste into your host's env var settings
- `Procfile` — tells Render/Railway/Heroku how to start the app
