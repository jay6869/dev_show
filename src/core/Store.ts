import type { Tier } from './Quality';

/** Every cross-module event in the app, typed. No stringly-typed payloads anywhere. */
export interface EventMap {
  'load:progress': { value: number; task: string };
  'load:done': undefined;
  entered: { sound: boolean };
  movement: { index: number; prev: number };
  progress: { value: number; velocity: number };
  sound: { enabled: boolean };
  quality: { tier: Tier; reason: string };
  directors: { open: boolean };
  idle: { idle: boolean };
  'reduced-motion': { reduced: boolean };
  note: { string: number; midi: number; x: number; y: number; velocity: number; ghost: boolean };
  burst: { x: number; y: number; strength: number };
  secret: { movement: number; name: string };
  context: { lost: boolean };
  wake: { enabled: boolean };
  hold: { progress: number; x: number; y: number };
}

export type EventName = keyof EventMap;
type Handler<K extends EventName> = (payload: EventMap[K]) => void;

/** Snapshot state other modules can read synchronously. */
export interface AppState {
  movement: number;
  progress: number;
  velocity: number;
  sound: boolean;
  entered: boolean;
  directors: boolean;
  idle: boolean;
  reducedMotion: boolean;
  tier: Tier;
}

class TypedStore {
  readonly state: AppState = {
    movement: 0,
    progress: 0,
    velocity: 0,
    sound: false,
    entered: false,
    directors: false,
    idle: false,
    reducedMotion: false,
    tier: 'high',
  };

  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<EventName>);
    return () => set.delete(fn as Handler<EventName>);
  }

  emit<K extends EventName>(name: K, payload: EventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const store = new TypedStore();
