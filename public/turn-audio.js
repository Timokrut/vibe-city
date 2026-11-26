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

export function createNarrator(synthesis, Utterance, onChange, onFailure) {
  let current;
  let watchdog;
  function cancel() {
    if (!current) return;
    current = null;
    clearTimeout(watchdog);
    synthesis.cancel();
    onChange();
  }
  return {
    available: Boolean(synthesis && Utterance),
    get speaking() {
      return Boolean(current);
    },
    cancel,
    say(text, lang) {
      cancel();
      if (!synthesis || !Utterance) return;
      try {
        const line = new Utterance(text);
        line.lang = lang === "ru" ? "ru-RU" : "en-US";
        const voices = synthesis.getVoices();
        const voice =
          voices.find((v) => v.lang === line.lang) ||
          voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === lang);
        if (voice) line.voice = voice;
        current = line;
        onChange();
        const done = () => {
          if (current !== line) return false;
          current = null;
          clearTimeout(watchdog);
          onChange();
          return true;
        };
        line.onend = done;
        line.onerror = () => {
          if (done()) onFailure();
        };
        watchdog = setTimeout(() => {
          if (current === line) {
            cancel();
            onFailure();
          }
        }, 15000);
        synthesis.speak(line);
      } catch {
        cancel();
        onFailure();
      }
    },
  };
}
