export type Waveform = { peaks: number[]; durationMs: number };

function peaks(samples: Float32Array, rate: number): Waveform {
  return {
    durationMs: (samples.length / rate) * 1000,
    peaks: Array.from({ length: 200 }, (_, i) => {
      const start = Math.floor((i * samples.length) / 200),
        end = Math.floor(((i + 1) * samples.length) / 200);
      let peak = 0;
      for (
        let j = start;
        j < end;
        j += Math.max(1, Math.floor((end - start) / 100))
      )
        peak = Math.max(peak, Math.abs(samples[j]));
      return peak;
    }),
  };
}

export async function decodeWaveform(data: ArrayBuffer): Promise<Waveform> {
  // PCM WAV fallback also works in browser builds without Web Audio.
  const view = new DataView(data),
    tag = (at: number) => String.fromCharCode(...new Uint8Array(data, at, 4));
  if (data.byteLength >= 44 && tag(0) === "RIFF" && tag(8) === "WAVE") {
    let format = 0,
      channels = 0,
      rate = 0,
      bits = 0,
      offset = 12,
      start = 0,
      size = 0;
    while (offset + 8 <= data.byteLength) {
      const kind = tag(offset),
        length = view.getUint32(offset + 4, true),
        body = offset + 8;
      if (body + length > data.byteLength) break;
      if (kind === "fmt " && length >= 16) {
        format = view.getUint16(body, true);
        channels = view.getUint16(body + 2, true);
        rate = view.getUint32(body + 4, true);
        bits = view.getUint16(body + 14, true);
      }
      if (kind === "data") {
        start = body;
        size = length;
      }
      offset = body + length + (length % 2);
    }
    if (format === 1 && bits === 16 && channels > 0 && rate > 0 && size) {
      const samples = new Float32Array(Math.floor(size / (2 * channels)));
      for (let i = 0; i < samples.length; i++)
        samples[i] = view.getInt16(start + i * channels * 2, true) / 32768;
      return peaks(samples, rate);
    }
  }
  const Audio =
    globalThis.AudioContext ||
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Audio)
    throw new Error(
      "This browser cannot decode this waveform. Try PCM WAV or a browser with Web Audio support.",
    );
  const context = new Audio();
  try {
    const decoded = await context.decodeAudioData(data);
    return peaks(decoded.getChannelData(0), decoded.sampleRate);
  } finally {
    await context.close();
  }
}
