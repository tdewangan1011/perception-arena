export function normalizedWord(transcript: string) {
  const tokens = transcript.toLowerCase().match(/[a-z']+/g);
  return tokens?.length === 1 ? tokens[0] : undefined;
}
