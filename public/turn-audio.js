// Unlock on a user gesture so later bot and network moves can play a cue.
export function createTurnChime(AudioContext) {
  let context;
  return {
    unlock() {
      if (!AudioContext) return;
      try {
        context ??= new AudioContext();
        if (context.state !== "running") context.resume().catch(() => {});
      } catch {
        // The browser may restrict audio output.
      }
    },
    play() {
      if (context?.state !== "running") return;
      const now = context.currentTime;
      for (const [frequency, offset] of [
        [523.25, 0],
        [783.99, 0.09],
      ]) {
        const note = context.createOscillator();
        const gain = context.createGain();
        const start = now + offset;
        note.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        note.connect(gain);
        gain.connect(context.destination);
        note.onended = () => {
          note.disconnect();
          gain.disconnect();
        };
        note.start(start);
        note.stop(start + 0.23);
      }
    },
  };
}
