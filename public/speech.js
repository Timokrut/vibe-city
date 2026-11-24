// Only the current recognizer owns the turn. Browser events can still arrive
// after abort(), e.g. when the timer expires or a typed move wins the race.
export function createVoiceInput(
  Recognition,
  { canListen, language, onCity, onStatus },
) {
  let enabled = false;
  let active = null;
  let restart;

  function pause() {
    clearTimeout(restart);
    if (!active) return;
    const recognition = active;
    active = null;
    recognition.abort();
  }

  function disable(reason = "idle") {
    enabled = false;
    pause();
    onStatus(reason);
  }

  function sync() {
    clearTimeout(restart);
    if (!enabled) return;
    if (!canListen()) {
      pause();
      onStatus("paused");
    } else if (!active) {
      onStatus("ready");
      restart = setTimeout(start, 300);
    }
  }

  function start() {
    if (!enabled || active || !canListen()) return;
    if (!Recognition) return disable("unsupported");
    try {
      const recognition = new Recognition();
      active = recognition;
      recognition.lang = language() === "ru" ? "ru-RU" : "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        if (active !== recognition || !canListen()) return;
        const result = event.results[event.resultIndex];
        if (!result?.isFinal) return;
        const city = result[0]?.transcript
          ?.trim()
          .replace(/[.,!?…]+$/u, "")
          .trim();
        if (!city) return;
        pause();
        onCity(city);
        sync();
      };
      recognition.onerror = ({ error }) => {
        if (active !== recognition) return;
        if (error === "no-speech") return; // onend rearms after silence.
        disable(error);
      };
      recognition.onend = () => {
        if (active !== recognition) return;
        active = null;
        sync();
      };
      onStatus("listening");
      recognition.start();
    } catch {
      disable("unavailable");
    }
  }

  function toggle() {
    if (enabled) return disable();
    enabled = true;
    start();
  }

  return {
    toggle,
    pause,
    sync,
    disable,
    get enabled() {
      return enabled;
    },
  };
}
