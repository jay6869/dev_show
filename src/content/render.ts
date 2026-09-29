/**
 * Build-time HTML rendering of the semantic skeleton. Runs inside vite.config.ts (Node), never in the
 * browser bundle. Keeps copy in one typed place while shipping real, crawlable, no-JS HTML.
 */
import { INSTRUMENT_KEYS, MOVEMENTS, SUBTITLE, TITLE, UI, type Movement } from './copy';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function extra(m: Movement): string {
  switch (m.id) {
    case 'emergence':
      return `
      <h1 class="title">
        <span class="title__word" data-split="decode">${esc(TITLE)}</span>
        <span class="title__sub u-mono u-dim">${esc(SUBTITLE)}</span>
      </h1>
      <p class="scroll-cue u-mono u-dim" aria-hidden="true"><span class="scroll-cue__rule"></span>Scroll</p>`;
    case 'crystal':
      return `
      <dl class="readout u-mono" aria-label="Refraction indices">
        <div><dt>n<sub>R</sub></dt><dd data-ior="0">1.512</dd></div>
        <div><dt>n<sub>G</sub></dt><dd data-ior="1">1.528</dd></div>
        <div><dt>n<sub>B</sub></dt><dd data-ior="2">1.549</dd></div>
      </dl>`;
    case 'instrument': {
      const keys = INSTRUMENT_KEYS.map(
        (k, i) =>
          `<li><button class="keys__key" type="button" data-string="${i}" data-magnetic aria-label="String ${i + 1}, key ${k.toUpperCase()}"><kbd>${k.toUpperCase()}</kbd></button></li>`,
      ).join('');
      return `
      <p class="instrument-hint u-mono u-dim">${esc(UI.instrumentHint)}</p>
      <ol class="keys" aria-label="Strings">${keys}</ol>
      <p class="instrument-note u-mono" aria-hidden="true"><span class="instrument-note__name">—</span></p>`;
    }
    case 'afterglow':
      return `
      <button class="last-light" type="button" data-magnetic aria-label="${esc(UI.lastLight)}">
        <span class="last-light__dot" aria-hidden="true"></span>
      </button>
      <p class="afterglow-hint u-mono u-dim">${esc(UI.lastLightHint)}</p>`;
    default:
      return '';
  }
}

export function renderMovements(): string {
  return MOVEMENTS.map(
    (m, i) => `
  <section class="movement movement--${m.id}" id="m${i + 1}" data-movement="${i}" aria-labelledby="m${i + 1}-title">
    <div class="movement__stage">
      <p class="movement__index u-mono"><span class="movement__numeral">${m.numeral}.</span><span class="movement__scale u-dim">${esc(m.hexachord.name)}</span></p>
      <h2 class="movement__title" id="m${i + 1}-title" data-split="chars">${esc(m.title)}</h2>
      <p class="movement__line" data-split="lines">${esc(m.line)}</p>${extra(m)}
    </div>
  </section>`,
  ).join('\n');
}

export function renderNavItems(): string {
  return MOVEMENTS.map(
    (m, i) =>
      `<li><a class="nav__item" href="#m${i + 1}" data-index="${i}" data-magnetic${i === 0 ? ' aria-current="step"' : ''}><span class="nav__num" aria-hidden="true">${m.numeral}</span><span class="u-sr">${esc(m.title)}</span></a></li>`,
  ).join('');
}

export function renderSolmization(syllables: readonly string[]): string {
  return syllables
    .map((s, i) => `<li class="preloader__tick" data-tick="${i}"><span>${s}</span></li>`)
    .join('');
}
