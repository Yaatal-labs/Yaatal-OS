// Yaatal voice: talk through what you want to build, in French, and get a build brief you can open in
// the Playground. Off-the-shelf prototype on Cloudflare's agents voice pipeline:
//   ears  Workers AI Nova-3 (French)      mouth  Workers AI MeloTTS (French)
//   brain the Yaatal API (OpenAI-compatible), so every voice turn is metered in FCFA like any other call.
// The target models (Qwen3-Omni, Nemotron VoiceChat) replace these parts after the post-tuning bake-off.
import { Agent, routeAgentRequest, type Connection } from "agents";
import { withVoice, WorkersAINova3STT, type TTSProvider, type VoiceTurnContext } from "agents/voice";
import { BRIEF_MARKER, chatDeltas, speakAndCaptureBrief } from "./stream.ts";

export interface Env {
  AI: Ai;
  YaatalVoice: DurableObjectNamespace;
  YAATAL_API_URL: string;
  YAATAL_API_KEY?: string;
  VOICE_MODEL: string;
  PLAYGROUND_URL: string;
}

const SYSTEM_PROMPT = `Tu es l'assistant vocal de Yaatal, une plateforme de Dakar où l'on construit des sites, des outils, des assistants WhatsApp et des objets connectés avec des agents d'IA.

Tu parles, tu n'écris pas : réponds en français, en une ou deux phrases courtes, sans liste, sans markdown, sans émoji.

Ton rôle : aider la personne à décrire ce qu'elle veut construire. Pose une seule question à la fois : quoi, pour qui, et les détails qui manquent (nom de la boutique, produits, langue, numéro WhatsApp). Ne donne jamais de prix ni de stock que la personne n'a pas donnés. Tu ne gères aucun paiement.

Quand tu as assez d'informations, dis en une phrase que c'est prêt, puis ajoute une dernière ligne qui commence par ${BRIEF_MARKER} suivie d'une consigne complète, en français, pour l'agent qui va construire. Cette ligne ne sera pas lue à voix haute.`;

/** French speech from Workers AI MeloTTS. Returns MP3, which is the voice pipeline's default format. */
export class MeloFrenchTTS implements TTSProvider {
  constructor(private readonly ai: Ai) {}

  async synthesize(text: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const response = (await this.ai.run(
      "@cf/myshell-ai/melotts",
      { prompt: text, lang: "fr" },
      { returnRawResponse: true, ...(signal ? { signal } : {}) },
    )) as unknown as Response;
    if (!response.ok) return null;
    if ((response.headers.get("content-type") ?? "").includes("json")) {
      // Some deployments answer {"result":{"audio":"<base64 mp3>"}} instead of raw audio.
      const body = (await response.json()) as { audio?: string; result?: { audio?: string } };
      const b64 = body.result?.audio ?? body.audio;
      return b64 ? base64ToArrayBuffer(b64) : null;
    }
    return await response.arrayBuffer();
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const VoiceAgent = withVoice(Agent);

export class YaatalVoice extends VoiceAgent<Env> {
  transcriber = new WorkersAINova3STT(this.env.AI, { language: "fr" });
  tts = new MeloFrenchTTS(this.env.AI);

  beforeCallStart(connection: Connection): boolean {
    if (this.env.YAATAL_API_KEY) return true;
    connection.send(JSON.stringify({ type: "error", message: "La clé de l'API Yaatal n'est pas configurée." }));
    return false;
  }

  async onTurn(transcript: string, context: VoiceTurnContext) {
    const response = await fetch(`${this.env.YAATAL_API_URL.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      signal: context.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.env.YAATAL_API_KEY}` },
      body: JSON.stringify({
        model: this.env.VOICE_MODEL,
        stream: true,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...context.messages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 402
        ? "Votre solde Yaatal est épuisé. Rechargez-le pour continuer."
        : "Je n'arrive pas à joindre le modèle pour le moment. Réessayez dans un instant.";
    }
    const playground = this.env.PLAYGROUND_URL.replace(/\/+$/, "");
    return speakAndCaptureBrief(chatDeltas(response), brief => {
      context.connection.send(JSON.stringify({
        type: "playground_brief",
        brief,
        url: `${playground}/?prompt=${encodeURIComponent(brief)}`,
      }));
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
