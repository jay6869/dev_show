import { NoToneMapping, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
import { on } from '../utils/dom';
import { Bin } from '../utils/dispose';
import { store } from './Store';

/** One canvas, one renderer. Tone mapping and colour conversion happen in our own final pass. */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly size = new Vector2(1, 1);
  /** Drawing-buffer size in physical pixels. */
  readonly buffer = new Vector2(1, 1);
  dpr = 1;
  private maxDpr = 2;
  private readonly bin = new Bin();
  private resizeHandlers = new Set<() => void>();
  private pendingResize = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.autoClear = false;
    this.gl.setClearColor(0x08090b, 1);
    this.gl.debug.checkShaderErrors = import.meta.env.DEV;
    // Several render() calls per frame: stats are reset once per frame by the App, not per call.
    this.gl.info.autoReset = false;

    const lost = (e: Event): void => {
      e.preventDefault();
      store.emit('context', { lost: true });
    };
    const restored = (): void => store.emit('context', { lost: false });
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.bin.add(() => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    });
    // Coalesced: the resize is applied at the start of the next ticker frame, never in the event itself.
    this.bin.add(on(window, 'resize', () => (this.pendingResize = true)));
    this.resize();
  }

  setMaxDpr(max: number): void {
    this.maxDpr = Math.min(2, max);
    this.resize();
  }

  onResize(fn: () => void): () => void {
    this.resizeHandlers.add(fn);
    return () => this.resizeHandlers.delete(fn);
  }

  /** Called once per frame by the render step. */
  flush(): void {
    if (!this.pendingResize) return;
    this.pendingResize = false;
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.size.set(w, h);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.gl.getDrawingBufferSize(this.buffer);
    for (const fn of this.resizeHandlers) fn();
  }

  dispose(): void {
    this.bin.dispose();
    this.resizeHandlers.clear();
    this.gl.dispose();
  }
}
