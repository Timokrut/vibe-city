import { limits, validTurnLimit } from "./game.js";

export function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Keep the current selection usable if the browser cannot store it.
  }
}

export function readMenuPreferences() {
  const mode = readPreference("atlas-mode");
  const timer = readPreference("atlas-timer");
  const seconds = Number(readPreference("atlas-custom-seconds"));
  return {
    lang: readPreference("city-atlas-language") === "en" ? "en" : "ru",
    topic:
      readPreference("atlas-topic") === "countries" ? "countries" : "cities",
    mode: ["bot", "online"].includes(mode) ? mode : "local",
    timerChoice:
      timer === "custom"
        ? timer
        : (limits.find((limit) => String(limit) === timer) ?? 0),
    customSeconds: String(
      seconds > 0 && validTurnLimit(seconds) ? seconds : 90,
    ),
    networkTab:
      readPreference("atlas-network-tab") === "join" ? "join" : "create",
  };
}
