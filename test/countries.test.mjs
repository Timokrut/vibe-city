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
