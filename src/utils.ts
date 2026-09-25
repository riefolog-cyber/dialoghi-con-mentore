// Utility to decode base64 string
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Function to strip markdown for cleaner speech
export const getSpeechText = (text: string) => {
  return text
    .replace(/[*_#`~]/g, '') // Remove basic markdown characters
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Replace links with just the text
    .replace(/https?:\/\/\S+/g, '') // Remove raw URLs
    .trim();
};

// Optimized synchronous converter for streaming chunks
export function createAudioBufferFromPCM(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000
): AudioBuffer {
  // PCM 16-bit little-endian to Float32
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  const frameCount = dataInt16.length; // Mono
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

export async function decodeAudioDataSafe(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  try {
    // Try native decoding first (in case it's WAV/MP3/OGG)
    const bufferCopy = data.slice().buffer;
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const maybePromise = ctx.decodeAudioData(
        bufferCopy,
        (decoded) => resolve(decoded),
        (err) => reject(err)
      );
      if (maybePromise) {
        maybePromise.then(resolve).catch(reject);
      }
    });
  } catch (e) {
    // Fallback to raw PCM 16-bit 24kHz
    console.warn("decodeAudioData failed, falling back to raw PCM", e);
    return createAudioBufferFromPCM(data, ctx, sampleRate);
  }
}
