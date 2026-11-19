export interface TouchSample {
  id: number;
  x: number;
  y: number;
}

export type WorkbenchTouchAction =
  | { kind: 'tap' }
  | { kind: 'orbit'; dx: number; dy: number }
  | { kind: 'pan-zoom'; dx: number; dy: number; scale: number }
  | { kind: 'preview-move' }
  | { kind: 'commit-move' }
  | { kind: 'cancel-move' };

type TouchMode = 'idle' | 'pending' | 'orbit' | 'move' | 'multi' | 'blocked';
const DRAG_THRESHOLD = 7;

/** Once a contact becomes a gesture, releasing it cannot turn it into a tap.
 * Only a completed one-finger move may commit a layout change. */
export class WorkbenchTouch {
  private contacts = new Map<number, TouchSample>();
  private mode: TouchMode = 'idle';
  private origin?: TouchSample;
  private canMove = false;

  get active(): boolean {
    return this.contacts.size > 0;
  }

  has(id: number): boolean {
    return this.contacts.has(id);
  }

  begin(sample: TouchSample, canMove: boolean): WorkbenchTouchAction | undefined {
    if (this.contacts.has(sample.id)) return;
    this.contacts.set(sample.id, sample);
    if (this.contacts.size === 1) {
      this.mode = 'pending';
      this.origin = sample;
      this.canMove = canMove;
    } else if (this.mode !== 'blocked') {
      const cancelMove = this.canMove;
      this.mode = 'multi';
      this.canMove = false;
      if (cancelMove) return { kind: 'cancel-move' };
    }
  }

  update(sample: TouchSample): WorkbenchTouchAction | undefined {
    const previous = this.contacts.get(sample.id);
    if (!previous) return;
    const pair = this.mode === 'multi' ? this.pair() : undefined;
    this.contacts.set(sample.id, sample);
    if (pair) {
      const next = this.pair()!;
      return { kind: 'pan-zoom', dx: next.x - pair.x, dy: next.y - pair.y, scale: Math.max(1, next.span) / Math.max(1, pair.span) };
    }
    if (this.mode === 'pending' && this.origin) {
      const dx = sample.x - this.origin.x;
      const dy = sample.y - this.origin.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this.mode = this.canMove ? 'move' : 'orbit';
      return this.mode === 'move' ? { kind: 'preview-move' } : { kind: 'orbit', dx, dy };
    }
    if (this.mode === 'move') return { kind: 'preview-move' };
    if (this.mode === 'orbit') return { kind: 'orbit', dx: sample.x - previous.x, dy: sample.y - previous.y };
  }

  end(sample: TouchSample): WorkbenchTouchAction | undefined {
    if (!this.contacts.delete(sample.id)) return;
    const mode = this.mode;
    const origin = this.origin;
    if (!this.active) this.reset();
    else if (this.contacts.size < 2) this.mode = 'blocked';
    if (mode === 'move') return { kind: 'commit-move' };
    if (mode === 'pending' && origin && Math.hypot(sample.x - origin.x, sample.y - origin.y) < DRAG_THRESHOLD) {
      return { kind: 'tap' };
    }
  }

  cancel(id: number, reason: 'pointercancel' | 'lostpointercapture' = 'pointercancel'): void {
    if (!this.contacts.has(id)) return;
    if (reason !== 'lostpointercapture') this.contacts.delete(id);
    this.mode = this.active ? 'blocked' : 'idle';
    this.origin = undefined;
    this.canMove = false;
  }

  reset(): void {
    this.contacts.clear();
    this.origin = undefined;
    this.canMove = false;
    this.mode = 'idle';
  }

  private pair(): { x: number; y: number; span: number } | undefined {
    const [a, b] = this.contacts.values();
    if (!a || !b) return;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span: Math.hypot(b.x - a.x, b.y - a.y) };
  }
}
