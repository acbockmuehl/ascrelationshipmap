const STORAGE_KEY = "asc-relationship-map-contacts";
const MAP_WIDTH = 560;
const MAP_HEIGHT = 760;
const MAP_PADDING = 24;
const UK_CENTRAL_LATITUDE = 54.5;

const REGION_CONFIG = [
  {
    id: "north-east",
    geoName: "North East",
    shortLabel: "North East",
    suggestionAuthorities: ["Newcastle City Council", "Sunderland City Council", "Durham County Council"]
  },
  {
    id: "north-west",
    geoName: "North West",
    shortLabel: "North West",
    suggestionAuthorities: ["Manchester City Council", "Liverpool City Council", "Lancashire County Council"]
  },
  {
    id: "yorkshire-humber",
    geoName: "Yorkshire and the Humber",
    shortLabel: "Yorks & Humber",
    suggestionAuthorities: ["Leeds City Council", "Sheffield City Council", "Hull City Council"]
  },
  {
    id: "east-midlands",
    geoName: "East Midlands",
    shortLabel: "East Midlands",
    suggestionAuthorities: ["Nottingham City Council", "Leicester City Council", "Derby City Council"]
  },
  {
    id: "west-midlands",
    geoName: "West Midlands",
    shortLabel: "West Midlands",
    suggestionAuthorities: ["Birmingham City Council", "Coventry City Council", "Wolverhampton Council"]
  },
  {
    id: "east-of-england",
    geoName: "East",
    shortLabel: "East of England",
    suggestionAuthorities: ["Norfolk County Council", "Cambridgeshire County Council", "Essex County Council"]
  },
  {
    id: "london",
    geoName: "London",
    shortLabel: "London",
    suggestionAuthorities: ["Greater London Authority", "Westminster City Council", "Southwark Council"]
  },
  {
    id: "south-east",
    geoName: "South East",
    shortLabel: "South East",
    suggestionAuthorities: ["Kent County Council", "Surrey County Council", "Brighton and Hove City Council"]
  },
  {
    id: "south-west",
    geoName: "South West",
    shortLabel: "South West",
    suggestionAuthorities: ["Cornwall Council", "Bristol City Council", "Devon County Council"]
  },
  {
    id: "northern-ireland",
    geoName: "Northern Ireland",
    shortLabel: "N. Ireland",
    suggestionAuthorities: ["Belfast City Council", "Derry City and Strabane", "Lisburn and Castlereagh"]
  },
  {
    id: "scotland",
    geoName: "Scotland",
    shortLabel: "Scotland",
    suggestionAuthorities: ["Glasgow City Council", "City of Edinburgh Council", "Fife Council"]
  },
  {
    id: "wales",
    geoName: "Wales",
    shortLabel: "Wales",
    suggestionAuthorities: ["Cardiff Council", "Swansea Council", "Monmouthshire County Council"]
  }
];

const REGION_LOOKUP = Object.fromEntries(REGION_CONFIG.map((region) => [region.id, region]));
const GEO_NAME_TO_ID = Object.fromEntries(REGION_CONFIG.map((region) => [region.geoName, region.id]));

const SAMPLE_CONTACTS = [
  { id: createId(), name: "Aisha Rahman", role: "Director of Adult Social Care", authority: "Leeds City Council", region: "yorkshire-humber" },
  { id: createId(), name: "Tom Bennett", role: "Integrated Care Lead", authority: "Manchester City Council", region: "north-west" },
  { id: createId(), name: "Carys Morgan", role: "Principal Social Worker", authority: "Cardiff Council", region: "wales" },
  { id: createId(), name: "Neil McKay", role: "Commissioning Manager", authority: "Glasgow City Council", region: "scotland" },
  { id: createId(), name: "Priya Shah", role: "Housing Partnership Lead", authority: "Kent County Council", region: "south-east" },
  { id: createId(), name: "Martha Osei", role: "Transformation Programme Manager", authority: "Birmingham City Council", region: "west-midlands" }
];

const state = {
  contacts: loadContacts(),
  selectedRegionId: "yorkshire-humber",
  highlightedContactId: null,
  regionShapes: []
};

const elements = {
  form: document.getElementById("contact-form"),
  name: document.getElementById("name"),
  role: document.getElementById("role"),
  region: document.getElementById("region"),
  authority: document.getElementById("authority"),
  authoritySuggestions: document.getElementById("authority-suggestions"),
  map: document.getElementById("uk-map"),
  mapOverlay: document.getElementById("map-overlay"),
  networkTitle: document.getElementById("network-title"),
  networkSubtitle: document.getElementById("network-subtitle"),
  networkTree: document.getElementById("network-tree"),
  heroStats: document.getElementById("hero-stats"),
  statCardTemplate: document.getElementById("stat-card-template"),
  authorityCardTemplate: document.getElementById("authority-card-template")
};

