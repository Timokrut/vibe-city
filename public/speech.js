// A recognizer belongs to the input and turn that started it. Ignore late events
// after a timeout, a submitted move, navigation, or a change of player.
export function createVoiceInput(Recognition) {
  let session;

  function cancel() {
    if (!session) return;
    const { recognition, feedback } = session;
    session = undefined;
    recognition.abort();
    feedback('idle');
  }

  function toggle(lang, putText, feedback) {
    if (session) return cancel();
    if (!Recognition) return feedback('unsupported');
    let recognition;
    try {
      recognition = new Recognition();
      recognition.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      session = { recognition, feedback };
      let outcome = 'no-speech';
      recognition.onresult = event => {
        if (session?.recognition !== recognition) return;
        const result = event.results[event.resultIndex]?.[0]?.transcript;
        const city = result?.trim().replace(/[.,!?…]+$/u, '').trim();
        if (city) {
          outcome = 'review';
          putText(city);
          feedback(outcome);
        }
      };
      recognition.onerror = event => {
        if (session?.recognition !== recognition) return;
        outcome = event.error;
        feedback(outcome);
      };
      recognition.onend = () => {
        if (session?.recognition !== recognition) return;
        session = undefined;
        feedback(outcome);
      };
      feedback('listening');
      recognition.start();
    } catch {
      session = undefined;
      feedback('unavailable');
    }
  }
  return { toggle, cancel };
}

