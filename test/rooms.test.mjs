import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "../server.mjs";
import { roomApi } from "../rooms.mjs";

test("two clients join, resume, alternate turns and see the same outcome", async (t) => {
  const server = createServer(roomApi);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port + "/api/rooms";
  async function request(path, body, token) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const { data: host } = await request("", { lang: "ru", limit: 60 });
  const path = "/" + host.code;
  assert.equal(host.game, null);
  assert.equal((await request(path)).status, 403);
  const { data: guest } = await request(path + "/join", {});
  assert.equal(guest.seat, 1);
  assert.notEqual(host.token, guest.token);
  assert.equal((await request(path + "/join", {})).status, 409);
  const wrongSeat = await request(
    path + "/move",
    { city: "Москва", ply: 0 },
    guest.token,
  );
  assert.equal(wrongSeat.data.error, "notTurn");
  let result = await request(
    path + "/move",
    { city: "Москва", ply: 0 },
    host.token,
  );
  assert.equal(result.data.game.next, "а");
  assert.equal(
    (await request(path + "/move", { city: "Афины", ply: 0 }, guest.token)).data
      .error,
    "notTurn",
  );
  assert.equal(
    (await request(path + "/move", { city: "Париж", ply: 1 }, guest.token)).data
      .error,
    "letter",
  );
  result = await request(
    path + "/move",
    { city: "Афины", ply: 1 },
    guest.token,
  );
  assert.equal(result.data.game.next, "н");
  const resumed = await request(path, undefined, host.token);
  assert.deepEqual(resumed.data.game.history, result.data.game.history);
  await request(path + "/leave", { concede: true }, guest.token);
  const final = await request(path, undefined, host.token);
  assert.equal(final.data.game.winner, 0);
  assert.equal(final.data.game.reason, "surrender");
  assert.equal(
    (await request(path + "/move", { city: "Неаполь", ply: 2 }, host.token))
      .data.error,
    "ended",
  );
  const waiting = (await request("", { lang: "en", limit: 0 })).data;
  await request("/" + waiting.code + "/leave", {}, waiting.token);
  assert.equal((await request("/" + waiting.code + "/join", {})).status, 404);
});