init();

async function init() {
  renderRegionOptions();
  renderAuthoritySuggestions(state.selectedRegionId);
  bindEvents();
  await loadRegionShapes();
  render();
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadContacts() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_CONTACTS));
    return SAMPLE_CONTACTS;
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : SAMPLE_CONTACTS;
  } catch {
    return SAMPLE_CONTACTS;
  }
}

function saveContacts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.contacts));
}

function bindEvents() {
  elements.form.addEventListener("submit", handleSubmit);
  elements.region.addEventListener("change", handleRegionFieldChange);
  elements.networkTree.addEventListener("click", handleNetworkActions);
}

async function loadRegionShapes() {
  const response = await fetch("uk_regions.geojson");
  const geojson = await response.json();
  state.regionShapes = buildRegionShapes(geojson);
  renderMap();
}

function buildRegionShapes(geojson) {
  const projectedFeatures = [];

  geojson.features.forEach((feature) => {
    const regionId = GEO_NAME_TO_ID[feature.properties.rgn19nm];
    if (!regionId) {
      return;
    }

    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const projectedPolygons = polygons.map((polygon) =>
      polygon.map((ring) => ring.map(([longitude, latitude]) => projectCoordinate(longitude, latitude)))
    );

    projectedFeatures.push({
      id: regionId,
      geoName: feature.properties.rgn19nm,
      polygons: projectedPolygons
    });
  });

  const extents = projectedFeatures.reduce(
    (accumulator, feature) => {
      feature.polygons.forEach((polygon) => {
        polygon.forEach((ring) => {
          ring.forEach(([x, y]) => {
            accumulator.minX = Math.min(accumulator.minX, x);
            accumulator.maxX = Math.max(accumulator.maxX, x);
            accumulator.minY = Math.min(accumulator.minY, y);
            accumulator.maxY = Math.max(accumulator.maxY, y);
          });
        });
      });
      return accumulator;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / (extents.maxX - extents.minX),
    (MAP_HEIGHT - MAP_PADDING * 2) / (extents.maxY - extents.minY)
  );

  const translateX = (MAP_WIDTH - (extents.maxX - extents.minX) * scale) / 2;
  const translateY = (MAP_HEIGHT - (extents.maxY - extents.minY) * scale) / 2;

  return projectedFeatures
    .map((feature) => {
      const polygons = feature.polygons.map((polygon) =>
        polygon.map((ring) =>
          ring.map(([x, y]) => [
            translateX + (x - extents.minX) * scale,
            translateY + (y - extents.minY) * scale
          ])
        )
      );

      const path = polygonsToPath(polygons);
      const metrics = getRegionMetrics(polygons);
      const config = REGION_LOOKUP[feature.id];
      return {
        id: feature.id,
        name: config.geoName,
        shortLabel: config.shortLabel,
        suggestionAuthorities: config.suggestionAuthorities,
        path,
        bbox: metrics.bbox,
        anchor: metrics.anchor,
        label: metrics.label,
        overlaySide: metrics.label.x >= MAP_WIDTH * 0.55 ? "right" : "left"
      };
    })
    .sort((left, right) => left.label.y - right.label.y);
}

function projectCoordinate(longitude, latitude) {
  const x = longitude * Math.cos((UK_CENTRAL_LATITUDE * Math.PI) / 180);
  const y = -latitude;
  return [x, y];
}

function polygonsToPath(polygons) {
  return polygons
    .map((polygon) =>
      polygon
        .map((ring) =>
          ring
            .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
            .join(" ") + " Z"
        )
        .join(" ")
    )
    .join(" ");
}

function getRegionMetrics(polygons) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let largestRing = [];
  let largestArea = -Infinity;

  polygons.forEach((polygon) => {
    const outerRing = polygon[0];
    outerRing.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const area = Math.abs(getRingArea(outerRing));
    if (area > largestArea) {
      largestArea = area;
      largestRing = outerRing;
    }
  });

  const centroid = getRingCentroid(largestRing);
  return {
    bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    label: centroid,
    anchor: centroid
  };
}

function getRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function getRingCentroid(ring) {
  const area = getRingArea(ring);
  if (!area) {
    const total = ring.reduce((accumulator, [x, y]) => ({ x: accumulator.x + x, y: accumulator.y + y }), { x: 0, y: 0 });
    return { x: total.x / ring.length, y: total.y / ring.length };
  }

  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const factor = x1 * y2 - x2 * y1;
    centroidX += (x1 + x2) * factor;
    centroidY += (y1 + y2) * factor;
  }

  return {
    x: centroidX / (6 * area),
    y: centroidY / (6 * area)
  };
}

