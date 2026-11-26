import assert from "node:assert/strict";
import test from "node:test";
import { createNarrator } from "../public/turn-audio.js";

test("queued speech holds the microphone until the current reply ends", () => {
  const lines = [];
  const states = [];
  const failures = [];
  const russian = { lang: "ru-RU" };
  const english = { lang: "en-GB" };
  const synth = {
    getVoices: () => [english, russian],
    speak: (line) => lines.push(line),
    cancel: () => lines.at(-1)?.onerror(),
  };
  const narrator = createNarrator(
    synth,
    class {},
    () => states.push(narrator.speaking),
    () => failures.push(true),
  );
  narrator.say("Москва", "ru");
  assert.equal(lines[0].voice, russian);
  assert.equal(narrator.speaking, true);
  narrator.say("Paris", "en");
  assert.equal(lines[1].lang, "en-US");
  assert.equal(lines[1].voice, english);
  lines[0].onend();
  assert.equal(narrator.speaking, true);
  lines[1].onend();
  assert.deepEqual(states, [true, false, true, false]);
  assert.deepEqual(failures, []);
});

test("missing voices and playback errors release voice input", () => {
  let line;
  let failures = 0;
  const narrator = createNarrator(
    {
      getVoices: () => [],
      speak: (value) => {
        line = value;
      },
      cancel() {},
    },
    class {},
    () => {},
    () => failures++,
  );
  narrator.say("Москва", "ru");
  assert.equal(line.lang, "ru-RU");
  line.onerror();
  assert.equal(narrator.speaking, false);
  assert.equal(failures, 1);
  narrator.say("Москва", "ru");
  narrator.cancel();
  line.onerror();
  assert.equal(failures, 1);
});
