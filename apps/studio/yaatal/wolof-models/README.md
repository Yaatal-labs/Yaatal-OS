# Yaatal Wolof Models

Wolof TTS and STT models for Yaatal-Studio. These are Yaatal's IP — fine-tuned from permissively-licensed base models.

## TTS (Text-to-Speech)

### Base models (permissively licensed)
- `bilalfaye/speecht5_tts-wolof` — MIT, SpeechT5 fine-tuned for Wolof, 1.3k downloads
- `Moustapha91/TTS_WOLOF_FINAL` — MIT, SpeechT5, loss 0.3705

### Training plan
1. Start from `bilalfaye/speecht5_tts-wolof` (MIT)
2. Collect Yaatal's Wolof speech data (target: 5-10 hours of high-quality recordings)
3. Fine-tune with custom Wolof tokenizer
4. Export to ONNX for edge deployment (Piper-style)

## STT (Speech-to-Text)

### Base models (permissively licensed)
- `cifope/whisper-small-wolof` — Apache 2.0, Whisper-small on FLEURS, WER 0.92 (needs improvement)

### Training plan
1. Start from `cifope/whisper-small-wolof` (Apache 2.0)
2. Fine-tune on Yaatal's Wolof speech corpus
3. Target WER < 0.30 (current 0.92 is too high for production)
4. Export as CTranslate2 format for Faster-Whisper inference

## Voice cloning (Wolof)

### Engine: GPT-SoVITS (MIT)
- 1 minute of Wolof audio → cloned voice
- Few-shot cloning works for any language
- Repository: https://github.com/RVC-Boss/GPT-SoVITS

### Engine: OpenVoice (MIT)
- Cross-lingual voice cloning
- Clone a Wolof speaker's voice, apply to any TTS output
- Repository: https://github.com/myshell-ai/OpenVoice

## License

All models in this directory are © Yaatal Labs, unless otherwise noted in subdirectories.
Base models retain their original licenses (MIT/Apache 2.0).