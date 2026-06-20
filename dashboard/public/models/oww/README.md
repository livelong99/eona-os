# openWakeWord models

Drop the three ONNX models here to arm hands-free wake-word activation
("Hey Jarvis"). Without them, the home page falls back to push-to-talk (tap the
orb or the mic) — everything else works the same.

Required files (from the openWakeWord project, MIT-licensed):

- `melspectrogram.onnx`   — shared audio front-end
- `embedding_model.onnx`  — shared speech-embedding model
- `hey_jarvis.onnx`       — the wake-word classifier

Source: https://github.com/dscripka/openWakeWord (see `openwakeword/resources/models`).
Convert the bundled `.tflite` to `.onnx`, or grab a community ONNX export.

After placing them, reload the home page — the readout switches from
"tap the orb to talk" to 'say "Hey Jarvis"'. Calibrate `THRESHOLD` in
`src/lib/voice/wakeword.ts` against your mic if it over/under-triggers.
