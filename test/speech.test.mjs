import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceInput } from "../public/speech.js";

function fixture() {
  const sessions = [],
    cities = [],
    statuses = [];
  let allowed = true,
    lang = "ru";
  class Recognition {
    start() {
      sessions.push(this);
    }
    abort() {
      this.onend();
    }
    say(transcript, isFinal = true) {
      const result = Object.assign([{ transcript }], { isFinal });
      this.onresult({ resultIndex: 0, results: [result] });
    }
  }
  const voice = createVoiceInput(Recognition, {
    canListen: () => allowed,
    language: () => lang,
    onCity: (city) => cities.push(city),
    onStatus: (status) => statuses.push(status),
  });
  return {
    voice,
    sessions,
    cities,
    statuses,
    allow: (value) => (allowed = value),
    language: (value) => (lang = value),
  };
}

test("only the final result is submitted, once per listening session", () => {
  const { voice, sessions, cities } = fixture();
  voice.toggle();
  const first = sessions[0];
  assert.equal(first.lang, "ru-RU");
  first.say("Мос", false);
  assert.deepEqual(cities, []);
  first.say("Москва.");
  first.say("Москва.");
  assert.deepEqual(cities, ["Москва"]);
  voice.disable();
});

test("voice pauses between turns and resumes without a second microphone click", async () => {
  const { voice, sessions, cities, allow, language } = fixture();
  voice.toggle();
  allow(false);
  voice.sync();
  sessions[0].say("Москва");
  assert.equal(voice.enabled, true);
  allow(true);
  language("en");
  voice.sync();
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].lang, "en-US");
  sessions[1].say("Paris!");
  voice.toggle();
  sessions[1].say("Paris");
  assert.deepEqual(cities, ["Paris"]);
  assert.equal(voice.enabled, false);
});

test("permission denial and unavailable recognition disable hands-free play", () => {
  const { voice, sessions, statuses } = fixture();
  voice.toggle();
  sessions[0].onerror({ error: "not-allowed" });
  sessions[0].onend();
  assert.equal(voice.enabled, false);
  assert.equal(statuses.at(-1), "not-allowed");
  const unsupported = createVoiceInput(undefined, {
    canListen: () => true,
    onStatus: (s) => statuses.push(s),
  });
  unsupported.toggle();
  assert.equal(unsupported.enabled, false);
  assert.equal(statuses.at(-1), "unsupported");
});
