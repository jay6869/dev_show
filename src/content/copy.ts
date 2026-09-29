/**
 * Every word of copy in HEXACHORD lives here, typed.
 * The static DOM is rendered from this at build time (see content/render.ts + vite.config.ts),
 * so the piece reads correctly with no JavaScript and no WebGL.
 */

export type MovementId = 'emergence' | 'tension' | 'liquid' | 'crystal' | 'instrument' | 'afterglow';

export interface Hexachord {
  /** Display name, in the Guidonian tradition where one exists. */
  readonly name: string;
  /** Six MIDI notes, ascending. The scale of the movement. */
  readonly notes: readonly [number, number, number, number, number, number];
  /** Four-voice pad chord (MIDI), voice-led from the previous movement. */
  readonly chord: readonly [number, number, number, number];
  /** Sub-bass root (MIDI). */
  readonly root: number;
}

export interface Movement {
  readonly id: MovementId;
  readonly numeral: string;
  readonly title: string;
  readonly line: string;
  readonly docTitle: string;
  readonly hexachord: Hexachord;
  /** Sound caption for deaf and hard-of-hearing visitors, shown when sound is on. */
  readonly caption: string;
  /** Director's Cut: why this movement looks the way it does. */
  readonly rationale: string;
  /** Director's Cut: a subtle hint at the hidden interaction. */
  readonly secret: { readonly name: string; readonly hint: string };
}

export const TITLE = 'Hexachord';
export const SUBTITLE = 'An instrument in six movements';

export const MOVEMENTS: readonly Movement[] = [
  {
    id: 'emergence',
    numeral: 'I',
    title: 'Emergence',
    line: 'Something wakes in the dark and decides to be many.',
    docTitle: 'I. Emergence',
    hexachord: {
      name: 'Hexachordum naturale · C',
      notes: [48, 50, 52, 53, 55, 57],
      chord: [48, 55, 62, 64],
      root: 36,
    },
    caption: 'A low pad opens on C, slowly.',
    rationale: 'Birth reads as density, not light. 262,144 particles, one curl field, zero geometry.',
    secret: { name: 'Singularity', hint: 'Hold still. Then hold.' },
  },
  {
    id: 'tension',
    numeral: 'II',
    title: 'Tension',
    line: 'Order arrives. The field resists. Neither yields.',
    docTitle: 'II. Tension',
    hexachord: { name: 'Whole-tone · C', notes: [48, 50, 52, 54, 56, 58], chord: [50, 56, 60, 64], root: 38 },
    caption: 'The pad bends into a whole-tone cluster. Unresolved.',
    rationale: 'The type is under load: width axis 50 to 150, driven by the same strain uniform as the grid.',
    secret: { name: 'Snap', hint: 'Type the word that ends all tension.' },
  },
  {
    id: 'liquid',
    numeral: 'III',
    title: 'Liquid',
    line: 'Structure melts into surface. Touch it; it remembers.',
    docTitle: 'III. Liquid',
    hexachord: {
      name: 'Hexachordum molle · F',
      notes: [53, 55, 57, 58, 60, 62],
      chord: [53, 60, 67, 69],
      root: 41,
    },
    caption: 'Warm F major, filtered, like sound under water.',
    rationale:
      'Raymarched at a fraction of native resolution, then Catmull-Rom upsampled. You cannot see the seam.',
    secret: { name: 'Whirlpool', hint: 'Draw a full circle.' },
  },
  {
    id: 'crystal',
    numeral: 'IV',
    title: 'Crystal',
    line: 'Light enters as one and leaves as six.',
    docTitle: 'IV. Crystal',
    hexachord: { name: 'Lydian · D', notes: [62, 64, 66, 68, 69, 71], chord: [50, 57, 64, 68], root: 38 },
    caption: 'Bright Lydian shimmer, high partials glinting.',
    rationale: 'The only colour in the piece is earned: white light, split by six indices of refraction.',
    secret: { name: 'Shatter', hint: 'Shake it.' },
  },
  {
    id: 'instrument',
    numeral: 'V',
    title: 'Instrument',
    line: 'Now it is yours. Move to choose a note. Press to play it.',
    docTitle: 'V. Instrument',
    hexachord: {
      name: 'Hexachordum durum · G',
      notes: [55, 57, 59, 60, 62, 64],
      chord: [43, 50, 59, 64],
      root: 31,
    },
    caption: 'G major hexachord. Every note you play is in key.',
    rationale: 'Nine strings, nine keys. Pitch is quantized so nothing you do can sound wrong.',
    secret: { name: 'Canon', hint: 'Climb all six.' },
  },
  {
    id: 'afterglow',
    numeral: 'VI',
    title: 'Afterglow',
    line: 'Everything decays. One light stays.',
    docTitle: 'VI. Afterglow',
    hexachord: { name: 'Aeolian · A', notes: [57, 59, 60, 62, 64, 65], chord: [45, 52, 59, 60], root: 33 },
    caption: 'An open fifth on A, fading to silence.',
    rationale: 'Resolution by subtraction. Each pass is switched off, in order, until one pixel is left.',
    secret: { name: 'Da capo', hint: 'Hold the last light.' },
  },
] as const;

export const SOLMIZATION = ['ut', 're', 'mi', 'fa', 'sol', 'la'] as const;

/** Keyboard row that plays Movement V. Nine keys, nine strings. */
export const INSTRUMENT_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'] as const;

export const UI = {
  skip: 'Skip to the piece',
  gateTitle: 'An instrument in six movements',
  gateBody: 'Scroll to travel through it. In the fifth movement, you play. Headphones help.',
  gateSound: 'Enter with sound',
  gateSilent: 'Enter silent',
  gateRemembered: 'Last time you chose',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  directorsCut: "Director's cut",
  loading: ['tuning', 'compiling light', 'seeding the field', 'listening'] as const,
  instrumentHint: 'Move to choose. Press or use keys to play.',
  lastLight: 'The last light',
  lastLightHint: 'Scroll up to play it again.',
  noWebgl: 'Your browser is showing the quiet version of this piece. All six movements are here, in type.',
  announceMovement: (m: Movement): string => `Movement ${m.numeral}: ${m.title}. ${m.line}`,
  notFoundTitle: 'Rest',
  notFoundLine: 'A bar of silence where a page should be. Drag the pieces back together, or go home.',
  notFoundHome: 'Return to the first movement',
} as const;

export const DIRECTORS_CUT_NOTES = [
  {
    key: 'type',
    title: 'Type',
    body: 'Anybody (variable width 50-150) for display, because tension needs an axis to strain along. JetBrains Mono for data: an instrument panel reads in fixed width.',
  },
  {
    key: 'motion',
    title: 'Motion',
    body: 'Everything that enters decelerates; everything that leaves accelerates. Transitions between movements use one curve, "mutate", named after the medieval term for moving between hexachords.',
  },
  {
    key: 'sound',
    title: 'Sound',
    body: 'Nothing is a loop. Four pad voices glide between chords with voice-leading; the riser is literally your distance to the next movement.',
  },
  {
    key: 'restraint',
    title: 'Restraint',
    body: 'Two typefaces. One accent. The iridescence in IV is the only spectrum in the piece, so it lands.',
  },
] as const;
