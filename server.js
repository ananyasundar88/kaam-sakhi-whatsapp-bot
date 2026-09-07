require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY; // optional, used only for voice-note transcription
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || 'claude-haiku-4-5-20251001';

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;
const SHEETS_CONFIGURED = !!(APPS_SCRIPT_URL && APPS_SCRIPT_SECRET);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Very simple in-memory session store ---------------------------------
// Key: WhatsApp number (e.g. "whatsapp:+91xxxxxxxxxx")
// Value: { history: [{role, content}] }
// NOTE: this resets whenever the server restarts. For real production use,
// swap this for Redis, a Postgres table, or even a JSON file — see README.
const sessions = new Map();
const MAX_HISTORY_MESSAGES = 24; // keep last ~12 turns so the API call stays cheap & fast

const SYSTEM_PROMPT = `You are "Kaam Sakhi" (काम सखी) — a warm, respectful WhatsApp companion for gig
and informal-sector workers in India (delivery riders, cab/auto drivers, domestic workers,
construction and factory workers, etc). Most users have basic literacy and are more comfortable
speaking than typing long messages, so keep every message SHORT, simple, and in plain everyday
words — no corporate jargon, no long paragraphs. Use a warm, encouraging, non-judgemental tone,
like a helpful elder sister ("didi"). Use a few emojis for warmth, not decoration.

LANGUAGE: Default to Hindi in Devanagari script. If the very first message doesn't tell you the
user's language, greet them and ask them to reply with a number for their language:
1 हिंदी  2 English  3 ಕನ್ನಡ Kannada  4 தமிழ் Tamil  5 తెలుగు Telugu  6 मराठी Marathi  7 বাংলা Bengali.
Once they pick, continue the ENTIRE conversation in that language (script included) unless they
switch languages themselves. If they type in Hinglish (Roman script Hindi), reply in Hindi
Devanagari script — that is what these users actually read most comfortably.

ONBOARDING FLOW (do this once per new user, one question at a time, never ask two things in one
message, never re-ask something already answered earlier in this chat):
  1. Ask their name.
  2. Ask which city they currently live in.
  3. Ask which languages they can speak.
  4. Ask where they are originally from (hometown / native place).
  5. Ask what work they currently do and on which app/platform (e.g. Swiggy, Zomato, Uber, Ola,
     Urban Company, domestic work, construction, etc) and in which city they work.
  After all 5 are answered, send ONE warm confirmation message that recaps what you learned as a
  short bullet list in their language, then tell them to download the Kaam Sakhi app at
  kaamsakhi.app/download to start learning, and congratulate them with something like
  "🏅 Badge unlocked — Kaam Shuru! पहला कदम पूरा हुआ।"

AFTER ONBOARDING: act as an ongoing helpful assistant for gig workers — answer questions about
safety, fair pay, dealing with delivery/ride apps, government welfare schemes relevant to
unorganised/gig workers (e.g. e-Shram card, PM-JAY, PM Suraksha Bima Yojana, state labour welfare
boards), basic financial literacy, and general life/work stress support. If a question needs a
human or official source (legal, medical, or urgent safety issue), say so clearly and suggest they
contact the right helpline or official instead of guessing.

Never claim to be a human. Never ask for sensitive financial information (bank OTPs, card numbers,
passwords) — if someone offers these, gently warn them this is unsafe to share over chat.
Keep replies under ~60 words unless the user clearly wants a longer explanation.`;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

async function transcribeVoiceNote(mediaUrl) {
  if (!OPENAI_KEY) return null;
  try {
    const audioRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      auth: { username: TWILIO_SID, password: TWILIO_AUTH },
    });
    const form = new FormData();
    form.append('file', Buffer.from(audioRes.data), { filename: 'voice.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${OPENAI_KEY}` },
      maxBodyLength: Infinity,
    });
    return (res.data && res.data.text) ? res.data.text.trim() : null;
  } catch (err) {
    console.error('Transcription failed:', err.response?.data || err.message);
    return null;
  }
}

// --- Lead capture: extract completed profile + save to Google Sheets ------

