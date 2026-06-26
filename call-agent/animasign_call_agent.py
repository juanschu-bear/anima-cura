"""
AnimaSign Call Agent - Pipecat Outbound Reminder
Calls patients who submitted their Anamnesebogen but haven't logged in yet.
Deploys alongside the ANIMA Core call stack.
"""

import asyncio
import os
from datetime import datetime

import aiohttp

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.services.daily import DailyParams, DailyTransport

ANIMACURA_API = os.getenv("ANIMACURA_API_URL", "https://animacura.io")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "pFZP5JQG7iQjIQuC4Bku")

SYSTEM_PROMPTS = {
    "de": """Du bist die freundliche Praxis-Assistentin der KFO-Praxis Dr. Maria Elena Schubert in Leipzig.
Du rufst Patienten an, die gerade ihren Anamnesebogen ausgefüllt haben.

Dein Ziel:
- Den Patienten freundlich daran erinnern, dass ein persönlicher App-Zugang für sie erstellt wurde
- Erklären, dass sie eine E-Mail mit einem Link zu ihren Zugangsdaten erhalten haben
- Bei Fragen zur App oder zur Praxis helfen
- Das Gespräch kurz und warm halten (max. 2 bis 3 Minuten)

Wichtige Infos:
- Die App heißt "Anima Cura"
- Dort finden sie Rechnungen, Dokumente, Behandlungsplan und Nachrichten
- Die Login-Daten stehen in der E-Mail, die sie erhalten haben
- Bei technischen Problemen: einfach in der Praxis anrufen unter 0341 246 67 40

Stil:
- Freundlich, warm, nicht aufdringlich
- Sprich den Patienten mit Vornamen an
- Wenn der Patient sagt, er hat sich schon eingeloggt: bedanke dich und beende das Gespräch
- Wenn er kein Interesse hat: respektiere das, erwähne kurz die Vorteile und verabschiede dich
- Halte dich kurz, maximal 3 Sätze pro Antwort

Der Patient heißt: {vorname} {nachname}
""",
    "en": """You are the friendly practice assistant of the KFO practice of Dr. Maria Elena Schubert in Leipzig.
You are calling patients who just filled out their intake form.

Your goal:
- Remind the patient that a personal app access was created for them
- Explain they received an email with a link to their login credentials
- Help with questions about the app or the practice
- Keep the call short and warm (max. 2 to 3 minutes)

Key info:
- The app is called "Anima Cura"
- It contains invoices, documents, treatment plans, and messages
- Login details are in the email they received
- For technical issues: call the practice at 0341 246 67 40

Style:
- Friendly, warm, not pushy
- Address the patient by first name
- If they already logged in: thank them and end the call
- If not interested: respect that, briefly mention benefits, and say goodbye
- Keep it short, max 3 sentences per response

The patient is: {vorname} {nachname}
""",
    "es": """Eres la asistente amable de la clínica de ortodoncia de la Dra. Maria Elena Schubert en Leipzig.
Llamas a pacientes que acaban de completar su formulario de anamnesis.

Tu objetivo:
- Recordarle al paciente que ya se creó su acceso personal a la app
- Explicar que recibió un correo con el enlace y sus datos de acceso
- Ayudar con preguntas sobre la app o la clínica
- Mantener la llamada breve y cálida (máximo 2 a 3 minutos)

Información importante:
- La app se llama "Anima Cura"
- Allí encuentran facturas, documentos, plan de tratamiento y mensajes
- Los datos de acceso están en el correo recibido
- Si hay problemas técnicos: llamar a la clínica al 0341 246 67 40

Estilo:
- Cercana, cálida y nada insistente
- Habla al paciente por su nombre
- Si ya inició sesión: agradécele y termina la llamada
- Si no tiene interés: respétalo, menciona brevemente las ventajas y despídete
- Mantén cada respuesta breve, máximo 3 frases

El paciente se llama: {vorname} {nachname}
""",
}


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


async def fetch_call_queue():
    """Fetch patients who need a reminder call."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{ANIMACURA_API}/api/anima-sign/call-queue",
            headers={"x-api-token": require_env("CALL_AGENT_TOKEN")},
        ) as response:
            response.raise_for_status()
            data = await response.json()
            return data.get("queue", [])


async def report_call_status(submission_id: str, status: str, duration: int = 0):
    """Report call outcome back to Anima Cura."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{ANIMACURA_API}/api/anima-sign/call-status",
            json={
                "submission_id": submission_id,
                "status": status,
                "duration_seconds": duration,
            },
            headers={
                "x-api-token": require_env("CALL_AGENT_TOKEN"),
                "Content-Type": "application/json",
            },
        ) as response:
            response.raise_for_status()


