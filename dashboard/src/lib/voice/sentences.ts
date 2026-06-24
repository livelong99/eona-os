// Streaming sentence chunker. Feed it LLM token deltas; it emits complete
// sentences as soon as they're terminated, so TTS can start on sentence 1 while
// the model is still generating sentence 2 (the key latency win).
//
// The FIRST chunk additionally flushes on an early clause boundary (a comma /
// semicolon / colon / dash, once a few words are buffered) so the very first
// audio plays as soon as Claude emits an opening phrase — minimizing the gap
// between the first tokens and the first spoken word. Subsequent chunks use full
// sentence boundaries for natural delivery. Pure + sync for easy unit testing.

const TERMINATORS = /([.!?]+)(\s|$)/;
const CLAUSE = /([,;:—–-]+)(\s)/;
// Don't flush a 1–2 word fragment as the first chunk (too choppy / too little to say).
const FIRST_MIN_WORDS = 3;

export class SentenceChunker {
  private buffer = "";
  private firstEmitted = false;

  /** Add a token delta; returns any newly-completed sentences/clauses. */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const cut = this.firstEmitted ? this.sentenceCut() : this.firstChunkCut();
      if (cut < 0) break;
      const piece = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut).replace(/^\s+/, "");
      if (!piece) break;
      out.push(piece);
      this.firstEmitted = true;
    }
    return out;
  }

  /** Flush whatever remains (e.g. a final clause with no terminator). */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }

  // Cut at the end of a terminated sentence, or -1.
  private sentenceCut(): number {
    const m = TERMINATORS.exec(this.buffer);
    return m ? m.index + m[1].length : -1;
  }

  // First chunk only: the earliest of a sentence end OR a clause boundary that
  // has at least FIRST_MIN_WORDS words before it.
  private firstChunkCut(): number {
    const t = TERMINATORS.exec(this.buffer);
    const tCut = t ? t.index + t[1].length : Infinity;
    let cCut = Infinity;
    const c = CLAUSE.exec(this.buffer);
    if (c) {
      const before = this.buffer.slice(0, c.index).trim().split(/\s+/).filter(Boolean).length;
      if (before >= FIRST_MIN_WORDS) cCut = c.index + c[1].length;
    }
    const cut = Math.min(tCut, cCut);
    return cut === Infinity ? -1 : cut;
  }
}
