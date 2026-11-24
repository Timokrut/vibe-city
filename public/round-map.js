import { icon } from "./icons.js";

const worldWidth = 720;
const worldHeight = 320;
const coordinateFiles = new Map();

function loadCoordinates(file) {
  if (!coordinateFiles.has(file)) {
    const request = fetch("/data/" + file + ".json")
      .then((response) => {
        if (!response.ok) throw new Error("Missing coordinates");
        return response.json();
      })
      .catch((error) => {
        coordinateFiles.delete(file);
        throw error;
      });
    coordinateFiles.set(file, request);
  }
  return coordinateFiles.get(file);
}

function project([longitude, latitude]) {
  return { x: 2 * (180 + longitude), y: 2 * (85 - latitude) };
}

// Cut the longitude circle in its largest empty gap so a route on both
// sides of the date line can be framed without zooming out to the world.
export function frameCities(points, zoom) {
  const world = { left: 0, top: 0, width: worldWidth, height: worldHeight };
  if (!zoom || !points.length) return world;
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  let gap = worldWidth + xs[0] - xs.at(-1);
  let start = xs[0];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > gap) {
      gap = xs[i] - xs[i - 1];
      start = xs[i];
    }
  }
  const span = worldWidth - gap;
  const ys = points.map((p) => p.y);
  const ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const width = Math.min(
    worldWidth,
    Math.max(
      28,
      span * 1.28,
      ((ymax - ymin) * 1.28 * worldWidth) / worldHeight,
    ),
  );
  const height = (width * worldHeight) / worldWidth;
  const center = (start + span / 2) % worldWidth;
  const top = Math.max(
    0,
    Math.min(worldHeight - height, (ymin + ymax - height) / 2),
  );
  return { left: center - width / 2, top, width, height };
}

function nearestCopy(x, center) {
  return x + Math.round((center - x) / worldWidth) * worldWidth;
}

function routeLines(points, center) {
  const lines = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1],
      to = points[i];
    const x1 = nearestCopy(from.x, center);
    const x2 = nearestCopy(to.x, x1);
    // Repeat just the segment across the seam, clipped by the chart viewport.
    lines.push(`M${x1} ${from.y} L${x2} ${to.y}`);
    if (x2 !== nearestCopy(to.x, center)) {
      const shift = nearestCopy(to.x, center) - x2;
      lines.push(`M${x1 + shift} ${from.y} L${x2 + shift} ${to.y}`);
    }
  }
  return lines.join(" ");
}

function svgElement(name, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  return node;
}

