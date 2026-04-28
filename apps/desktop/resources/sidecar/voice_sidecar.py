"""
Auralith voice sidecar — unified STT and wake-word process.

Protocol: newline-delimited JSON on stdio.
  Main → Sidecar (stdin)  : {"module":"stt"|"wake"|"ping", "cmd":"...", ...}
  Sidecar → Main (stdout) : {"module":"stt"|"wake", "type":"...", ...}

STT commands:
  {"module":"stt","cmd":"load","model":"distil-small.en","device":"cpu","compute_type":"int8"}
  {"module":"stt","cmd":"transcribe","id":"<uuid>","audio_b64":"<base64-pcm16-16kHz>"}

Wake commands:
  {"module":"wake","cmd":"load","model_path":"<path>","threshold":0.5}
  {"module":"wake","cmd":"start"}
  {"module":"wake","cmd":"stop"}
  {"module":"wake","cmd":"chunk","audio_b64":"<base64-pcm16-16kHz>"}

Utility:
  {"module":"ping"}  →  {"module":"pong"}
"""

import sys
import json
import threading
import base64
import traceback

import numpy as np

# ── STT module ────────────────────────────────────────────────────────────────

class SttModule:
    def __init__(self):
        self._model = None
        self._lock = threading.Lock()

    def handle(self, msg: dict) -> None:
        cmd = msg.get("cmd")
        if cmd == "load":
            self._load(msg)
        elif cmd == "transcribe":
            self._transcribe(msg)
        else:
            _send({"module": "stt", "type": "error", "message": f"Unknown cmd: {cmd}"})

    def _load(self, msg: dict) -> None:
        try:
            from faster_whisper import WhisperModel
            model_name = msg.get("model", "base.en")
            device = msg.get("device", "cpu")
            compute_type = msg.get("compute_type", "int8")
            with self._lock:
                self._model = WhisperModel(model_name, device=device, compute_type=compute_type)
            _send({"module": "stt", "type": "ready", "model": model_name})
        except Exception as exc:
            _send({"module": "stt", "type": "error", "message": str(exc)})

    def _transcribe(self, msg: dict) -> None:
        req_id = msg.get("id", "")
        audio_b64 = msg.get("audio_b64", "")
        try:
            with self._lock:
                if self._model is None:
                    _send({"module": "stt", "type": "error", "id": req_id, "message": "Model not loaded"})
                    return
                model = self._model

            # Decode base64 PCM-16 → float32
            pcm_bytes = base64.b64decode(audio_b64)
            pcm16 = np.frombuffer(pcm_bytes, dtype=np.int16)
            audio = pcm16.astype(np.float32) / 32768.0

            # Silently skip near-silence (RMS < 0.01 ≈ -40 dBFS)
            if float(np.sqrt(np.mean(audio ** 2))) < 0.01:
                _send({"module": "stt", "type": "result", "id": req_id, "text": "", "words": []})
                return

            segments, _info = model.transcribe(
                audio,
                language="en",
                word_timestamps=True,
                vad_filter=True,
            )

            text_parts = []
            words = []
            for seg in segments:
                text_parts.append(seg.text.strip())
                if seg.words:
                    for w in seg.words:
                        words.append({"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})

            full_text = " ".join(text_parts).strip()

            # Filter known hallucinations
            HALLUCINATIONS = {"you", "thank you", "[blank_audio]", "[silence]", ".", ""}
            if full_text.lower() in HALLUCINATIONS:
                full_text = ""

            _send({"module": "stt", "type": "result", "id": req_id, "text": full_text, "words": words})
        except Exception as exc:
            _send({"module": "stt", "type": "error", "id": req_id, "message": str(exc)})


# ── Wake word module ──────────────────────────────────────────────────────────

class WakeWordModule:
    # Silero-VAD expects 512-sample frames @ 16 kHz; openWakeWord needs 80 ms = 1280 samples.
    FRAME_SAMPLES = 1280

    def __init__(self):
        self._model = None
        self._threshold = 0.5
        self._running = False
        self._buffer = np.array([], dtype=np.float32)

    def handle(self, msg: dict) -> None:
        cmd = msg.get("cmd")
        if cmd == "load":
            self._load(msg)
        elif cmd == "start":
            self._running = True
        elif cmd == "stop":
            self._running = False
            self._buffer = np.array([], dtype=np.float32)
        elif cmd == "chunk":
            self._process_chunk(msg)
        else:
            _send({"module": "wake", "type": "error", "message": f"Unknown cmd: {cmd}"})

    def _load(self, msg: dict) -> None:
        try:
            import openwakeword
            from openwakeword.model import Model
            model_path = msg.get("model_path")
            self._threshold = msg.get("threshold", 0.5)
            if model_path:
                self._model = Model(wakeword_models=[model_path], inference_framework="onnx")
            else:
                # Fall back to a pretrained model by name (e.g. "hey_jarvis")
                model_name = msg.get("model", "hey_jarvis")
                openwakeword.utils.download_models()
                self._model = Model(wakeword_models=[model_name], inference_framework="onnx")
            _send({"module": "wake", "type": "ready"})
        except Exception as exc:
            _send({"module": "wake", "type": "error", "message": str(exc)})

    def _process_chunk(self, msg: dict) -> None:
        if not self._running or self._model is None:
            return
        try:
            audio_b64 = msg.get("audio_b64", "")
            pcm_bytes = base64.b64decode(audio_b64)
            pcm16 = np.frombuffer(pcm_bytes, dtype=np.int16)
            audio = pcm16.astype(np.float32) / 32768.0
            self._buffer = np.concatenate([self._buffer, audio])

            while len(self._buffer) >= self.FRAME_SAMPLES:
                frame = self._buffer[:self.FRAME_SAMPLES]
                self._buffer = self._buffer[self.FRAME_SAMPLES:]
                prediction = self._model.predict(frame)
                for model_name, score in prediction.items():
                    if score >= self._threshold:
                        _send({
                            "module": "wake",
                            "type": "detected",
                            "model": model_name,
                            "score": round(float(score), 4),
                        })
                        # Reset model state to avoid repeated triggers
                        self._model.reset()
                        self._buffer = np.array([], dtype=np.float32)
                        return
        except Exception as exc:
            _send({"module": "wake", "type": "error", "message": str(exc)})


# ── I/O helpers ───────────────────────────────────────────────────────────────

_write_lock = threading.Lock()

def _send(obj: dict) -> None:
    line = json.dumps(obj, separators=(",", ":"))
    with _write_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def _read_lines():
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            yield json.loads(raw)
        except json.JSONDecodeError as exc:
            _send({"module": "error", "type": "parse_error", "message": str(exc)})


# ── Main dispatch loop ────────────────────────────────────────────────────────

def main():
    stt = SttModule()
    wake = WakeWordModule()

    _send({"module": "sidecar", "type": "started"})

    for msg in _read_lines():
        try:
            module = msg.get("module")
            if module == "stt":
                # Run STT in a thread so the stdin loop stays responsive
                threading.Thread(target=stt.handle, args=(msg,), daemon=True).start()
            elif module == "wake":
                wake.handle(msg)
            elif module == "ping":
                _send({"module": "pong"})
            else:
                _send({"module": "error", "type": "unknown_module", "message": f"Unknown module: {module}"})
        except Exception:
            _send({"module": "error", "type": "dispatch_error", "message": traceback.format_exc()})


if __name__ == "__main__":
    main()
