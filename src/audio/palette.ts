import { MOVEMENTS } from '../content/copy';

/** Per-movement sound palette. The chords themselves live in the content model (hexachords). */
export interface SoundPalette {
  /** Pad low-pass cutoff at rest, Hz. */
  cutoff: number;
  /** Reverb wet at rest. */
  wet: number;
  /** Chorus depth. */
  chorus: number;
  /** FatOscillator spread in cents: detune is tension. */
  spread: number;
  /** Pad level, linear. */
  level: number;
}

export const SOUND: readonly SoundPalette[] = [
  { cutoff: 520, wet: 0.5, chorus: 0.5, spread: 18, level: 0.8 }, // I   dark, opening
  { cutoff: 1400, wet: 0.35, chorus: 0.2, spread: 42, level: 0.75 }, // II  bright, detuned, dry
  { cutoff: 380, wet: 0.62, chorus: 0.8, spread: 24, level: 0.8 }, // III under water
  { cutoff: 2400, wet: 0.55, chorus: 0.6, spread: 14, level: 0.6 }, // IV  glassy
  { cutoff: 900, wet: 0.4, chorus: 0.35, spread: 16, level: 0.45 }, // V   ducks for the player
  { cutoff: 300, wet: 0.75, chorus: 0.4, spread: 10, level: 0.55 }, // VI  fading
];

/** Nine strings for Movement V: the G hexachord, then the next three degrees an octave up. */
export const STRING_NOTES: readonly number[] = (() => {
  const h = MOVEMENTS[4]!.hexachord.notes;
  return [...h, h[0] + 12, h[1] + 12, h[2] + 12];
})();
