import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDictionary, choices, play, startGame } from "../public/game.js";
const load = async (path) =>
  readFile(new URL("../public/" + path, import.meta.url), "utf8");
const countries = JSON.parse(await load("data/countries.json"));

test("every playable country has names in both languages and a selectable border", async () => {
  const map = JSON.parse(await load("data/country-map.json"));
  const borders = await load("assets/country-borders.svg");
  assert.equal(Object.keys(countries).length, 195);
  for (const [id, names] of Object.entries(countries)) {
    assert.ok(
      names.ru.length &&
        names.en.length &&
        map[id].coords.every(Number.isFinite),
      id,
    );
    assert.ok(borders.includes('id="' + id + '"'), id);
  }
});
test("country aliases share an identity and the bot respects the country chain", () => {
  const dict = buildDictionary(countries, "en", "countries");
  const game = startGame("en", 0, 0, "countries");
  assert.equal(play(game, "Paris", dict), "unknown");
  assert.equal(play(game, "USA", dict), null);
  assert.equal(game.history[0].id, "US");
  assert.equal(play(game, "Argentina", dict), null);
  assert.ok(
    choices(game, dict).every(
      (place) => place.key.startsWith("a") && place.id !== "AR",
    ),
  );
  assert.equal(play(game, "Argentina", dict), "repeat");
  assert.equal(dict.lookup.get("unitedstates").id, "US");
  const ru = buildDictionary(countries, "ru", "countries");
  assert.equal(ru.lookup.get("рф").id, ru.lookup.get("россия").id);
});

test("Japan falls back from Я to И, then to Н if И is exhausted", () => {
  const dict = buildDictionary(
    { JP: countries.JP, IN: countries.IN, NP: countries.NP },
    "ru",
    "countries",
  );
  for (const indiaUsed of [false, true]) {
    const game = startGame("ru", 15, 0, "countries");
    if (indiaUsed) assert.equal(play(game, "Индия", dict, 1000), null);
    assert.equal(play(game, "Япония", dict, 2000), null);
    assert.equal(game.winner, null);
    assert.equal(game.next, indiaUsed ? "н" : "и");
    assert.equal(game.deadline, 17000);
    assert.equal(
      play(game, indiaUsed ? "Индия" : "Непал", dict, 2500),
      "letter",
    );
    assert.deepEqual(
      choices(game, dict).map((c) => c.id),
      [indiaUsed ? "NP" : "IN"],
    );
  }
});

test("free move when every letter of the name is exhausted; aliases cannot prolong the game", () => {
  const dict = buildDictionary(
    { JP: countries.JP, US: countries.US },
    "en",
    "countries",
  );
  const game = startGame("en", 0, 0, "countries");
  assert.equal(play(game, "Japan", dict), null);
  assert.equal(game.next, "");
  assert.equal(game.winner, null);
  assert.equal(play(game, "Japan", dict), "repeat");
  assert.equal(play(game, "USA", dict), null);
  assert.equal(game.reason, "exhausted");
  assert.equal(game.winner, 1);
});

for (const lang of ["ru", "en"]) {
  test(`a full ${lang} country chain can use every country before declaring a winner`, () => {
    const dict = buildDictionary(countries, lang, "countries");
    const game = startGame(lang, 0, 0, "countries");
    for (let i = 0; i < Object.keys(countries).length; i++) {
      assert.equal(game.winner, null);
      const reply = choices(game, dict)[0];
      assert.ok(reply);
      assert.equal(play(game, reply.name, dict), null);
    }
    assert.equal(new Set(game.history.map((entry) => entry.id)).size, 195);
    assert.equal(game.reason, "exhausted");
    assert.equal(game.winner, game.history.at(-1).player);
  });
}
