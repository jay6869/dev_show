export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

export function qsa<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** Listener that returns its own disposer. Every listener in the app is created through this. */
export function on<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void;
export function on<K extends keyof DocumentEventMap>(
  target: Document,
  type: K,
  fn: (e: DocumentEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void;
export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void;
export function on(
  target: EventTarget,
  type: string,
  fn: (e: Event) => void,
  opts?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

export const isTypingTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  (t instanceof HTMLElement && t.isContentEditable);
