# Wolof model inventory — third-party HF models (the fallback lane)

*Moved out of the README (2026-07-10); this is reference material, not the plan.
Yaatal's plan of record is the in-house models — see the README's
"AI models: target vs current" section. Re-verify licenses/downloads before use.*

Verified against the HuggingFace API (July 2026):

### TTS (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `bilalfaye/speecht5_tts-wolof` | **MIT** ✅ | 5.5K | SpeechT5 fine-tuned for Wolof, custom tokenizer |
| `bilalfaye/speecht5_tts-wolof-v0.2` | MIT ✅ | 1.2K | v0.2, wo+fr |
| `Moustapha91/TTS_WOLOF_FINAL` | **MIT** ✅ | 2 | SpeechT5, loss 0.3705 |
| `galsenai/parler-tts-mini-v1-wolof` | ⚠️ No license | 125 | ParlerTTS, 877M params |
| `aliounetoure1/spark-tts-wolof-men-v1` | ⚠️ No license | 30 | Spark TTS, male voice |
| `aliounetoure1/spark-tts-wolof-women-v1` | ⚠️ No license | 31 | Spark TTS, female voice |

### STT / ASR (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `cifope/whisper-small-wolof` | **Apache 2.0** ✅ | 917 | Whisper-small on FLEURS, WER 0.92 (needs improvement) |
| `speechbrain/asr-wav2vec2-dvoice-wolof` | **Apache 2.0** ✅ | 926 | SpeechBrain dVoice (license verified July 2026) |
| `BenDaouda/wav2vec2-large-xls-r-1b-wolof-VoiceToText` | ⚠️ No license | 128 | Wav2Vec2-XLS-R-1B |
| `BenDaouda/wav2vec2-large-xls-wolof-asr` | ⚠️ No license | 106 | Wav2Vec2-large |
| `kingabzpro/wav2vec2-large-xlsr-53-wolof` | ⚠️ No license | 175 | Wav2Vec2-XLSR-53 |
| `abdouaziiz/wav2vec2-xls-r-300m-wolof-lm` | ⚠️ No license | 63 | With LM head |

**Only models with explicit MIT/Apache licenses are safe for commercial use.**
Models with no license field are "all rights reserved" by default. Yaatal's
path: start from `bilalfaye/speecht5_tts-wolof` (MIT) for TTS and
`cifope/whisper-small-wolof` (Apache 2.0) or
`speechbrain/asr-wav2vec2-dvoice-wolof` (Apache 2.0) for STT, then fine-tune
on Yaatal's Wolof data.
