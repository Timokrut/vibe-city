import {
  limits,
  maxTurnSeconds,
  validTurnLimit,
  startGame,
  buildDictionary,
  dictionaryFile,
  play,
  choices,
  expire,
  finish,
} from "./game.js";
import { showRoundMap } from "./round-map.js";
import { icon } from "./icons.js";
import { createVoiceInput } from "./speech.js";

const voice = createVoiceInput(
  window.SpeechRecognition || window.webkitSpeechRecognition,
  {
    canListen: () =>
      myTurn() &&
      !busy &&
      !modal.open &&
      !document.hidden &&
      (!game.deadline || Date.now() + clockOffset < game.deadline),
    language: () => game.lang,
    onStatus: updateVoiceStatus,
    onCity: (city) => {
      const input = $("#city");
      input.value = city;
      input.form.requestSubmit();
    },
  },
);

const $ = (selector) => document.querySelector(selector);
const main = $("#main");
const modal = $("#modal");
const dictionaries = new Map();
const mapView = { zoom: false };
const roomKey = "city-atlas-room-v1";
let lang = localStorage.getItem("city-atlas-language") === "en" ? "en" : "ru";
let topic = "cities";
let mode = "local",
  timerChoice = 0,
  customSeconds = "90",
  networkTab = "create",
  typedCode = "";
let game = null,
  room = null,
  dictionary = null,
  clockOffset = 0;
let busy = false,
  polling = false,
  botTimer,
  networkError = "",
  confirmation;
const t = (ru, en) => (lang === "ru" ? ru : en);
const placeText = (citiesRu, citiesEn, countriesRu, countriesEn) =>
  topic === "countries" ? t(countriesRu, countriesEn) : t(citiesRu, citiesEn);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const modes = () => ({
  local: [
    t("На одном устройстве", "Pass & play"),
    t("Играйте вдвоём по очереди", "Take turns on one device"),
  ],
  bot: [
    t("Против бота", "Against a bot"),
    t("Бросьте вызов компьютеру", "Challenge the computer"),
  ],
  online: [
    t("По сети", "Online duel"),
    t("Пригласите друга в комнату", "Invite a friend to your room"),
  ],
});
const stamp = (key) =>
  '<span class="stamp ' + key + '">' + icon(key, 30) + "</span>";
const player = (n) =>
  mode === "bot"
    ? n
      ? t("Бот", "Bot")
      : t("Вы", "You")
    : t("Игрок ", "Player ") + (n + 1);
const myTurn = () =>
  game &&
  game.winner === null &&
  (mode === "local" || game.turn === (room?.seat ?? 0));
const messages = () => ({
  empty: placeText(
    "Введите название города.",
    "Enter a city name.",
    "Введите название страны.",
    "Enter a country name.",
  ),
  letter:
    placeText(
      "Нужен город на букву ",
      "Choose a city starting with ",
      "Нужна страна на букву ",
      "Choose a country starting with ",
    ) +
    (game?.next || "").toUpperCase() +
    ".",
  unknown: placeText(
    "Этого города нет в словаре. Проверьте название или назовите другой город.",
    "City not found. Check the spelling or try another city.",
    "Этой страны нет в словаре. Проверьте название или назовите другую страну.",
    "Country not found. Check the spelling or try another country.",
  ),
  repeat: placeText(
    "Этот город уже был в цепочке.",
    "That city has already been played.",
    "Эта страна уже была в цепочке.",
    "That country has already been played.",
  ),
  ended: t("Партия окончена.", "The game has ended."),
  notTurn: t("Дождитесь своего хода.", "Wait for your turn."),
  timerRange: t(
    "Введите целое число от 1 до 1200 секунд.",
    "Enter a whole number from 1 to 1200 seconds.",
  ),
  invalid: t("Проверьте введённые данные.", "Check your entry."),
  missing: t(
    "Комната не найдена. Проверьте код.",
    "Room not found. Check the code.",
  ),
  full: t("В комнате уже два игрока.", "This room already has two players."),
  access: t("Сеанс комнаты завершён.", "Your room session has ended."),
  connection: t(
    "Нет связи с сервером. Проверьте подключение.",
    "Cannot reach the server. Check your connection.",
  ),
});
function message(code) {
  return messages()[code] || messages().connection;
}
function notify(code) {
  const el = $("#notice");
  if (el) el.textContent = code ? message(code) : "";
}
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const button = $("#theme");
  button.innerHTML = icon(dark ? "sun" : "moon", 19);
  button.setAttribute("aria-label", t("Тёмная тема", "Dark theme"));
  button.setAttribute("aria-pressed", String(dark));
  button.title = dark
    ? t("Включить светлую тему", "Use light theme")
    : t("Включить тёмную тему", "Use dark theme");
  $('meta[name="theme-color"]').content = dark ? "#14201e" : "#f9f7f0";
}
$("#theme").addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("atlas-theme", theme);
  updateThemeButton();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  ({ matches }) => {
    if (localStorage.getItem("atlas-theme")) return;
    document.documentElement.dataset.theme = matches ? "dark" : "light";
    updateThemeButton();
  },
);
const screenButton = $("#fullscreen");
const root = document.documentElement;
const enterFullscreen = root.requestFullscreen ?? root.webkitRequestFullscreen;
const leaveFullscreen =
  document.exitFullscreen ?? document.webkitExitFullscreen;
