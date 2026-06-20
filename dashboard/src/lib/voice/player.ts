// Sequential audio queue. Sentences are synthesized out of order in time but
// must play in order; enqueue their audio Blobs and they play back-to-back.
// Supports barge-in via stop().

export class AudioQueue {
  private queue: Blob[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  private stopped = false;

  constructor(
    private readonly onStart?: () => void,
    private readonly onDrained?: () => void,
  ) {}

  enqueue(blob: Blob) {
    if (this.stopped) return;
    this.queue.push(blob);
    if (!this.playing) void this.drain();
  }

  private async drain() {
    this.playing = true;
    this.onStart?.();
    while (this.queue.length && !this.stopped) {
      const blob = this.queue.shift()!;
      await this.playOne(blob);
    }
    this.playing = false;
    if (!this.stopped) this.onDrained?.();
  }

  private playOne(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        this.current = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });
  }

  /** Barge-in: drop the queue and stop playback immediately. */
  stop() {
    this.stopped = true;
    this.queue = [];
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
    this.playing = false;
  }

  get isActive() {
    return this.playing || this.queue.length > 0;
  }
}
