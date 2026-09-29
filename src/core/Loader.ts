import { store } from './Store';

interface Task {
  weight: number;
  progress: number;
  label: string;
}

/**
 * Real progress, weighted by measured cost. No fake timers: every percent maps to finished work
 * (font decode, GL program compile, particle targets generated, first scene streamed in).
 */
export class Loader {
  private tasks = new Map<string, Task>();
  private label = 'tuning';

  add(id: string, weight: number, label: string): (progress: number) => void {
    this.tasks.set(id, { weight, progress: 0, label });
    return (p: number) => this.set(id, p);
  }

  private set(id: string, p: number): void {
    const t = this.tasks.get(id);
    if (!t) return;
    t.progress = Math.max(t.progress, Math.min(1, p));
    if (p < 1) this.label = t.label;
    store.emit('load:progress', { value: this.value, task: this.label });
  }

  get value(): number {
    let total = 0;
    let done = 0;
    for (const t of this.tasks.values()) {
      total += t.weight;
      done += t.weight * t.progress;
    }
    return total ? done / total : 0;
  }

  /** Wrap a promise so its completion reports progress. */
  async track<T>(id: string, weight: number, label: string, work: Promise<T>): Promise<T> {
    const report = this.add(id, weight, label);
    const r = await work;
    report(1);
    return r;
  }
}
