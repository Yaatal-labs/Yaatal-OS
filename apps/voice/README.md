# Yaatal voice (prototype)

Talk through what you want to build, in French. The agent asks one question at a time, then hands a
build brief to the Playground (the Yaatal OS) as an **Ouvrir dans le Playground** button. The brief is
never read aloud.

Off-the-shelf parts on Cloudflare's agents voice pipeline (`withVoice`, WebSocket, barge-in):

| Part | Now | Target after the post-tuning bake-off |
| --- | --- | --- |
| Ears | Workers AI Nova-3, `language: "fr"` | Qwen3-Omni / Nemotron VoiceChat; Wolof ears (Nemotron ASR) |
| Brain | Yaatal API, `VOICE_MODEL` (default `yaatal/llama-3.3-70b`, no reasoning phase) | same API, any upstream |
| Mouth | Workers AI MeloTTS, French | Qwen3-Omni talker |

The brain goes through the Yaatal API, so every turn is metered in FCFA like any other call. Use a
model without a reasoning phase: a reasoning model spends its token budget before it speaks.

## Run locally

```sh
pnpm install
printf 'YAATAL_API_KEY=%s\n' "yk_..." > .dev.vars   # a Yaatal key; the Yaatal API must be running
pnpm dev                                             # http://localhost:5173
pnpm check && pnpm test                              # types, and the brief/stream tests
```

`YAATAL_API_URL`, `VOICE_MODEL` and `PLAYGROUND_URL` are in `wrangler.jsonc`. Workers AI needs
`wrangler login`.
