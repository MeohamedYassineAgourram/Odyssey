/**
 * Fill streaming RIFF/data lengths after a complete PCM WAV has been received.
 * Existing chunk bytes and ordinary WAV headers are preserved.
 * @param {Uint8Array} audio
 * @returns {Uint8Array}
 */
export function normalizeCompletedWav(audio) {
  if (audio.byteLength < 44) return audio;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const tag = offset => String.fromCharCode(...audio.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return audio;
  const streamingLength = 0xffffffff;
  let blockAlign = 0;
  let dataLengthOffset = -1;
  let hasData = false;
  let offset = 12;
  while (offset + 8 <= audio.byteLength) {
    const name = tag(offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (name === 'data' && length === streamingLength) {
      // A streaming data chunk occupies the remainder of the completed body.
      if (!blockAlign || (audio.byteLength - start) % blockAlign !== 0) return audio;
      dataLengthOffset = offset + 4;
      hasData = true;
      offset = audio.byteLength;
      break;
    }
    if (length > audio.byteLength - start) return audio;
    if (name === 'fmt ') {
      if (length < 16 || view.getUint16(start, true) !== 1) return audio;
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const bytesPerSecond = view.getUint32(start + 8, true);
      blockAlign = view.getUint16(start + 12, true);
      const bits = view.getUint16(start + 14, true);
      if (!channels || !sampleRate || ![8, 16, 24, 32].includes(bits)
        || blockAlign !== channels * bits / 8 || bytesPerSecond !== sampleRate * blockAlign) return audio;
    }
    if (name === 'data') hasData = true;
    offset = start + length + (length % 2);
  }
  if (offset !== audio.byteLength || !blockAlign || !hasData) return audio;
  if (dataLengthOffset !== -1) view.setUint32(dataLengthOffset, audio.byteLength - dataLengthOffset - 4, true);
  if (view.getUint32(4, true) === streamingLength) view.setUint32(4, audio.byteLength - 8, true);
  return audio;
}
