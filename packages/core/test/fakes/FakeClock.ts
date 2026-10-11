import type { ClockPort } from '../../src/ports';

interface Timer {
  id: number;
  at: number;
  callback: () => void;
}

export class FakeClock implements ClockPort {
  private time: number;
  private nextId = 1;
  private timers: Timer[] = [];

  constructor(start = 0) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): unknown {
    const timer = { id: this.nextId++, at: this.time + ms, callback };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  }

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) {
        break;
      }
      this.timers = this.timers.filter((timer) => timer !== due);
      this.time = due.at;
      due.callback();
    }
    this.time = end;
  }
}
