import {
  limits,
  maxTurnSeconds,
  lastLetter,
  validTurnLimit,
  startGame,
  buildDictionary,
  dictionaryFile,
  play,
  choices,
  expire,
  finish,
} from "./game.js";
import { loadProfiles, editProfile, avatarMarkup } from "./profile-editor.js";
import { showRoundMap } from "./round-map.js";
import { icon } from "./icons.js";
import {
  readMenuPreferences,
  readPreference,
  writePreference,
} from "./preferences.js";
import { readSavedGame, storeGame, checkpoint, saveKey } from "./saved-game.js";
import { createVoiceInput } from "./speech.js";

import { createTurnChime, createNarrator } from "./turn-audio.js";

const chime = createTurnChime(window.AudioContext || window.webkitAudioContext);
let chimeEnabled = readPreference("atlas-turn-chime") !== "off";

let narrateBot = readPreference("atlas-bot-speech") === "on";
const narrator = createNarrator(
  window.speechSynthesis,
  window.SpeechSynthesisUtterance,
  () => voice.sync(),
  () => {
    const feedback = $("#speech-feedback");
    if (feedback)
      feedback.textContent = t(
        "Не удалось воспроизвести речь. Проверьте голос для языка партии в настройках устройства.",
        "Speech playback failed. Check the voice for this language in your device settings.",
      );
  },
);

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voicePreferred = readPreference("atlas-voice-input") === "on";
const voice = createVoiceInput(Recognition, {
  canListen: () =>
    myTurn() &&
    !busy &&
    !narrator.speaking &&
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
});

const $ = (selector) => document.querySelector(selector);
const main = $("#main");
const modal = $("#modal");
const dictionaries = new Map();
const mapView = { zoom: readPreference("atlas-map-zoom") === "on" };
let profiles = loadProfiles();
let roomProfiles = [];
const roomKey = "city-atlas-room-v1";
let { lang, topic, mode, timerChoice, customSeconds, networkTab } =
  readMenuPreferences();
let typedCode = "";
let localId, savedAt, pendingRestore;
let saveFailed = false;
const botDelay = 700;
let game = null,
  room = null,
  dictionary = null,
  clockOffset = 0;
let busy = false,
  polling = false,
  botTimer,
  networkError = "",
  confirmation;
const t = (ru, en, language = lang) => (language === "ru" ? ru : en);
const placeText = (
  citiesRu,
  citiesEn,
  countriesRu,
  countriesEn,
  language = lang,
) =>
  topic === "countries"
    ? t(countriesRu, countriesEn, language)
    : t(citiesRu, citiesEn, language);
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
const defaultPlayer = (n) =>
  mode === "bot"
    ? n
      ? t("Бот", "Bot")
      : t("Вы", "You")
    : t("Игрок ", "Player ") + (n + 1);
const profileAt = (n) =>
  room ? roomProfiles[n] : mode === "bot" && n === 1 ? undefined : profiles[n];
const player = (n) => profileAt(n)?.nickname || defaultPlayer(n);
const myTurn = () =>
  game &&
  game.winner === null &&
  (mode === "local" || game.turn === (room?.seat ?? 0));