async def make_call(patient: dict):
    """Execute a single outbound call to a patient."""
    lang = patient.get("lang", "de")
    prompt_template = SYSTEM_PROMPTS.get(lang, SYSTEM_PROMPTS["de"])
    system_prompt = prompt_template.format(
        vorname=patient["vorname"],
        nachname=patient.get("nachname", ""),
    )

    transport = DailyTransport(
        "",
        None,
        patient["vorname"],
        DailyParams(
            api_key=require_env("DAILY_API_KEY"),
            dialin_settings=None,
            audio_out_enabled=True,
            audio_in_enabled=True,
        ),
    )

    stt = DeepgramSTTService(
        api_key=require_env("DEEPGRAM_API_KEY"),
        language=lang,
    )

    tts = ElevenLabsTTSService(
        api_key=require_env("ELEVENLABS_API_KEY"),
        voice_id=ELEVENLABS_VOICE_ID,
        model="eleven_multilingual_v2",
    )

    llm = AnthropicLLMService(
        api_key=require_env("ANTHROPIC_API_KEY"),
        model="claude-haiku-4-5-20251001",
    )

    context = OpenAILLMContext([{"role": "system", "content": system_prompt}])
    context_aggregator = llm.create_context_aggregator(context)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(pipeline, PipelineParams(allow_interruptions=True))
    runner = PipelineRunner()

    start_time = datetime.now()
    call_status = "not_reached"

    @transport.event_handler("on_joined")
    async def on_joined(transport, data):
        del transport, data
        await transport.send_dialout(patient["phone"])

    @transport.event_handler("on_dialout_answered")
    async def on_answered(transport, data):
        del transport, data
        nonlocal call_status
        call_status = "reached"
        greeting = (
            f"Hallo {patient['vorname']}, hier ist die Praxis Dr. Schubert. "
            "Wir haben deinen Anamnesebogen erhalten und wollten kurz Bescheid sagen, "
            "dass dein persönlicher Zugang zur Anima Cura App jetzt bereit ist. "
            "Hast du die E-Mail mit den Zugangsdaten schon gesehen?"
        )
        if lang == "en":
            greeting = (
                f"Hello {patient['vorname']}, this is Dr. Schubert's practice. "
                "We received your intake form and wanted to let you know that your personal "
                "Anima Cura app access is ready. Have you seen the email with your login details yet?"
            )
        elif lang == "es":
            greeting = (
                f"Hola {patient['vorname']}, te llama la clínica de la Dra. Schubert. "
                "Recibimos tu formulario y queríamos avisarte de que tu acceso personal a la app "
                "Anima Cura ya está listo. ¿Ya viste el correo con tus datos de acceso?"
            )
        await task.queue_frames([tts.create_text_frame(greeting)])

    @transport.event_handler("on_dialout_stopped")
    async def on_stopped(transport, data):
        del transport, data
        await task.queue_frames([EndFrame()])

    try:
        await runner.run(task)
    except Exception as exc:
        print(f"[CallAgent] Error calling {patient['vorname']}: {exc}")
        call_status = "failed"

    duration = int((datetime.now() - start_time).total_seconds())
    await report_call_status(patient["submission_id"], call_status, duration)
    print(f"[CallAgent] {patient['vorname']} {patient.get('nachname', '')}: {call_status} ({duration}s)")


async def run_call_queue():
    """Main loop: fetch queue, call each patient."""
    print("[CallAgent] Fetching call queue...")
    queue = await fetch_call_queue()
    print(f"[CallAgent] {len(queue)} patients to call")

    for patient in queue:
        if not patient.get("phone"):
            print(f"[CallAgent] Skipping {patient.get('vorname', 'Patient')} - no phone")
            continue
        print(
            f"[CallAgent] Calling {patient.get('vorname', 'Patient')} {patient.get('nachname', '')} "
            f"at {patient['phone']}"
        )
        await make_call(patient)
        await asyncio.sleep(5)

    print("[CallAgent] Queue complete")


if __name__ == "__main__":
    asyncio.run(run_call_queue())
