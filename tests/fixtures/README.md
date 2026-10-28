# Synthetic media fixture

`timeline-qualification.mp4` is a separate three-second, 320 × 180 H.264/YUV420P test pattern generated with local FFmpeg for deterministic source-in/out seeking across browser engines. It has no audio or third-party material. Reproduce with `ffmpeg -f lavfi -i testsrc2=size=320x180:rate=25:duration=3 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart timeline-qualification.mp4`. The timeline tests also create a two-second PCM WAV tone in memory to exercise actual local waveform decoding and audio trimming.

`media-qualification.mp4` is a 2,883-byte H.264 video created locally with Chromium's MediaRecorder from a 320 × 180 canvas. It shows “Inspect equipment” and a moving gold square on a blue background, with no audio or third-party footage. It exists to exercise actual decode, playback, local files and caption tracks, rather than accepting a container-header stub as playback evidence.
