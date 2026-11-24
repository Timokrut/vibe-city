export const limits = [0, 15, 30, 60, 120];

export function normalize(value, lang) {
  const lower = value.trim().toLowerCase();
  const plain = lang === 'ru' ? lower.replaceAll('ё', 'е') : lower.normalize('NFD').replace(/\p{M}/gu, '');
  return plain.replace(/[\s.'’ʼ‐‑–—-]/gu, '');
}

export function lastLetter(name, lang) {
  return normalize(name, lang).replace(lang === 'ru' ? /[ьъы]+$/u : /[^a-z]+$/u, '').at(-1);
}

export function buildDictionary(rows, lang) {
  const lookup = new Map();
  const byLetter = new Map();
  for (const row of rows) {
    const names = Array.isArray(row) ? row : [row];
    const id = normalize(names[0], lang);
    for (const name of names) {
      const key = normalize(name, lang);
      if (!key || lookup.has(key)) continue;
      const city = { id, name, key };
      lookup.set(key, city);
      if (!byLetter.has(key[0])) byLetter.set(key[0], []);
      byLetter.get(key[0]).push(city);
    }
  }
  return { lookup, byLetter };
}

export function startGame(lang, limit = 0, now = Date.now()) {
  return { lang, limit, turn: 0, next: '', history: [], winner: null, reason: '', deadline: limit ? now + limit * 1000 : null };
}

export function finish(game, winner, reason) {
  if (game.winner !== null) return;
  Object.assign(game, { winner, reason, deadline: null });
}

export function expire(game, now = Date.now()) {
  if (game.deadline !== null && now >= game.deadline) finish(game, 1 - game.turn, 'timeout');
}

export function choices(game, dictionary) {
  const used = new Set(game.history.map(city => city.id));
  const pool = game.next ? dictionary.byLetter.get(game.next) || [] : dictionary.lookup.values();
  return Array.from(pool).filter(city => !used.has(city.id));
}

export function play(game, text, dictionary, now = Date.now()) {
  expire(game, now);
  if (game.winner !== null) return 'ended';
  const key = normalize(text, game.lang);
  if (!key) return 'empty';
  if (game.next && key[0] !== game.next) return 'letter';
  const city = dictionary.lookup.get(key);
  if (!city) return 'unknown';
  if (game.history.some(used => used.id === city.id)) return 'repeat';
  game.history.push({ id: city.id, name: city.name, player: game.turn });
  game.next = lastLetter(city.name, game.lang);
  game.turn = 1 - game.turn;
  game.deadline = game.limit ? now + game.limit * 1000 : null;
  if (!choices(game, dictionary).length) finish(game, 1 - game.turn, 'exhausted');
  return null;
}