const EXTRACTION_SYSTEM_PROMPT = `You will see a WhatsApp conversation between "Kaam Sakhi" (the
assistant) and a gig worker (the user), possibly in Hindi or another Indian language. Decide
whether the USER has, at some point in the conversation, shared ALL five of: (1) their name,
(2) the city they currently live in, (3) languages they speak, (4) their hometown/native place,
(5) their current work and which platform/city they work in.

If ALL five have been shared, respond with ONLY this compact JSON, translating every value into
simple English, and nothing else — no markdown, no explanation:
{"complete":true,"name":"...","city":"...","languages":"...","hometown":"...","work_platform":"...","work_city":"..."}

If any are missing, respond with ONLY: {"complete":false}`;

async function extractProfileIfComplete(history) {
  const convoText = history
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  try {
    const res = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 300,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: convoText }],
    });
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('Profile extraction failed:', err.message);
    return { complete: false };
  }
}

async function appendLeadToSheet(phone, profile) {
  if (!SHEETS_CONFIGURED) {
    console.warn('Apps Script lead capture not configured — skipping. See .env.example.');
    return;
  }
  try {
    await axios.post(APPS_SCRIPT_URL, {
      secret: APPS_SCRIPT_SECRET,
      phone,
      name: profile.name || '',
      city: profile.city || '',
      languages: profile.languages || '',
      hometown: profile.hometown || '',
      work_platform: profile.work_platform || '',
      work_city: profile.work_city || '',
    });
    console.log(`Saved lead for ${phone} to Google Sheet.`);
  } catch (err) {
    console.error('Apps Script append failed:', err.response?.data || err.message);
  }
}

app.post('/whatsapp/incoming', async (req, res) => {
  try {
    const from = req.body.From; // "whatsapp:+91xxxxxxxxxx"
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    let userText = (req.body.Body || '').trim();

    if (numMedia > 0) {
      const contentType = req.body.MediaContentType0 || '';
      if (contentType.startsWith('audio/')) {
        const transcript = await transcribeVoiceNote(req.body.MediaUrl0);
        if (transcript) {
          userText = transcript;
        } else {
          const reply = OPENAI_KEY
            ? 'माफ़ कीजिए, आपकी वॉइस नोट अभी सुन नहीं पाई। कृपया दोबारा भेजें या टाइप करें। 🙏'
            : 'अभी वॉइस नोट नहीं सुन पा रही, कृपया टाइप करके भेजें। 🙏';
          return res.type('text/xml').send(twiml(reply));
        }
      }
    }

    if (!userText) {
      return res.type('text/xml').send(
        twiml('माफ़ कीजिए, मुझे कुछ समझ नहीं आया। कृपया टेक्स्ट या वॉइस नोट भेजें। 🙏')
      );
    }

    if (!sessions.has(from)) sessions.set(from, { history: [], saved: false });
    const session = sessions.get(from);

    session.history.push({ role: 'user', content: userText });
    if (session.history.length > MAX_HISTORY_MESSAGES) {
      session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
    }

    let replyText;
    try {
      const completion = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: session.history,
      });
      replyText = completion.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    } catch (err) {
      console.error('Anthropic error:', err.message);
      replyText = 'माफ़ कीजिए, अभी थोड़ी दिक्कत हो रही है। कृपया थोड़ी देर बाद कोशिश करें। 🙏';
    }

    session.history.push({ role: 'assistant', content: replyText });

    // Once the user has had enough turns to plausibly have answered all 5
    // onboarding questions, check whether the profile is complete and, if so,
    // save it — but only once per session.
    const userTurns = session.history.filter((m) => m.role === 'user').length;
    if (!session.saved && userTurns >= 5 && SHEETS_CONFIGURED) {
      extractProfileIfComplete(session.history).then((profile) => {
        if (profile.complete) {
          session.saved = true;
          appendLeadToSheet(from, profile);
        }
      });
    }

    res.type('text/xml').send(twiml(replyText));
  } catch (err) {
    console.error('Webhook error:', err);
    res.type('text/xml').send(twiml('कुछ गड़बड़ हो गई, कृपया दोबारा भेजें। 🙏'));
  }
});

app.get('/', (req, res) => {
  res.send('Kaam Sakhi WhatsApp bot is running ✅');
});

app.listen(PORT, () => console.log(`Kaam Sakhi listening on port ${PORT}`));
