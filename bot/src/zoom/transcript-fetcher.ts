// Extract unique speaker/participant names from VTT transcript
export function extractParticipantsFromVtt(vttContent: string): string[] {
  const lines = vttContent.split('\n');
  const speakers = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    // Match speaker labels like "John Smith: some text here"
    const speakerMatch = trimmed.match(/^(.+?):\s+(.*)$/);
    if (
      speakerMatch &&
      speakerMatch[1].length < 50 &&
      !/^\d{2}:\d{2}/.test(trimmed) &&
      trimmed !== 'WEBVTT' &&
      !/^\d+$/.test(trimmed)
    ) {
      speakers.add(speakerMatch[1].trim());
    }
  }

  return Array.from(speakers);
}

// Utility to parse VTT transcript format into plain text
export function parseVttTranscript(vttContent: string): string {
  const lines = vttContent.split('\n');
  const textLines: string[] = [];
  let currentSpeaker = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip WEBVTT header, timestamps, and empty lines
    if (
      trimmed === 'WEBVTT' ||
      trimmed === '' ||
      /^\d+$/.test(trimmed) ||
      /^\d{2}:\d{2}/.test(trimmed)
    ) {
      continue;
    }

    // Check for speaker label (e.g., "John Smith:")
    const speakerMatch = trimmed.match(/^(.+?):\s*(.*)$/);
    if (speakerMatch && speakerMatch[1].length < 50) {
      const speaker = speakerMatch[1];
      const text = speakerMatch[2];
      if (speaker !== currentSpeaker) {
        currentSpeaker = speaker;
        textLines.push('\n' + speaker + ': ' + text);
      } else {
        textLines.push(text);
      }
    } else {
      textLines.push(trimmed);
    }
  }

  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}
