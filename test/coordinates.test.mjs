import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDictionary } from "../public/game.js";

for (const lang of ["ru", "en"]) {
  test(`every playable ${lang} city and alias has a geographic point`, async () => {
    const load = async (file) => JSON.parse(await readFile(new URL("../public/data/" + file + ".json", import.meta.url)));
    const dictionary = buildDictionary(await load(lang), lang);
    const coordinates = await load(lang + "-coordinates");
    for (const city of dictionary.lookup.values()) {
      const [lon, lat] = coordinates[city.id] ?? [];
      assert.ok(Number.isFinite(lon) && Math.abs(lon) <= 180, city.name);
      assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 85, city.name);
    }
    const moscow = coordinates[dictionary.lookup.get(lang === "ru" ? "москва" : "moscow").id];
    assert.ok(Math.abs(moscow[0] - 37.62) < 0.2 && Math.abs(moscow[1] - 55.75) < 0.2);
  });
}
