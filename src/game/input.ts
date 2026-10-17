import type { Action } from './engine';

type Sample = { x: number; y: number; time: number };
export class Gesture {
  private origin: Sample | null = null;
  private last: Sample | null = null;
  private samples: Sample[] = [];
  private mode: 'pending' | 'horizontal' | 'vertical' | 'ignored' | 'consumed' = 'consumed';
  private carry = 0;
  constructor(private cell: number, private emit: (action: Action) => boolean, private rowSize = cell) {}
  start(sample: Sample) {
    this.origin = sample; this.last = sample; this.samples = [sample]; this.mode = 'pending'; this.carry = 0;
  }
  cancel() { this.mode = 'consumed'; }
  move(sample: Sample) {
    if (!this.origin || !this.last || this.mode === 'consumed' || this.mode === 'ignored') return;
    const dx = sample.x - this.origin.x, dy = sample.y - this.origin.y;
    this.samples.push(sample);
    while (this.samples.length > 2 && this.samples[0].time < sample.time - 80) this.samples.shift();
    if (this.mode === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      if (Math.abs(dx) >= Math.abs(dy) * 1.25) this.mode = 'horizontal';
      else if (Math.abs(dy) >= Math.abs(dx) * 1.25) this.mode = dy > 0 ? 'vertical' : 'ignored';
    }
    const first = this.samples[0];
    const velocity = (sample.y - first.y) / Math.max(1, sample.time - first.time) * 1000;
    if (this.mode === 'vertical' && dy >= Math.max(24, this.rowSize) && velocity >= 900) {
      this.emit('hard'); this.cancel(); return;
    }
    if (this.mode === 'horizontal') {
      this.carry += sample.x - this.last.x;
      while (Math.abs(this.carry) >= this.cell) {
        const direction = this.carry > 0 ? 1 : -1;
        if (!this.emit(direction > 0 ? 'right' : 'left')) { this.carry = 0; break; }
        this.carry -= direction * this.cell;
      }
    } else if (this.mode === 'vertical') {
      const delta = sample.y - this.last.y;
      this.carry = delta < 0 ? 0 : this.carry + delta;
      while (this.carry >= this.rowSize) {
        if (!this.emit('soft')) { this.carry = 0; break; }
        this.carry -= this.rowSize;
      }
    }
    // Keep the initial anchor until the direction has been decided.
    if (this.mode !== 'pending') this.last = sample;
  }
  end(sample: Sample) {
    if (this.mode === 'pending' && this.origin && sample.time - this.origin.time <= 250
      && Math.hypot(sample.x - this.origin.x, sample.y - this.origin.y) <= 8) this.emit('rotate');
    this.cancel();
  }
}