function handleSubmit(event) {
  event.preventDefault();

  const contact = {
    id: createId(),
    name: elements.name.value.trim(),
    role: elements.role.value.trim(),
    region: elements.region.value,
    authority: elements.authority.value.trim()
  };

  if (!contact.name || !contact.role || !contact.region || !contact.authority) {
    return;
  }

  state.contacts.unshift(contact);
  state.selectedRegionId = contact.region;
  state.highlightedContactId = contact.id;
  saveContacts();
  elements.form.reset();
  elements.region.value = state.selectedRegionId;
  renderAuthoritySuggestions(state.selectedRegionId);
  render();
}

function handleRegionFieldChange(event) {
  renderAuthoritySuggestions(event.target.value);
}

function handleNetworkActions(event) {
  const button = event.target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  const { deleteId } = button.dataset;
  state.contacts = state.contacts.filter((contact) => contact.id !== deleteId);
  if (state.highlightedContactId === deleteId) {
    state.highlightedContactId = null;
  }
  saveContacts();
  render();
}

function render() {
  renderHeroStats();
  renderMapCounts();
  renderOverlay();
  renderNetworkTree();
}

function renderHeroStats() {
  const grouped = groupContacts(state.contacts);
  const totals = [
    { label: "Contacts mapped", value: state.contacts.length },
    { label: "Authorities represented", value: Object.keys(grouped.authorities).length },
    { label: "Regions active", value: Object.keys(grouped.regions).length }
  ];

  elements.heroStats.innerHTML = "";
  totals.forEach((item) => {
    const node = elements.statCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-value").textContent = item.value;
    node.querySelector(".stat-label").textContent = item.label;
    elements.heroStats.appendChild(node);
  });
}

function renderRegionOptions() {
  elements.region.innerHTML = "";
  REGION_CONFIG.forEach((region) => {
    const option = document.createElement("option");
    option.value = region.id;
    option.textContent = region.shortLabel;
    elements.region.appendChild(option);
  });
  elements.region.value = state.selectedRegionId;
}

function renderAuthoritySuggestions(regionId) {
  const region = REGION_LOOKUP[regionId] || REGION_CONFIG[0];
  elements.authoritySuggestions.innerHTML = "";
  region.suggestionAuthorities.forEach((authority) => {
    const option = document.createElement("option");
    option.value = authority;
    elements.authoritySuggestions.appendChild(option);
  });
}

function renderMap() {
  elements.map.innerHTML = "";

  state.regionShapes.forEach((region) => {
    const group = createSvgNode("g", {
      class: `region ${region.id === state.selectedRegionId ? "is-active" : ""}`,
      "data-region-id": region.id,
      tabindex: "0",
      role: "button",
      "aria-label": `${region.shortLabel} region`
    });

    group.appendChild(createSvgNode("path", { class: "region-shape", d: region.path }));
    group.appendChild(createSvgNode("text", { class: "region-label", x: region.label.x.toFixed(2), y: region.label.y.toFixed(2) }, region.shortLabel));
    group.appendChild(createSvgNode("circle", { class: "region-count", cx: region.label.x.toFixed(2), cy: (region.label.y - 26).toFixed(2), r: 16 }));
    group.appendChild(createSvgNode("text", { class: "region-count-text", x: region.label.x.toFixed(2), y: (region.label.y - 21).toFixed(2) }, "0"));

    group.addEventListener("click", () => {
      state.selectedRegionId = region.id;
      state.highlightedContactId = null;
      render();
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedRegionId = region.id;
        state.highlightedContactId = null;
        render();
      }
    });

    elements.map.appendChild(group);
  });
}

function renderMapCounts() {
  const counts = state.contacts.reduce((accumulator, contact) => {
    accumulator[contact.region] = (accumulator[contact.region] || 0) + 1;
    return accumulator;
  }, {});

  elements.map.querySelectorAll(".region").forEach((group) => {
    const regionId = group.dataset.regionId;
    const count = counts[regionId] || 0;
    group.classList.toggle("is-active", regionId === state.selectedRegionId);
    group.querySelector(".region-count-text").textContent = String(count);
  });
}