const isFullscreen = () =>
  Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);

function updateScreenButton() {
  const active = isFullscreen();
  screenButton.disabled =
    !enterFullscreen ||
    !leaveFullscreen ||
    (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) === false;
  screenButton.innerHTML = icon(active ? "collapse" : "expand", 18);
  screenButton.setAttribute("aria-pressed", String(active));
  screenButton.setAttribute("aria-label", t("Полный экран", "Full screen"));
  screenButton.title = screenButton.disabled
    ? t(
        "Полный экран недоступен в этом браузере",
        "Full screen is unavailable in this browser",
      )
    : active
      ? t("Выйти из полного экрана", "Exit full screen")
      : t("На весь экран", "Enter full screen");
}
screenButton.addEventListener("click", async () => {
  $("#screen-notice").textContent = "";
  try {
    if (isFullscreen()) await leaveFullscreen.call(document);
    else await enterFullscreen.call(root);
  } catch {
    $("#screen-notice").textContent = t(
      "Браузер не разрешил изменить полноэкранный режим.",
      "The browser could not switch full-screen mode.",
    );
  }
  updateScreenButton();
});
for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
  document.addEventListener(event, updateScreenButton);
}

function header() {
  updateScreenButton();
  document.documentElement.lang = lang;
  updateThemeButton();
  const rules = t("Правила", "Rules");
  $("#rules").innerHTML = icon("book", 18) + "<span>" + rules + "</span>";
  $("#rules").setAttribute("aria-label", rules);
  document.querySelectorAll("[data-lang]").forEach((button) => {
    const selected = button.dataset.lang === lang;
    button.classList.toggle("sel", selected);
    button.setAttribute("aria-pressed", selected);
  });
}
function hero() {
  const citySample =
    lang === "ru"
      ? ["Москв<b>а</b>", "<b>А</b>фи<b>н</b>ы", "<b>Н</b>еаполь"]
      : ["Pari<b>s</b>", "<b>S</b>eou<b>l</b>", "<b>L</b>ondon"];

  const countrySample =
    lang === "ru"
      ? ["Канад<b>а</b>", "<b>А</b>нгол<b>а</b>", "<b>А</b>лжир"]
      : ["Japa<b>n</b>", "<b>N</b>orwa<b>y</b>", "<b>Y</b>emen"];
  const sample = topic === "countries" ? countrySample : citySample;
  return (
    '<section class="hero"><div class="hero-copy"><div class="caption">' +
    icon("route", 16) +
    t("Игра на последнюю букву", "The last-letter game") +
    "</div><h1>Atlas</h1><p>" +
    placeText(
      "Назовите город на последнюю букву предыдущего. Как далеко вы доберётесь?",
      "Name a city starting with the last letter of the previous city. How far can you go?",
      "Назовите страну на последнюю букву предыдущей. Сколько стран появится на вашей карте?",
      "Name a country starting with the last letter of the previous one. How many can you put on the map?",
    ) +
    '</p><div class="hero-route">' +
    sample.map((name) => "<span>" + name + "</span>").join(icon("arrow", 14)) +
    "</div></div></section>"
  );
}
function lobby() {
  const join = mode === "online" && networkTab === "join";
  const topics = ["cities", "countries"]
    .map(
      (key) =>
        `<button type="button" data-topic="${key}" aria-pressed="${topic === key}">${icon(key === "cities" ? "pin" : "online", 16)}${key === "cities" ? t("Города", "Cities") : t("Страны", "Countries")}</button>`,
    )
    .join("");
  const cards = Object.entries(modes())
    .map(
      ([key, [name, desc]]) =>
        '<button class="mode ' +
        (key === mode ? "chosen" : "") +
        '" data-mode="' +
        key +
        '" aria-pressed="' +
        (key === mode) +
        '">' +
        stamp(key) +
        '<span class="radio">' +
        icon("check", 13) +
        "</span><strong>" +
        name +
        "</strong><small>" +
        desc +
        "</small></button>",
    )
    .join("");
  let network = "";
  if (mode === "online") {
    const tabs = ["create", "join"]
      .map(
        (key, i) =>
          '<button data-net="' +
          key +
          '" class="chip ' +
          (key === networkTab ? "on" : "") +
          '" aria-pressed="' +
          (key === networkTab) +
          '">' +
          (i
            ? t("Войти по коду", "Join by code")
            : t("Создать комнату", "Create room")) +
          "</button>",
      )
      .join("");
    network =
      '<div class="net-panel"><div class="net-tabs">' +
      tabs +
      "</div>" +
      (join
        ? '<label class="room-input">' +
          t("Код комнаты", "Room code") +
          ' <input id="room-code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" value="' +
          esc(typedCode) +
          '"></label>'
        : "") +
      "</div>";
  }
  const timerOptions = [...limits, "custom"]
    .map((value) => {
      const selected = timerChoice === value;
      const label =
        value === "custom"
          ? t("Свой лимит", "Custom")
          : value === 0
            ? t("Без лимита", "No limit")
            : value + t(" сек", " sec");
      return `<button data-time="${value}" class="chip ${selected ? "on" : ""}" aria-pressed="${selected}">${label}</button>`;
    })
    .join("");
  const customField =
    timerChoice === "custom"
      ? `
    <div class="custom-timer">
      <label for="seconds">${t("Секунд на ход", "Seconds per turn")}</label>
      <input id="seconds" type="number" min="1" max="${maxTurnSeconds}" step="1" required inputmode="numeric" aria-describedby="timer-hint" value="${esc(customSeconds)}">
      <span id="timer-hint" class="sub">${t("До 20 минут", "Up to 20 minutes")}</span>
    </div>`
      : "";
  const timer = `<div class="timer-panel">
    <div class="timer-title">${icon("clock", 21)}${t("Время на ход", "Turn timer")}</div>
    <div class="timer-opts">${timerOptions}</div>${customField}</div>`;
  main.innerHTML =
    hero() +
    `<section class="setup"><div class="setup-heading"><h2 class="section-title">` +
    t("Режим игры", "Game mode") +
    `</h2><div class="topic-switch" role="group" aria-label="${t("Тема игры", "Game topic")}">${topics}</div></div><div class="cards">` +
    cards +
    "</div>" +
    network +
    (join ? "" : timer) +
    '<p class="notice" role="status" id="notice"></p><div class="launch"><button class="primary" id="start">' +
    (join
      ? t("Войти в комнату", "Join room")
      : mode === "online"
        ? t("Создать комнату", "Create room")
        : t("Начать игру", "Start game")) +
    icon("arrow", 19) +
    "</button></div></section>";
}
function topLine() {
  return (
    '<div class="topline"><button class="plain" id="exit">' +
    icon("back", 17) +
    t("В меню", "Menu") +
    '</button><span class="mode-label">' +
    icon(mode, 17) +
    placeText("Города", "Cities", "Страны", "Countries") +
    " · " +
    modes()[mode][0] +
    "</span></div>"
  );
}
function waiting() {
  main.innerHTML =
    '<div class="game-wrap">' +
    topLine() +
    '<section class="panel waiting">' +
    stamp("online") +
    "<h1>" +
    t("Ожидаем соперника", "Waiting for an opponent") +
    '</h1><p class="sub">' +
    t(
      "Передайте другу код комнаты. Игра начнётся, когда он присоединится.",
      "Share the room code with a friend. The game starts when they join.",
    ) +
    '</p><div class="room-row"><strong class="room-code">' +
    esc(room.code) +
    '</strong><button class="copy" id="copy" aria-label="' +
    t("Скопировать код", "Copy code") +
    '">' +
    icon("copy") +
    '</button></div><p class="notice" id="notice" role="status"></p></section></div>';
}
function board() {
  const done = game.winner !== null;
  const last = game.history.at(-1);
  const players = [0, 1]
    .map(
      (n) =>
        '<div class="player ' +
        ((done ? game.winner : game.turn) === n ? "current" : "") +
        '">' +
        icon(n === 1 && mode === "bot" ? "bot" : "pin", 16) +
        player(n) +
        (room?.seat === n ? t(" (вы)", " (you)") : "") +
        '<span class="count">' +
        game.history.filter((h) => h.player === n).length +
        "</span></div>",
    )
    .join("");
  const why = {
    timeout: t("Время на ход истекло.", "Time ran out."),
    exhausted: placeText(
      "В словаре закончились подходящие города.",
      "No matching cities remain in the dictionary.",
      "В словаре закончились подходящие страны.",
      "No matching countries remain in the dictionary.",
    ),
    left: t("Соперник вышел из комнаты.", "Your opponent left the room."),
    surrender: t("Один из игроков сдался.", "A player conceded."),
  };
  const heading = done
    ? t("Победа", "Winner") + " · " + player(game.winner)
    : last
      ? placeText(
          "Город на «",
          "City starting with “",
          "Страна на «",
          "Country starting with “",
        ) +
        esc(game.next.toUpperCase()) +
        t("»", "”")
      : placeText(
          "Назовите первый город",
          "Name the first city",
          "Назовите первую страну",
          "Name the first country",
        );
  const info = done
    ? why[game.reason]
    : last
      ? placeText(
          "Предыдущий город — ",
          "Previous city — ",
          "Предыдущая страна — ",
          "Previous country — ",
        ) + esc(last.name)
      : placeText(
          "Подойдёт город на любую букву.",
          "Start with any city.",
          "Подойдёт страна на любую букву.",
          "Start with any country.",
        );
  const disabled = myTurn() ? "" : " disabled";
  const form =
    '<form class="field" id="move"><input id="city" maxlength="150" aria-label="' +
    placeText(
      "Название города",
      "City name",
      "Название страны",
      "Country name",
    ) +
    '" placeholder="' +
    placeText(
      "Название города",
      "City name",
      "Название страны",
      "Country name",
    ) +
    '" autocomplete="off" enterkeyhint="send"' +
    disabled +
    '><button class="icon-btn" id="mic" type="button" aria-pressed="false" title="' +
    t("Голосовая игра с автоотправкой", "Hands-free voice play") +
    '" aria-label="' +
    t("Голосовая игра с автоотправкой", "Hands-free voice play") +
    '"' +
    (myTurn() || voice.enabled ? "" : " disabled") +
    ">" +
    icon("mic") +
    '</button><button class="primary"' +
    disabled +
    ">" +
    placeText("Ответить", "Play city", "Ответить", "Play country") +
    icon("arrow", 17) +
    '</button></form><p class="voice-status" id="voice-status" role="status"></p>';
  main.innerHTML =
    '<div class="game-wrap">' +
    topLine() +
    '<section class="panel"><div class="players">' +
    players +
    '</div><div class="turn-title"><span class="caption">' +
    icon(done ? "flag" : "route", 16) +
    (done
      ? t("Итог игры", "Game over")
      : t("Ход", "Turn") +
        " " +
        (game.history.length + 1) +
        " · " +
        player(game.turn)) +
    '</span><span class="time" id="time"></span></div><h1>' +
    heading +
    '</h1><p class="sub">' +
    info +
    "</p>" +
    (done
      ? '<button class="primary" id="again">' +
        t("Новая игра", "New game") +
        icon("arrow", 18) +
        "</button>"
      : form) +
    '<p class="notice" id="notice" role="status"></p>' +
    (!done && !myTurn()
      ? '<p class="sub">' +
        (mode === "bot"
          ? placeText(
              "Бот выбирает город…",
              "The bot is choosing a city…",
              "Бот выбирает страну…",
              "The bot is choosing a country…",
            )
          : t("Ожидаем ход соперника…", "Waiting for your opponent…")) +
        "</p>"
      : "") +
    '</section><div class="game-actions"><span class="sub">' +
    (room ? t("Комната ", "Room ") + esc(room.code) + " · " : "") +
    (game.lang === "ru" ? "Русский" : "English") +
    "</span>" +
    (!done
      ? '<button id="concede" class="link-btn">' +
        t("Сдаться", "Concede") +
        "</button>"
      : "") +
    '</div><section class="round-map" id="round-map"></section>' +
    (last
      ? '<h2 class="history-title">' +
        placeText(
          "Цепочка городов",
          "City chain",
          "Цепочка стран",
          "Country chain",
        ) +
        '</h2><ol class="history" reversed>' +
        game.history
          .slice()
          .reverse()
          .map(
            (h, i) =>
              "<li><span>" +
              String(game.history.length - i).padStart(2, "0") +
              "</span><strong>" +
              esc(h.name) +
              "</strong><span>" +
              player(h.player) +
              "</span></li>",
          )
          .join("") +
        "</ol>"
      : "") +
    "</div>";
  showRoundMap($("#round-map"), game, { t, player, lang, view: mapView });
  updateClock();
  if (networkError) notify(networkError);
}
function draw() {
  if (!game || game.winner !== null) voice.disable();
  else voice.pause();
  header();
  if (game) board();
  else if (room) waiting();
  else lobby();
  voice.sync();
}
function updateClock() {
  const el = $("#time");
  if (!game?.deadline || !el) return;
  const remaining = Math.max(
    0,
    Math.ceil((game.deadline - Date.now() - clockOffset) / 1000),
  );
  el.classList.toggle("urgent", remaining <= 5);
  el.innerHTML = icon("clock", 16) + remaining + t(" сек", " sec");
}
async function api(path, body, token) {
  const response = await fetch("/api/rooms" + path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
function sync(data) {
  const changed =
    !room ||
    !game !== !data.game ||
    game?.history.length !== data.game?.history.length ||
    game?.winner !== data.game?.winner;
  clockOffset = data.serverNow - Date.now();
  room = {
    ...room,
    code: data.code,
    token: data.token || room?.token,
    seat: data.seat,
  };
  game = data.game;
  topic = data.topic ?? game?.topic ?? "cities";
  mode = "online";
  sessionStorage.setItem(roomKey, JSON.stringify(room));
  if (changed || !$("#exit")) draw();
}
async function poll() {
  if (!room || polling || busy || game?.winner != null) return;
  polling = true;
  const token = room.token;
  try {
    const data = await api("/" + room.code, undefined, token);
    if (room?.token !== token || busy) return;
    if (networkError) {
      networkError = "";
      notify("");
    }
    if (
      game &&
      data.game &&
      (data.game.history.length < game.history.length || game.winner !== null)
    )
      return;
    sync(data);
  } catch (error) {
    if (room?.token === token) {
      if (["missing", "access"].includes(error.message)) reset();
      networkError = error.message;
      notify(networkError);
    }
  } finally {
    polling = false;
  }
}
async function begin() {
  if (busy) return;
  const limit = timerChoice === "custom" ? Number(customSeconds) : timerChoice;
  const customInput = $("#seconds");
  if (
    customInput &&
    (!validTurnLimit(limit) || limit === 0 || !customInput.validity.valid)
  ) {
    customInput.setAttribute("aria-invalid", "true");
    customInput.focus();
    return notify("timerRange");
  }
  busy = true;
  $("#start").disabled = true;
  networkError = "";
  try {
    if (mode === "online") {
      if (networkTab === "join" && !/^[A-Z2-9]{6}$/.test(typedCode))
        throw new Error("invalid");
      const data =
        networkTab === "join"
          ? await api("/" + typedCode + "/join", {})
          : await api("", { lang, limit, topic });
      lang = data.lang;
      sync(data);
    } else {
      const chosenLang = lang;
      const key = topic + "/" + chosenLang;
      if (!dictionaries.has(key)) {
        const response = await fetch(
          "/data/" + dictionaryFile(chosenLang, topic),
        );
        if (!response.ok) throw new Error("connection");
        dictionaries.set(
          key,
          buildDictionary(await response.json(), chosenLang, topic),
        );
      }
      dictionary = dictionaries.get(key);
      game = startGame(chosenLang, limit, Date.now(), topic);
      draw();
      $("#city")?.focus();
    }
  } catch (error) {
    notify(error.message);
  } finally {
    busy = false;
    if ($("#start")) $("#start").disabled = false;
  }
}
function scheduleBot() {
  clearTimeout(botTimer);
  if (mode !== "bot" || game?.winner !== null || game.turn !== 1) return;
  botTimer = setTimeout(() => {
    const pool = choices(game, dictionary);
    // Prefer widely known places, keeping some variety between games.
    const city = pool[Math.floor(Math.random() * Math.min(pool.length, 30))];
    if (city) play(game, city.name, dictionary);
    else finish(game, 0, "exhausted");
    draw();
    $("#city")?.focus();
  }, 700);
}
async function submit(event) {
  event.preventDefault();
  if (!myTurn() || busy) return;
  voice.pause();
  const input = $("#city");
  const city = input.value.trim();
  if (!city) {
    notify("empty");
    voice.sync();
    return;
  }
  if (room) {
    busy = true;
    try {
      sync(
        await api(
          "/" + room.code + "/move",
          { city, ply: game.history.length },
          room.token,
        ),
      );
    } catch (error) {
      notify(error.message);
    } finally {
      busy = false;
      voice.sync();
    }
    return;
  }
  const error = play(game, city, dictionary);
  if (error && game.winner === null) {
    notify(error);
    voice.sync();
    input.focus();
    return;
  }
  draw();
  scheduleBot();
  if (myTurn()) $("#city")?.focus();
}
function updateVoiceStatus(state) {
  const button = $("#mic"),
    status = $("#voice-status");
  if (!button || !status) return;
  const descriptions = {
    idle: "",
    ready: placeText(
      "Назовите следующий город.",
      "Say the next city.",
      "Назовите следующую страну.",
      "Say the next country.",
    ),
    listening: placeText(
      "Слушаю. Назовите город — ход отправится автоматически.",
      "Listening. Say a city to play it automatically.",
      "Слушаю. Назовите страну — ход отправится автоматически.",
      "Listening. Say a country to play it automatically.",
    ),
    paused: t("Голосовой режим на паузе.", "Voice input paused."),
    unsupported: placeText(
      "В этом браузере голосовой ввод недоступен. Введите город с клавиатуры.",
      "Voice input is unavailable in this browser. Type your city.",
      "В этом браузере голосовой ввод недоступен. Введите страну с клавиатуры.",
      "Voice input is unavailable in this browser. Type your country.",
    ),
    "not-allowed": t(
      "Разрешите доступ к микрофону в настройках сайта. Для игры по сети используйте HTTPS.",
      "Allow microphone access in site settings. Use HTTPS when playing over a network.",
    ),
    "no-speech": placeText(
      "Не удалось расслышать город. Попробуйте ещё раз.",
      "No city heard. Try again.",
      "Не удалось расслышать страну. Попробуйте ещё раз.",
      "No country heard. Try again.",
    ),
    "audio-capture": t(
      "Микрофон недоступен. Проверьте подключение.",
      "Microphone unavailable. Check your microphone.",
    ),
    network: placeText(
      "Сервис распознавания недоступен. Проверьте подключение или введите город.",
      "Speech service unavailable. Check your connection or type your city.",
      "Сервис распознавания недоступен. Проверьте подключение или введите страну.",
      "Speech service unavailable. Check your connection or type your country.",
    ),
    unavailable: placeText(
      "Не удалось запустить распознавание. Введите город с клавиатуры.",
      "Could not start recognition. Type your city instead.",
      "Не удалось запустить распознавание. Введите страну с клавиатуры.",
      "Could not start recognition. Type your country instead.",
    ),
  };
  status.textContent = descriptions[state] ?? descriptions.unavailable;
  button.classList.toggle("active-mic", state === "listening");
  button.setAttribute("aria-pressed", String(voice.enabled));
  button.disabled = !myTurn() && !voice.enabled;
  button.title = voice.enabled
    ? t("Выключить голосовую игру", "Turn off voice play")
    : t("Голосовая игра с автоотправкой", "Hands-free voice play");
}

function dialog(title, content, action) {
  voice.pause();
  confirmation = action;
  $("#dialog-content").innerHTML =
    '<div class="dialog-head"><h2 id="dialog-title">' +
    title +
    '</h2><button class="icon-btn" data-close aria-label="' +
    t("Закрыть", "Close") +
    '">' +
    icon("close", 18) +
    "</button></div>" +
    content;
  modal.setAttribute("aria-labelledby", "dialog-title");
  modal.showModal();
}
function rules() {
  const entries = [
    placeText(
      "Первый игрок называет любой город. Следующий называет город на последнюю букву предыдущего.",
      "The first player names any city. The next player names a city starting with its last letter.",
      "Первый игрок называет любую страну. Следующий называет страну на последнюю букву предыдущей.",
      "The first player names any country. The next player names a country starting with its last letter.",
    ),
    placeText(
      "Города должны быть в словаре выбранного языка. Повторять город, в том числе под другим названием, нельзя.",
      "Use cities from the selected language’s dictionary. Each city can be used once, including its alternate names.",
      "В словаре 195 стран. Можно использовать известные варианты названий, но каждую страну можно назвать только один раз.",
      "The dictionary contains 195 countries. Common alternative names are accepted. Each country can be played once.",
    ),
    placeText(
      "В русском языке пропускаем конечные ь, ъ и ы. Например, после Перми нужен город на М. Ё и Е считаются одной буквой.",
      "In Russian, skip final ь, ъ and ы. Ё and Е count as the same letter.",
      "В русском языке пропускаем конечные ь, ъ и ы. Например, после Беларуси («Беларусь») нужна страна на С. Ё и Е считаются одной буквой.",
      "In Russian, skip final ь, ъ and ы. Ё and Е count as the same letter.",
    ),
    placeText(
      "Игрок проигрывает, если сдаётся, исчерпывает время или в словаре не осталось подходящего ответа.",
      "A player loses by conceding, running out of time, or having no matching city left in the dictionary.",
      "Игрок проигрывает, если сдаётся, исчерпывает время или в словаре не осталось подходящей страны.",
      "A player loses by conceding, running out of time, or having no matching country left in the dictionary.",
    ),
  ];
  dialog(
    t("Правила игры", "How to play"),
    '<ol class="rules-list">' +
      entries.map((s) => "<li>" + s + "</li>").join("") +
      "</ol>",
  );
}
function reset() {
  mapView.zoom = false;
  clearTimeout(botTimer);
  sessionStorage.removeItem(roomKey);
  game = null;
  room = null;
  clockOffset = 0;
  networkError = "";
  draw();
}
async function leave(concede) {
  if (busy) return;
  if (!room && (!concede || game?.winner !== null)) return reset();
  if (room && game?.winner != null) return reset();
  if (room) {
    busy = true;
    try {
      const result = await api(
        "/" + room.code + "/leave",
        { concede },
        room.token,
      );
      if (concede && game) {
        game = result.game;
        draw();
      } else reset();
    } catch (error) {
      if (["access", "missing"].includes(error.message)) reset();
      notify(error.message);
    } finally {
      busy = false;
    }
  } else {
    clearTimeout(botTimer);
    finish(game, mode === "bot" ? 1 : 1 - game.turn, "surrender");
    draw();
  }
}
function askLeave(concede) {
  if (busy) return;
  if ((!game && !room) || game?.winner != null) return reset();
  const title = concede
    ? t("Сдаться?", "Concede?")
    : t("Выйти в меню?", "Return to menu?");
  const detail =
    room && !game
      ? t("Комната закроется.", "The room will close.")
      : t("Текущая партия завершится.", "The current game will end.");
  dialog(
    title,
    '<p class="sub">' +
      detail +
      '</p><div class="modal-actions"><button class="plain" data-close>' +
      t("Продолжить игру", "Keep playing") +
      '</button><button class="primary" id="confirm">' +
      (concede ? t("Сдаться", "Concede") : t("Выйти", "Leave")) +
      "</button></div>",
    () => leave(concede),
  );
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button,a");
  if (!b) return;
  if (b.id === "brand") {
    event.preventDefault();
    askLeave(false);
    return;
  }
  if (b.id === "rules") return rules();
  if (b.hasAttribute("data-close")) return modal.close();
  if (b.id === "confirm") {
    modal.close();
    return confirmation?.();
  }
  if (busy) return;
  if (b.dataset.lang) {
    lang = b.dataset.lang;
    localStorage.setItem("city-atlas-language", lang);
    draw();
  }
  if (b.dataset.topic) {
    topic = b.dataset.topic;
    draw();
  }
  if (b.dataset.mode) {
    mode = b.dataset.mode;
    draw();
  }
  if (b.dataset.time) {
    timerChoice =
      b.dataset.time === "custom" ? "custom" : Number(b.dataset.time);
    draw();
    if (timerChoice === "custom") $("#seconds").select();
  }
  if (b.dataset.net) {
    networkTab = b.dataset.net;
    draw();
  }
  if (b.id === "mic" && (voice.enabled || myTurn())) voice.toggle();
  if (b.id === "start") await begin();
  if (b.id === "exit") askLeave(false);
  if (b.id === "again") reset();
  if (b.id === "concede") askLeave(true);
  if (b.id === "copy") {
    try {
      await navigator.clipboard.writeText(room.code);
      b.innerHTML = icon("check");
    } catch {
      const range = document.createRange();
      range.selectNodeContents($(".room-code"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
});
main.addEventListener("input", (e) => {
  if (e.target.id === "seconds") {
    customSeconds = e.target.value;
    e.target.removeAttribute("aria-invalid");
    notify("");
  }
  if (e.target.id === "room-code") {
    typedCode = e.target.value.trim().toUpperCase();
    e.target.value = typedCode;
  }
});
main.addEventListener("submit", (event) => {
  if (event.target.id === "move") submit(event);
});
modal.addEventListener("close", () => voice.sync());
document.addEventListener("visibilitychange", () => voice.sync());
window.addEventListener("pagehide", () => voice.disable());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
setInterval(() => {
  if (game && game.winner === null) {
    if (!room) expire(game);
    if (game.winner !== null) {
      clearTimeout(botTimer);
      draw();
    } else updateClock();
  }
}, 200);
setInterval(poll, 850);
try {
  room = JSON.parse(sessionStorage.getItem(roomKey));
} catch {
  sessionStorage.removeItem(roomKey);
}
if (room) mode = "online";
draw();
if (room) poll();
