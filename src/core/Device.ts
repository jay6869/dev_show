import type { Tier } from './Quality';

export interface DeviceInfo {
  webgl2: boolean;
  gpu: string;
  mobile: boolean;
  touch: boolean;
  finePointer: boolean;
  cores: number;
  memory: number;
  dpr: number;
  floatRT: boolean;
  initialTier: Tier;
  saveData: boolean;
}

const weakGpu =
  /(mali-[0-9]{1,3}[^0-9]|adreno \(?tm\)? ?[1-5][0-9]{2}|powervr|intel\(r\) (hd|uhd) graphics [2-6]|swiftshader|llvmpipe|softpipe)/i;
const strongGpu =
  /(rtx|radeon rx|radeon pro|apple m[1-9]|apple gpu|geforce gtx 1[06-9]|geforce gtx 20|arc a|adreno \(?tm\)? ?[7-8][0-9]{2})/i;

let cached: DeviceInfo | null = null;

/** One-time capability probe. A throwaway context is created and immediately lost. */
export function detectDevice(): DeviceInfo {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  } catch {
    /* no WebGL2: gl stays null and the quiet version is used */
  }

  let gpu = 'unknown';
  let floatRT = false;
  if (gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    floatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (touch && !finePointer);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 4;
  const saveData = nav.connection?.saveData === true;

  let initialTier: Tier = 'high';
  if (!gl || !floatRT || weakGpu.test(gpu) || saveData) initialTier = 'low';
  else if (mobile || cores <= 4 || memory <= 4) initialTier = strongGpu.test(gpu) ? 'medium' : 'low';
  else if (!strongGpu.test(gpu) && cores < 8) initialTier = 'medium';

  cached = {
    webgl2: !!gl,
    gpu,
    mobile,
    touch,
    finePointer,
    cores,
    memory,
    dpr: window.devicePixelRatio || 1,
    floatRT,
    initialTier,
    saveData,
  };
  return cached;
}

export const prefersReducedMotion = (): MediaQueryList => matchMedia('(prefers-reduced-motion: reduce)');
