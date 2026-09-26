# Yaatal voice (prototype)

Talk through what you want to build, in French. The agent asks one question at a time, then hands a
build brief to the Playground (the Yaatal OS) as an **Ouvrir dans le Playground** button. The brief is
never read aloud.

Off-the-shelf parts on Cloudflare's agents voice pipeline (`withVoice`, WebSocket, barge-in):

| Part | Now | Target after the post-tuning bake-off |
| --- | --- | --- |
| Ears | Workers AI Nova-3, `language: "fr"` | Qwen3-Omni / Nemotron VoiceChat; Wolof ears (Nemotron ASR) |
| Brain | Yaatal API, `VOICE_MODEL` (default `yaatal/nemotron-3-super`, thinking off) | same API, any upstream |
| Mouth | Workers AI MeloTTS, French | Qwen3-Omni talker |

The brain goes through the Yaatal API, so every turn is metered in FCFA like any other call. Voice
turns ask for `chat_template_kwargs.enable_thinking: false`: a reasoning model otherwise spends its
token budget thinking before it speaks. With thinking off, Workers AI streams Nemotron's answer in
the `reasoning` field, so `VOICE_REASONING_IS_ANSWER=true` reads it from there; leave it unset for
other models so their private reasoning is never spoken. Markdown, emoji and links are stripped
before speech.

## Run locally

```sh
pnpm install
printf 'YAATAL_API_KEY=%s\n' "yk_..." > .dev.vars   # a Yaatal key; the Yaatal API must be running
pnpm dev                                             # http://localhost:5173
pnpm check && pnpm test                              # types, and the brief/stream tests
```

`YAATAL_API_URL`, `VOICE_MODEL` and `PLAYGROUND_URL` are in `wrangler.jsonc`. Workers AI needs
`wrangler login`.
