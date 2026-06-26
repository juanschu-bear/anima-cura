# AnimaSign Call Agent

Outbound reminder agent for patients who submitted the AnimaSign anamnesis form but have not used the Anima Cura portal yet.

## Files

- `animasign_call_agent.py`: Pipecat outbound call runner
- `requirements.txt`: Python dependencies for this agent

## Backend endpoints

This agent expects these authenticated endpoints on the Anima Cura app:

- `GET /api/anima-sign/call-queue`
- `POST /api/anima-sign/call-status`

Both use `CALL_AGENT_TOKEN` via `x-api-token` or `Authorization: Bearer ...`.

## Environment

```env
ANIMACURA_API_URL=https://animacura.io
CALL_AGENT_TOKEN=replace-me
DAILY_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ANTHROPIC_API_KEY=
ELEVENLABS_VOICE_ID=pFZP5JQG7iQjIQuC4Bku
CALL_AGENT_MAX_ATTEMPTS=3
CALL_AGENT_RETRY_AFTER_MINUTES=240
```

## Run

```bash
cd anima-cura/call-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python animasign_call_agent.py
```
