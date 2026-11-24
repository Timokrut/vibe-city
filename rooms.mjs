import { randomBytes, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  startGame,
  play,
  expire,
  finish,
  buildDictionary,
  dictionaryFile,
  validTurnLimit,
} from "./public/game.js";

const rooms = new Map();
const dictionaries = new Map();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ttl = 6 * 60 * 60 * 1000;

async function dictionary(lang, topic) {
  const key = topic + "/" + lang;
  if (!dictionaries.has(key)) {
    const data = await readFile(
      new URL("./public/data/" + dictionaryFile(lang, topic), import.meta.url),
    );
    dictionaries.set(key, buildDictionary(JSON.parse(data), lang, topic));
  }
  return dictionaries.get(key);
}

function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2048) throw new Error("large");
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("invalid");
  return body;
}

function snapshot(room, seat) {
  if (room.game) expire(room.game);
  return {
    code: room.code,
    seat,
    lang: room.lang,
    limit: room.limit,
    topic: room.topic,
    game: room.game,
    serverNow: Date.now(),
  };
}

const cleanup = setInterval(() => {
  for (const [key, room] of rooms)
    if (Date.now() - room.activeAt > ttl) rooms.delete(key);
}, 60000);
cleanup.unref();

export async function roomApi(req, res, path) {
  const match =
    /^\/api\/rooms(?:\/([A-Z2-9]{6})(?:\/(join|move|leave))?)?$/.exec(path);
  const fail = (status, error) => json(res, status, { error });
  if (!match) return fail(404, "missing");
  const [, code, action] = match;
  if (req.method !== (code && !action ? "GET" : "POST"))
    return fail(405, "invalid");
  let body = {};
  if (req.method === "POST") {
    try {
      body = await readBody(req);
    } catch {
      return fail(400, "invalid");
    }
  }
  if (!code) {
    const topic = body.topic === undefined ? "cities" : body.topic;
    if (!["cities", "countries"].includes(topic)) return fail(400, "invalid");
    if (!["ru", "en"].includes(body.lang) || !validTurnLimit(body.limit))
      return fail(400, "invalid");
    await dictionary(body.lang, topic);
    let id;
    do {
      id = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    } while (rooms.has(id));
    const token = randomBytes(24).toString("hex");
    const room = {
      code: id,
      topic,
      lang: body.lang,
      limit: body.limit,
      tokens: [token],
      game: null,
      activeAt: Date.now(),
    };
    rooms.set(id, room);
    return json(res, 201, { ...snapshot(room, 0), token });
  }
  const room = rooms.get(code);
  if (!room) return fail(404, "missing");
  if (action === "join") {
    if (room.tokens.length === 2) return fail(409, "full");
    const token = randomBytes(24).toString("hex");
    room.tokens.push(token);
    room.activeAt = Date.now();
    room.game = startGame(room.lang, room.limit, Date.now(), room.topic);
    return json(res, 200, { ...snapshot(room, 1), token });
  }
  const seat = room.tokens.indexOf(
    req.headers.authorization?.replace(/^Bearer /, ""),
  );
  if (seat < 0) return fail(403, "access");
  room.activeAt = Date.now();
  if (room.game) expire(room.game);
  if (action === "leave") {
    if (room.game)
      finish(room.game, 1 - seat, body.concede ? "surrender" : "left");
    else rooms.delete(code);
    return json(res, 200, { ok: true, game: room.game });
  }
  if (action === "move") {
    const game = room.game;
    if (!game || game.winner !== null) return fail(409, "ended");
    if (game.turn !== seat || body.ply !== game.history.length)
      return fail(409, "notTurn");
    if (typeof body.city !== "string" || body.city.length > 150)
      return fail(400, "invalid");
    const error = play(
      game,
      body.city,
      dictionaries.get(room.topic + "/" + room.lang),
    );
    if (error) return fail(422, error);
  }
  json(res, 200, snapshot(room, seat));
}