const messages = (language = lang) => ({
  empty: placeText(
    "Введите название города.",
    "Enter a city name.",
    "Введите название страны.",
    "Enter a country name.",
    language,
  ),
  letter:
    placeText(
      "Нужен город на букву ",
      "Choose a city starting with ",
      "Нужна страна на букву ",
      "Choose a country starting with ",
      language,
    ) +
    (game?.next || "").toUpperCase() +
    ".",
  unknown: placeText(
    "Этого города нет в словаре. Проверьте название или назовите другой город.",
    "City not found. Check the spelling or try another city.",
    "Этой страны нет в словаре. Проверьте название или назовите другую страну.",
    "Country not found. Check the spelling or try another country.",
    language,
  ),
  repeat: placeText(
    "Этот город уже был в цепочке.",
    "That city has already been played.",
    "Эта страна уже была в цепочке.",
    "That country has already been played.",
    language,
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
  writePreference("atlas-theme", theme);
  updateThemeButton();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  ({ matches }) => {
    if (readPreference("atlas-theme")) return;
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
function soundControls() {
  const microphone =
    game || !Recognition
      ? ""
      : `<label><input type="checkbox" data-sound="mic" ${voicePreferred ? "checked" : ""}> ${t("Голосовой ввод", "Voice input")}</label>`;
  const speech =
    mode === "bot"
      ? `<label><input type="checkbox" data-sound="speech" ${narrateBot && narrator.available ? "checked" : ""} ${narrator.available ? "" : "disabled"}> ${t("Озвучка бота", "Speak bot moves")}</label><span id="speech-feedback" class="sub" role="status">${narrator.available ? "" : t("В этом браузере озвучка недоступна.", "Speech output is unavailable in this browser.")}</span>`
      : "";
  return `<div class="sound-controls"><label><input type="checkbox" data-sound="chime" ${chimeEnabled ? "checked" : ""}> ${t("Звук смены хода", "Turn sound")}</label>${speech}${microphone}</div>`;
}
function turnSound() {
  if (chimeEnabled && game.winner === null && !document.hidden) chime.play();
}
function speakBot(text) {
  if (mode === "bot" && narrateBot && !document.hidden && !modal.open) {
    narrator.say(text, game.lang);
  }
}
function narrateTurn(botName = "") {
  if (mode !== "bot" || !narrateBot) return;
  const ru = game.lang === "ru";
  let prompt;
  if (game.winner !== null) {
    prompt =
      game.winner === 0
        ? ru
          ? "Вы победили."
          : "You win."
        : ru
          ? "Победил бот."
          : "The bot wins.";
    if (game.reason === "timeout")
      prompt = (ru ? "Время истекло. " : "Time is up. ") + prompt;
  } else if (game.next) {
    prompt =
      (ru ? "Ваш ход на букву " : "Your turn. The letter is ") +
      game.next.toUpperCase() +
      ".";
  } else {
    prompt = ru
      ? "Назовите любую оставшуюся страну."
      : "Name any remaining country.";
  }
  speakBot(botName ? botName + ". " + prompt : prompt);
}
function resumeCard() {
  const saved = pendingRestore ?? readSavedGame("localStorage");
  return saved
    ? `<div class="resume-game"><div><strong>${t("Сохранённая партия", "Saved game")}</strong><span class="sub">${saved.game.topic === "cities" ? t("Города", "Cities") : t("Страны", "Countries")} · ${modes()[saved.mode][0]} · ${t("Ходов", "Moves")} ${saved.game.history.length}</span></div><button class="plain" id="resume">${t("Продолжить", "Resume")} ${icon("arrow", 17)}</button></div>`
    : "";
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
  const profileButtons = (mode === "local" ? [0, 1] : [0])
    .map((seat) => {
      const label =
        mode === "local" ? defaultPlayer(seat) : t("Мой профиль", "My profile");
      const name = profiles[seat].nickname || label;
      return `<button type="button" class="profile-chip" data-profile="${seat}" aria-label="${esc(t("Настроить профиль", "Edit profile") + " · " + label)}">
      ${avatarMarkup(profiles[seat])}<span>${esc(name)}</span>${icon("pencil", 14)}</button>`;
    })
    .join("");
  const profilePanel = `<div class="profile-panel"><strong>${mode === "local" ? t("Игроки", "Players") : t("Игрок", "Player")}</strong><div>${profileButtons}</div></div>`;
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
    '<div id="saved-round">' +
    resumeCard() +
    "</div>" +
    `<section class="setup"><div class="setup-heading"><h2 class="section-title">` +
    t("Режим игры", "Game mode") +
    `</h2><div class="topic-switch" role="group" aria-label="${t("Тема игры", "Game topic")}">${topics}</div></div><div class="cards">` +
    cards +
    "</div>" +
    network +
    profilePanel +
    (join ? "" : timer) +
    soundControls() +
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
        avatarMarkup(profileAt(n), n === 1 && mode === "bot" ? "bot" : "pin") +
        '<span class="player-name">' +
        esc(player(n)) +
        (room?.seat === n ? t(" (вы)", " (you)") : "") +
        '</span><span class="count">' +
        game.history.filter((h) => h.player === n).length +
        "</span></div>",
    )
    .join("");
  const why = {
    timeout: t("Время на ход истекло.", "Time ran out."),
    exhausted: placeText(
      "В словаре закончились подходящие города.",
      "No matching cities remain in the dictionary.",
      "Все страны названы.",
      "Every country has been played.",
    ),
    left: t("Соперник вышел из комнаты.", "Your opponent left the room."),
    surrender: t("Один из игроков сдался.", "A player conceded."),
  };
  const heading = done
    ? t("Победа", "Winner") + " · " + esc(player(game.winner))
    : last && !game.next
      ? t("Назовите любую оставшуюся страну", "Name any remaining country")
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
  let info = done
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
  if (
    !done &&
    last &&
    game.topic === "countries" &&
    game.next !== lastLetter(last.name, game.lang)
  ) {
    info += game.next
      ? t(
          ". Берём первую доступную букву справа: ",
          ". The first playable letter from the right is ",
        ) +
        game.next.toUpperCase() +
        "."
      : t(
          ". Ни одна буква названия не даёт хода.",
          ". No letter in that name has a country left.",
        );
  }
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
        esc(player(game.turn))) +
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
    (done ? "" : soundControls()) +
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
              esc(player(h.player)) +
              "</span></li>",
          )
          .join("") +
        "</ol>"
      : "") +
    "</div>";
  showRoundMap($("#round-map"), game, { t, player, lang, view: mapView });
  updateClock();
  if (networkError) notify(networkError);
  if (saveFailed && !room)
    $("#notice").textContent = t(
      "Браузеру не удалось сохранить партию.",
      "The browser could not save this game.",
    );
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
      ...(token && roomProfiles.length
        ? { "X-Atlas-Profile-Count": String(roomProfiles.length) }
        : {}),
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
  const starting = !game && data.game?.winner === null;
  const advanced =
    game && data.game && data.game.history.length > game.history.length;
  const changed =
    (data.profiles && data.profiles.length !== roomProfiles.length) ||
    !room ||
    !game !== !data.game ||
    game?.history.length !== data.game?.history.length ||
    game?.winner !== data.game?.winner;
  if (data.profiles) roomProfiles = data.profiles;
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
  if (starting && voicePreferred) voice.toggle();
  if (advanced) turnSound();
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
async function getDictionary(language, gameTopic) {
  const key = gameTopic + "/" + language;
  if (!dictionaries.has(key)) {
    const response = await fetch(
      "/data/" + dictionaryFile(language, gameTopic),
    );
    if (!response.ok) throw new Error("connection");
    dictionaries.set(
      key,
      buildDictionary(await response.json(), language, gameTopic),
    );
  }
  return dictionaries.get(key);
}
function saveLocal() {
  savedAt = Date.now();
  saveFailed = !checkpoint({ id: localId, mode, game, updated: savedAt });
}
function newLocalId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");
}
async function restoreLocal(saved, fromMenu = false) {
  if (!saved || busy) return;
  busy = true;
  pendingRestore = saved;
  header();
  main.innerHTML =
    '<p role="status" class="sub">' +
    t("Восстанавливаем партию…", "Restoring game…") +
    "</p>";
  try {
    const restored = saved.game;
    expire(restored);
    if (restored.winner === null)
      dictionary = await getDictionary(restored.lang, restored.topic);
    expire(restored);
    localId = fromMenu && restored.winner === null ? newLocalId() : saved.id;
    mode = saved.mode;
    topic = restored.topic;
    game = restored;
    savedAt = saved.updated;
    pendingRestore = null;
    saveFailed = !checkpoint({ ...saved, id: localId, game });
    draw();
    if (voicePreferred && game.winner === null) voice.toggle();
    scheduleBot();
    if (myTurn()) $("#city")?.focus();
  } catch {
    lobby();
    $("#notice").textContent = t(
      "Не удалось загрузить словарь. Нажмите «Продолжить», чтобы повторить.",
      "Could not load the dictionary. Select Resume to try again.",
    );
  } finally {
    busy = false;
    voice.sync();
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
  narrator.cancel();
  busy = true;
  $("#start").disabled = true;
  networkError = "";
  try {
    if (mode === "online") {
      if (networkTab === "join" && !/^[A-Z2-9]{6}$/.test(typedCode))
        throw new Error("invalid");
      const data =
        networkTab === "join"
          ? await api("/" + typedCode + "/join", { profile: profiles[0] })
          : await api("", { lang, limit, topic, profile: profiles[0] });
      lang = data.lang;
      storeGame("sessionStorage", null);
      pendingRestore = null;
      sync(data);
    } else {
      const chosenLang = lang;
      dictionary = await getDictionary(chosenLang, topic);
      game = startGame(chosenLang, limit, Date.now(), topic);
      pendingRestore = null;
      localId = newLocalId();
      saveLocal();
      draw();
      if (voicePreferred) voice.toggle();
      $("#city")?.focus();
    }
  } catch (error) {
    notify(error.message);
  } finally {
    busy = false;
    voice.sync();
    if ($("#start")) $("#start").disabled = false;
  }
}
function scheduleBot() {
  clearTimeout(botTimer);
  if (mode !== "bot" || game?.winner !== null || game.turn !== 1) return;
  botTimer = setTimeout(
    () => {
      const pool = choices(game, dictionary);
      // Prefer widely known places, keeping some variety between games.
      const city = pool[Math.floor(Math.random() * Math.min(pool.length, 30))];
      if (city) {
        const error = play(game, city.name, dictionary);
        if (!error) turnSound();
        narrateTurn(error ? "" : game.history.at(-1).name);
      } else {
        finish(game, 0, "exhausted");
        narrateTurn();
      }
      saveLocal();
      draw();
      $("#city")?.focus();
    },
    Math.max(0, savedAt + botDelay - Date.now()),
  );
}
async function submit(event) {
  event.preventDefault();
  if (!myTurn() || busy) return;
  narrator.cancel();
  voice.pause();
  const input = $("#city");
  const city = input.value.trim();
  if (!city) {
    notify("empty");
    speakBot(messages(game.lang).empty);
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
    speakBot(messages(game.lang)[error]);
    voice.sync();
    input.focus();
    return;
  }
  saveLocal();
  if (!error) turnSound();
  if (game.winner !== null) narrateTurn();
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
  narrator.cancel();
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
      "Первый игрок называет любую страну. Для следующего хода читаем её название справа налево до первой буквы, на которую остались страны. Если такой буквы нет, можно назвать любую оставшуюся страну.",
      "Start with any country. Read its name from right to left until you find a letter that can start an unused country. If no letter works, play any remaining country.",
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
      "Кто назвал последнюю оставшуюся страну, побеждает. Если игрок сдаётся или его время истекло, побеждает соперник.",
      "Whoever plays the last remaining country wins. Conceding or running out of time gives the opponent the win.",
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
  narrator.cancel();
  ({ lang, topic, mode, timerChoice, customSeconds, networkTab } =
    readMenuPreferences());
  clearTimeout(botTimer);
  if (room) sessionStorage.removeItem(roomKey);
  storeGame("sessionStorage", null);
  localId = pendingRestore = null;
  saveFailed = false;
  game = null;
  room = null;
  roomProfiles = [];
  clockOffset = 0;
  networkError = "";
  draw();
}
async function leave(concede) {
  if (busy) return;
  if (!saveFailed && !room && !concede && game?.winner === null) {
    if (
      !storeGame("localStorage", { id: localId, mode, game, updated: savedAt })
    ) {
      saveFailed = true;
      draw();
      askLeave(false);
      return;
    }
  }
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
    saveLocal();
    narrateTurn();
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
      : !room && !concede && !saveFailed
        ? t(
            "Вы сможете продолжить эту партию из меню. Таймер, если он включён, продолжит отсчёт.",
            "You can resume this game from the menu. A running timer will keep counting down.",
          )
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
  if (b.hasAttribute("data-profile") && !room && !game) {
    const seat = Number(b.dataset.profile);
    const title =
      mode === "local"
        ? t("Профиль", "Profile") + " · " + defaultPlayer(seat)
        : t("Мой профиль", "My profile");
    editProfile({
      seat,
      profiles,
      title,
      placeholder: defaultPlayer(seat),
      t,
      dialog,
      modal,
      onSave: (updated) => {
        profiles = updated;
        draw();
        document.querySelector('[data-profile="' + seat + '"]')?.focus();
      },
    });
    return;
  }
  if (b.dataset.lang) {
    narrator.cancel();
    lang = b.dataset.lang;
    writePreference("city-atlas-language", lang);
    draw();
  }
  if (b.dataset.topic) {
    topic = b.dataset.topic;
    writePreference("atlas-topic", topic);
    draw();
  }
  if (b.dataset.mode) {
    narrator.cancel();
    mode = b.dataset.mode;
    writePreference("atlas-mode", mode);
    draw();
  }
  if (b.dataset.time) {
    timerChoice =
      b.dataset.time === "custom" ? "custom" : Number(b.dataset.time);
    writePreference("atlas-timer", timerChoice);
    draw();
    if (timerChoice === "custom") $("#seconds").select();
  }
  if (b.dataset.net) {
    networkTab = b.dataset.net;
    writePreference("atlas-network-tab", networkTab);
    draw();
  }
  if (b.id === "mic" && (voice.enabled || myTurn())) {
    voice.toggle();
    setVoicePreference(voice.enabled);
  }
  if (b.id === "resume")
    return restoreLocal(pendingRestore ?? readSavedGame("localStorage"), true);
  if (b.id === "start") {
    const saved = pendingRestore ?? readSavedGame("localStorage");
    if (mode !== "online" && saved?.game.winner === null) {
      dialog(
        t("Начать новую партию?", "Start a new game?"),
        '<p class="sub">' +
          t(
            "Новая партия заменит сохранённую.",
            "The new game will replace the saved game.",
          ) +
          '</p><div class="modal-actions"><button class="plain" data-close>' +
          t("Отмена", "Cancel") +
          '</button><button class="primary" id="confirm">' +
          t("Начать новую", "Start new game") +
          "</button></div>",
        begin,
      );
    } else await begin();
  }
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
document.addEventListener(
  "click",
  () => {
    if (chimeEnabled) chime.unlock();
  },
  { capture: true },
);
function setVoicePreference(enabled) {
  voicePreferred = enabled;
  writePreference("atlas-voice-input", enabled ? "on" : "off");
}
main.addEventListener("change", (event) => {
  if (event.target.dataset.sound === "mic")
    setVoicePreference(event.target.checked);
  if (event.target.dataset.sound === "speech") {
    narrateBot = event.target.checked;
    writePreference("atlas-bot-speech", narrateBot ? "on" : "off");
    $("#speech-feedback").textContent = "";
    if (!narrateBot) narrator.cancel();
    else if (game && myTurn() && game.history.length)
      narrateTurn(game.history.at(-1).name);
    else
      narrator.say(
        t("Озвучка бота включена.", "Bot speech is on.", game?.lang ?? lang),
        game?.lang ?? lang,
      );
  }
  if (event.target.dataset.sound === "chime") {
    chimeEnabled = event.target.checked;
    writePreference("atlas-turn-chime", chimeEnabled ? "on" : "off");
    if (chimeEnabled) chime.unlock();
  }
});
main.addEventListener("input", (e) => {
  if (e.target.id === "seconds") {
    customSeconds = e.target.value;
    const seconds = e.target.valueAsNumber;
    if (seconds > 0 && validTurnLimit(seconds) && e.target.validity.valid)
      writePreference("atlas-custom-seconds", seconds);
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) narrator.cancel();
  voice.sync();
});
window.addEventListener("pagehide", () => {
  voice.disable();
  narrator.cancel();
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
setInterval(() => {
  if (game && game.winner === null) {
    if (!room) expire(game);
    if (game.winner !== null) {
      clearTimeout(botTimer);
      saveLocal();
      narrateTurn();
      draw();
    } else updateClock();
  }
}, 200);
setInterval(poll, 850);
try {
  room = JSON.parse(sessionStorage.getItem(roomKey));
} catch {
  room = null;
}
window.addEventListener("storage", (event) => {
  const slot = $("#saved-round");
  if ((event.key === saveKey || event.key === null) && slot && !pendingRestore)
    slot.innerHTML = resumeCard();
});
if (room) {
  mode = "online";
  draw();
  poll();
} else {
  const active = readSavedGame("sessionStorage");
  if (active) restoreLocal(active);
  else draw();
}