function formatCoordinate(value, positive, negative, lang) {
  const degrees = Math.abs(value).toLocaleString(lang, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return degrees + "° " + (value < 0 ? negative : positive);
}

export async function showRoundMap(container, game, { t, player, lang, view }) {
  const title = t("Карта партии", "Round map");
  const history = game.history;
  const countries = game.topic === "countries";
  container.innerHTML = `<div class="map-heading"><h2>${title}</h2>
    <button type="button" class="map-zoom" disabled></button></div>
    <svg class="round-chart" viewBox="0 0 720 320" role="group" aria-label="${title}" preserveAspectRatio="xMidYMid meet"></svg>
    <div class="map-caption"><span class="map-selected"></span><span class="map-coordinates"></span></div>`;
  const svg = container.querySelector("svg");
  const zoomButton = container.querySelector("button");
  const caption = container.querySelector(".map-selected");
  const coordinatesLabel = container.querySelector(".map-coordinates");
  let points = [],
    selected = -1;

  function select(index) {
    selected = index;
    for (const node of svg.querySelectorAll("[data-point]")) {
      node.setAttribute(
        "aria-pressed",
        String(Number(node.dataset.point) === index),
      );
    }
    svg.querySelector(".map-tag")?.remove();
    const point = points[index];
    if (!point) {
      caption.textContent = countries
        ? t(
            "Здесь появится первая названная страна.",
            "The first country you play will appear here.",
          )
        : t(
            "Здесь появится первый названный город.",
            "The first city you play will appear here.",
          );
      return;
    }
    labelPoint(point);
    const city = document.createElement("strong");
    city.textContent = point.name;
    const ordinal = document.createElement("span");
    ordinal.className = "map-ordinal player-" + point.player;
    ordinal.textContent = point.turn;
    caption.replaceChildren(ordinal, city, " · " + player(point.player));
    if (countries) {
      coordinatesLabel.textContent =
        t("Стран на карте: ", "Countries on map: ") + points.length + " / 195";
      return;
    }
    const [lon, lat] = point.coords;
    coordinatesLabel.textContent = [
      formatCoordinate(lat, t("с. ш.", "N"), t("ю. ш.", "S"), lang),
      formatCoordinate(lon, t("в. д.", "E"), t("з. д.", "W"), lang),
    ].join("  ·  ");
  }

  function labelPoint(point) {
    const frame = svg.viewBox.baseVal;
    const scale = frame.width / Math.max(1, svg.clientWidth);
    const x = nearestCopy(point.x, frame.x + frame.width / 2);
    const y =
      point.y - frame.y < 34 * scale
        ? point.y + 12 * scale
        : point.y - 30 * scale;
    const tag = svgElement("g", { class: "map-tag", "aria-hidden": "true" });
    const text = svgElement("text", { x: 8, y: 14 });
    text.textContent = point.name;
    tag.append(text);
    svg.append(tag);
    const width = text.getComputedTextLength() + 16;
    const left = Math.max(
      frame.x + 2 * scale,
      Math.min(
        x - (width * scale) / 2,
        frame.x + frame.width - (width + 2) * scale,
      ),
    );
    tag.setAttribute("transform", `translate(${left} ${y}) scale(${scale})`);
    tag.prepend(svgElement("rect", { width, height: 20, rx: 5 }));
  }

  function drawCountry(point, index, center, scale) {
    const shape = svgElement("g", {
      class: "map-country player-" + point.player,
      "data-point": index,
      role: "button",
      tabindex: 0,
      "aria-label":
        point.turn + ". " + point.name + " · " + player(point.player),
    });
    const title = svgElement("title", {});
    title.textContent = point.name;
    shape.append(title);
    for (const x of [-720, 0, 720])
      shape.append(
        svgElement("use", {
          href: "/assets/country-borders.svg#" + point.id,
          x,
        }),
      );
    if (point.tiny) {
      const inset = svgElement("g", {
        transform: `translate(${nearestCopy(point.x, center)} ${point.y}) scale(${scale})`,
      });
      inset.append(
        svgElement("circle", { r: 10, fill: "transparent", stroke: "none" }),
        svgElement("circle", { r: 3, class: "map-pin" }),
      );
      shape.append(inset);
    }
    svg.append(shape);
  }

  function paint() {
    const extent = countries
      ? points.flatMap((point) => {
          const [west, south, east, north] = point.bounds;
          // Interior samples keep wide countries on the correct side of the date line.
          return [
            point,
            project([west, south]),
            project([east, north]),
            project([(west + east) / 2, north]),
          ];
        })
      : points;
    const frame = frameCities(extent, view.zoom);
    const center = frame.left + frame.width / 2;
    svg.setAttribute(
      "viewBox",
      [frame.left, frame.top, frame.width, frame.height].join(" "),
    );
    // All decorations use the same equirectangular projection as the land.
    svg.innerHTML = `<defs><pattern id="meridians" width="60" height="60" y="-10" patternUnits="userSpaceOnUse">
      <path d="M0 60V0H60" class="map-grid" fill="none" vector-effect="non-scaling-stroke"/></pattern></defs>
      <g class="map-land" aria-hidden="true">
        <use href="/assets/world-land.svg#land" x="-720"/><use href="/assets/world-land.svg#land"/><use href="/assets/world-land.svg#land" x="720"/>
      </g><rect x="-720" width="2160" height="320" fill="url(#meridians)" aria-hidden="true"/>`;
    if (countries) {
      const borders = svgElement("g", {
        class: "map-borders",
        "aria-hidden": "true",
      });
      for (const x of [-720, 0, 720])
        borders.append(
          svgElement("use", { href: "/assets/country-borders.svg#borders", x }),
        );
      svg.append(borders);
    } else
      svg.append(
        svgElement("path", {
          d: routeLines(points, center),
          class: "map-thread",
          "vector-effect": "non-scaling-stroke",
          "aria-hidden": "true",
        }),
      );
    const scale = frame.width / worldWidth;
    points.forEach((point, index) => {
      if (countries) return drawCountry(point, index, center, scale);
      const button = svgElement("g", {
        transform: `translate(${nearestCopy(point.x, center)} ${point.y}) scale(${scale})`,
        class: "map-dot player-" + point.player,
        "data-point": index,
        tabindex: 0,
        role: "button",
        "aria-label":
          point.turn + ". " + point.name + " · " + player(point.player),
      });
      const label = svgElement("title", {});
      label.textContent = point.name + " · " + player(point.player);
      button.append(
        label,
        svgElement("circle", { r: 12, fill: "transparent" }),
        svgElement("circle", { r: 8.5, class: "map-ring" }),
        svgElement("circle", { r: 4.4, class: "map-pin" }),
      );
      svg.append(button);
    });
    zoomButton.disabled = points.length === 0;
    zoomButton.innerHTML =
      icon(view.zoom ? "online" : "pin", 16) +
      (view.zoom
        ? t("Весь мир", "World view")
        : countries
          ? t("К странам", "Fit countries")
          : t("К городам", "Fit cities"));
    select(selected);
  }
  zoomButton.onclick = () => {
    view.zoom = !view.zoom;
    paint();
  };
  svg.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-point]");
    if (dot) select(Number(dot.dataset.point));
  });
  svg.addEventListener("keydown", (event) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target.matches("[data-point]")
    ) {
      event.preventDefault();
      select(Number(event.target.dataset.point));
    }
  });
  paint();
  if (!history.length) return;
  try {
    const catalog = await loadCoordinates(
      countries ? "country-map" : game.lang + "-coordinates",
    );
    // A turn, language switch, or new game may have replaced this chart while loading.
    if (!container.isConnected) return;
    points = history.map((move, index) => {
      const location = countries
        ? catalog[move.id]
        : { coords: catalog[move.id] };
      return {
        ...move,
        ...location,
        turn: index + 1,
        ...project(location.coords),
      };
    });
    selected = points.length - 1;
    paint();
  } catch {
    if (!container.isConnected) return;
    caption.textContent = t(
      "Не удалось загрузить координаты.",
      "Could not load city coordinates.",
    );
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "link-btn";
    retry.textContent = t("Повторить", "Retry");
    retry.onclick = () =>
      showRoundMap(container, game, { t, player, lang, view });
    coordinatesLabel.append(retry);
  }
}
