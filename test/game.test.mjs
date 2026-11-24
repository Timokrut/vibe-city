import test from "node:test";
import assert from "node:assert/strict";
import {
  startGame,
  buildDictionary,
  play,
  choices,
  expire,
  lastLetter,
} from "../public/game.js";

test("Russian chain skips terminal signs, preserves й, and folds ё", () => {
  const dict = buildDictionary(
    ["Пермь", "Москва", "Адлер", "Ржёв", "Вена"],
    "ru",
  );
  const game = startGame("ru");
  assert.equal(play(game, "пермЬ", dict), null);
  assert.equal(game.next, "м");
  assert.equal(play(game, "Ржев", dict), "letter");
  assert.equal(play(game, "москва", dict), null);
  assert.equal(play(game, "Абракадабра", dict), "unknown");
  assert.equal(play(game, "Адлер", dict), null);
  assert.equal(play(game, "ржев", dict), null);
  assert.equal(game.history.at(-1).name, "Ржёв");
  assert.equal(lastLetter("Шанхай", "ru"), "й");
  assert.equal(lastLetter("Шахты", "ru"), "т");
});

test("aliases share an identity and bot can only choose legal moves", () => {
  const dict = buildDictionary(
    [["Athens", "Athína"], "Sofia", "Austin", "Nice"],
    "en",
  );
  const game = startGame("en");
  play(game, "Athens", dict);
  play(game, "sofia", dict);
  assert.equal(play(game, "Athína", dict), "repeat");
  assert.deepEqual(
    choices(game, dict).map((city) => city.name),
    ["Austin"],
  );
  play(game, "Austin", dict);
  play(game, "Nice", dict);
  assert.equal(game.reason, "exhausted");
});

test("deadline belongs to the current turn, invalid moves do not reset it", () => {
  const game = startGame("en", 15, 1000);
  const dict = buildDictionary(["London", "Naples"], "en");
  assert.equal(play(game, "London", dict, 15000), null);
  assert.equal(play(game, "London", dict, 20000), "letter");
  expire(game, 30000);
  assert.equal(game.winner, 0);
  assert.equal(play(game, "Naples", dict, 31000), "ended");
});

test("English names also accept Latin letters with no decomposed ASCII base", () => {
  const dict = buildDictionary(["Tromsø", "Łódź"], "en");
  assert.equal(dict.lookup.get("lodz").name, "Łódź");
  assert.equal(lastLetter("Tromsø", "en"), "o");
});

test("custom turn durations cover whole seconds from 1 to 1200", () => {
  for (const limit of [1, 73, 1200]) {
    assert.equal(startGame("en", limit, 100).deadline, 100 + limit * 1000);
  }
  for (const limit of [-1, 0.5, 1201, NaN, "45"]) {
    assert.throws(() => startGame("en", limit), RangeError);
  }
});
