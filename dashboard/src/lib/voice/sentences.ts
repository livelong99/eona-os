// Streaming sentence chunker. Feed it LLM token deltas; it emits complete
// sentences as soon as they're terminated, so TTS can start on sentence 1 while
// the model is still generating sentence 2 (the key latency win). Pure + sync
// for easy unit testing.

const TERMINATORS = /([.!?]+)(\s|$)/;

export class SentenceChunker {
  private buffer = "";

  /** Add a token delta; returns any newly-completed sentences. */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const m = TERMINATORS.exec(this.buffer);
      if (!m) break;
      const end = m.index + m[1].length;
      const sentence = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end).replace(/^\s+/, "");
      if (sentence) out.push(sentence);
    }
    return out;
  }

  /** Flush whatever remains (e.g. a final clause with no terminator). */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }
}