function renderOverlay() {
  const region = state.regionShapes.find((entry) => entry.id === state.selectedRegionId);
  const authorities = groupContactsByAuthority(state.contacts.filter((contact) => contact.region === state.selectedRegionId));

  elements.mapOverlay.innerHTML = "";

  if (!region || authorities.length === 0) {
    return;
  }

  const positions = getOverlayPositions(region, Math.min(authorities.length, 3));

  authorities.slice(0, positions.length).forEach((authorityEntry, index) => {
    const position = positions[index];
    const line = document.createElement("div");
    const lineStartX = region.anchor.x;
    const lineStartY = region.anchor.y;
    const lineEndX = position.side === "right" ? position.x - 78 : position.x + 78;
    const lineEndY = position.y;
    const deltaX = lineEndX - lineStartX;
    const deltaY = lineEndY - lineStartY;
    const lineLength = Math.hypot(deltaX, deltaY);
    const lineAngle = Math.atan2(deltaY, deltaX);

    line.className = "connector-line";
    line.style.left = `${(lineStartX / MAP_WIDTH) * 100}%`;
    line.style.top = `${(lineStartY / MAP_HEIGHT) * 100}%`;
    line.style.width = `${(lineLength / MAP_WIDTH) * 100}%`;
    line.style.transform = `rotate(${lineAngle}rad)`;
    elements.mapOverlay.appendChild(line);

    const card = document.createElement("article");
    card.className = `overlay-node ${position.side}`;
    card.style.left = `${(position.x / MAP_WIDTH) * 100}%`;
    card.style.top = `${(position.y / MAP_HEIGHT) * 100}%`;
    card.innerHTML = `
      <h3>${escapeHtml(authorityEntry.authority)}</h3>
      <p>${authorityEntry.people.length} ${authorityEntry.people.length === 1 ? "contact" : "contacts"}</p>
    `;
    elements.mapOverlay.appendChild(card);
  });
}

function getOverlayPositions(region, count) {
  const side = region.overlaySide;
  const spacing = 56;
  const startY = Math.max(70, Math.min(MAP_HEIGHT - 70 - spacing * (count - 1), region.anchor.y - spacing));
  const x = side === "right"
    ? Math.min(MAP_WIDTH - 54, region.bbox.maxX + 110)
    : Math.max(54, region.bbox.minX - 110);

  return Array.from({ length: count }, (_, index) => ({
    x,
    y: startY + index * spacing,
    side
  }));
}

function renderNetworkTree() {
  const region = REGION_LOOKUP[state.selectedRegionId];
  const authorities = groupContactsByAuthority(state.contacts.filter((contact) => contact.region === state.selectedRegionId));

  elements.networkTitle.textContent = region ? `${region.shortLabel} network` : "Network pullout";
  elements.networkSubtitle.textContent = region
    ? `${authorities.length} local ${authorities.length === 1 ? "authority" : "authorities"} branching from ${region.shortLabel}.`
    : "Choose a region to inspect the authority tree.";

  if (!region || authorities.length === 0) {
    elements.networkTree.innerHTML = `<div class="network-empty">No contacts mapped in this region yet. Add one from the form to make the branch appear.</div>`;
    return;
  }

  elements.networkTree.innerHTML = "";

  authorities.forEach((authorityEntry) => {
    const node = elements.authorityCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = authorityEntry.authority;
    node.querySelector("p").textContent = `${authorityEntry.people.length} ${authorityEntry.people.length === 1 ? "person" : "people"}`;

    const peopleList = node.querySelector(".people-list");
    authorityEntry.people.forEach((person) => {
      const personNode = document.createElement("article");
      personNode.className = "person-chip";
      if (person.id === state.highlightedContactId) {
        personNode.classList.add("flash");
      }
      personNode.innerHTML = `
        <div>
          <span class="person-name">${escapeHtml(person.name)}</span>
          <span class="person-role">${escapeHtml(person.role)}</span>
        </div>
        <button class="ghost-button" type="button" data-delete-id="${person.id}" aria-label="Remove ${escapeHtml(person.name)}">Remove</button>
      `;
      peopleList.appendChild(personNode);
    });

    elements.networkTree.appendChild(node);
  });
}

function groupContacts(contacts) {
  return contacts.reduce(
    (accumulator, contact) => {
      accumulator.regions[contact.region] = true;
      accumulator.authorities[`${contact.region}::${contact.authority}`] = true;
      return accumulator;
    },
    { regions: {}, authorities: {} }
  );
}

function groupContactsByAuthority(contacts) {
  const authorityMap = contacts.reduce((accumulator, contact) => {
    const key = contact.authority.trim().toLowerCase();
    if (!accumulator[key]) {
      accumulator[key] = {
        authority: contact.authority.trim(),
        people: []
      };
    }
    accumulator[key].people.push(contact);
    return accumulator;
  }, {});

  return Object.values(authorityMap)
    .sort((left, right) => right.people.length - left.people.length || left.authority.localeCompare(right.authority))
    .map((entry) => ({
      ...entry,
      people: [...entry.people].sort((left, right) => left.name.localeCompare(right.name))
    }));
}

function createSvgNode(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) {
    node.textContent = text;
  }
  return node;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
