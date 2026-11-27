import { validTurnLimit } from "./game.js";

// Each tab owns its live game. The most recent unfinished local game also
// has a durable copy so it can be reopened from the menu after closing a tab.
export const saveKey = "atlas-local-game-v1";

export function readSavedGame(storage) {
  try {
    const saved = JSON.parse(window[storage].getItem(saveKey));
    const game = saved?.game;
    if (
      !game ||
      typeof saved.id !== "string" ||
      !["local", "bot"].includes(saved.mode) ||
      !Number.isFinite(saved.updated) ||
      !["ru", "en"].includes(game.lang) ||
      !["cities", "countries"].includes(game.topic) ||
      !validTurnLimit(game.limit) ||
      ![null, 0, 1].includes(game.winner) ||
      !["", "timeout", "exhausted", "surrender"].includes(game.reason) ||
      (game.winner === null) !== (game.reason === "") ||
      !(game.winner === null && game.limit
        ? Number.isSafeInteger(game.deadline)
        : game.deadline === null) ||
      typeof game.next !== "string" ||
      !Array.isArray(game.history) ||
      game.turn !== game.history.length % 2 ||
      !game.history.every(
        (move, i) =>
          move &&
          typeof move.name === "string" &&
          typeof move.id === "string" &&
          move.player === i % 2,
      )
    )
      return null;
    return saved;
  } catch {
    return null;
  }
}

export function storeGame(storage, saved) {
  try {
    if (saved) window[storage].setItem(saveKey, JSON.stringify(saved));
    else window[storage].removeItem(saveKey);
    return true;
  } catch {
    return false;
  }
}

export function checkpoint(saved) {
  const tabSaved = storeGame("sessionStorage", saved);
  if (saved.game.winner === null) {
    const durable = storeGame("localStorage", saved);
    return tabSaved && durable;
  }
  if (readSavedGame("localStorage")?.id === saved.id)
    storeGame("localStorage", null);
  return tabSaved;
}
