import assert from "node:assert/strict";
import test from "node:test";
import { buildDictionary, finish, play, startGame } from "../public/game.js";
import { checkpoint, readSavedGame, saveKey } from "../public/saved-game.js";

function storage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
}
function fixture(t) {
  globalThis.window = { sessionStorage: storage(), localStorage: storage() };
  t.after(() => delete globalThis.window);
  return {
    id: "test-round",
    mode: "local",
    updated: 500,
    game: startGame("en", 15, 0),
  };
}
test("autosave preserves accepted moves and the absolute deadline in both stores", (t) => {
  const round = fixture(t);
  play(
    round.game,
    "Paris",
    buildDictionary(["Paris", "Seoul"], "en"),
    round.updated,
  );
  assert.ok(checkpoint(round));
  assert.deepEqual(readSavedGame("sessionStorage"), round);
  assert.deepEqual(readSavedGame("localStorage"), round);
  assert.equal(round.game.deadline, 15500);
  finish(round.game, 0, "timeout");
  checkpoint(round);
  assert.deepEqual(readSavedGame("sessionStorage"), round);
  assert.equal(readSavedGame("localStorage"), null);
});
test("ending a tab's game preserves the last unfinished game from another tab", (t) => {
  const round = fixture(t);
  const other = { ...round, id: "other", game: startGame("ru") };
  checkpoint(other);
  finish(round.game, 1, "surrender");
  checkpoint(round);
  assert.deepEqual(readSavedGame("localStorage"), other);
});
test("damaged or unsupported saves do not prevent starting a new game", (t) => {
  const round = fixture(t);
  for (const stored of [
    "{",
    "null",
    JSON.stringify({ ...round, mode: "online" }),
    JSON.stringify({ ...round, game: { ...round.game, turn: 1 } }),
  ]) {
    window.sessionStorage.setItem(saveKey, stored);
    assert.equal(readSavedGame("sessionStorage"), null);
  }
  window.localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assert.equal(checkpoint(round), false);
  assert.deepEqual(readSavedGame("sessionStorage"), round);
});
