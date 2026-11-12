import { base44 } from '@/api/base44Client';

// Voiced line for the Living Quest cinematic. Returns the MP3 as a Blob, which
// is the shape CinematicQuestDialogue plays. Failures are non-fatal: the
// dialogue falls back to silent typewriter text.
export async function generateStoryAudio({ text, voice = 'river' } = {}) {
  const spoken = String(text || '').slice(0, 1200);
  if (!spoken) throw new Error('Nothing to speak.');

  const { url } = await base44.integrations.Core.GenerateSpeech({ text: spoken, voice });
  if (!url) throw new Error('No audio returned.');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio download failed (${response.status}).`);
  return { data: await response.blob(), url };
}