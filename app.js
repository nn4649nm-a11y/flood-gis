const C = window.CONFIG;
let MODE = C.MODE;      // อาจถูกปรับเป็น "mock" อัตโนมัติถ้ายังตั้งค่า GeoNode ไม่ครบ
let missingFlood = 0;   // จำนวนอาคารที่ไม่มีฟิลด์ระดับน้ำท่วม

// ความสูงอาคารไม่ใช้ในแผนที่ 2 มิติ  แผนที่นี้แสดงอาคารเป็นรูปทรงบนพื้น สีตามความถี่น้ำท่วม
const DEFAULT_ZOOM_PADDING = [70, 70];
const BASEMAPS = {
  sat: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    opt: { maxNativeZoom: 19, attribution: "© Esri" }
  },
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opt: { maxNativeZoom: 19, attribution: "© OpenStreetMap" }
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    opt: { maxNativeZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }
  },
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    opt: { maxNativeZoom: 19, attribution: "© Esri" }
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    opt: { maxNativeZoom: 17, subdomains: "abc", attribution: "© OpenTopoMap (CC-BY-SA)" }
  }
};
const ZOOM_ICON = '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="12" cy="12" r="4" fill="#fff"/><line x1="15" y1="15" x2="18" y2="18"/></svg>';

const state = {
  query: "",
  groupOn: false,       // ระบายสีอาคารตามความถี่น้ำท่วม (ค่าเริ่มต้น: อาคารสีขาวทั้งหมด)
  activeClass: null,    // ถ้าเลือกระดับน้ำ = เน้นเฉพาะอาคารในช่วงนั้น
  basemap: "sat"
};

let DATA = null;        // อาคารทั้งหมด (FeatureCollection ของ Polygon)
let buildingLayer = null;
let pinLayer = null;
let waterLayer = null;  // แหล่งน้ำจาก C.WATER_URL (ถ้ามี)
let boundaryLayer = null; // ขอบเขตหมู่ 15 (ถ้ามีไฟล์)
let wmsLayer = null;    // ชั้นน้ำท่วมแบบ WMS จาก GeoServer (ถ้าตั้งค่าไว้)
let pointData = null;   // จุดน้ำท่วม (อาร์เรย์ของ {id, name, type, flood, cls, latlng})
let pointLayer = null;
let pointRenderer = null;
let pinsOn = false;
const baseLayers = {};

const map = L.map("map", {
  center: C.CENTER,
  zoom: C.ZOOM,
  maxZoom: 20,
  zoomControl: false,
  preferCanvas: true   // วาดอาคารด้วย canvas เร็วกว่า SVG เมื่อมีอาคารจำนวนมาก
});
L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

Object.keys(BASEMAPS).forEach(key => {
  baseLayers[key] = L.tileLayer(BASEMAPS[key].url, Object.assign({ maxZoom: 20 }, BASEMAPS[key].opt));
});
baseLayers.sat.addTo(map);

/* ================= ฟังก์ชันช่วย ================= */
let toastTimer = null;
function showMessage(text, ms) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.setAttribute("role", "alert");
    document.getElementById("app").appendChild(box);
  }
  box.textContent = text;
  box.classList.remove("hidden");
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => box.classList.add("hidden"), ms);
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function toNumber(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function classIndex(v) {
  for (let i = 0; i < C.CLASSES.length; i++) if (v < C.CLASSES[i].max) return i;
  return C.CLASSES.length - 1;
}
function classColor(v) { return C.CLASSES[classIndex(v)].color; }

/* ================= ข้อมูลอาคาร ================= */
// แปลงไฟล์ GeoJSON ใดๆ ให้เป็นรูปแบบที่แอปใช้: Polygon และฟิลด์ตาม C.FIELDS
function normalizeBuildings(raw) {
  const F = C.FIELDS;
  const out = [];
  missingFlood = 0;
  ((raw && raw.features) || []).forEach(f => {
    if (!f || !f.geometry) return;
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const src = f.properties || {};
    polys.forEach((poly, k) => {
      if (!poly || !poly[0] || poly[0].length < 3) return;
      const ring = poly[0].map(c => [c[0], c[1]]);   // ตัดค่าความสูง (Z) ทิ้ง
      const a = ring[0], b = ring[ring.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
      if (ring.length < 4) return;

      const baseId = src[F.id] != null ? String(src[F.id]) : "B-" + String(out.length + 1).padStart(4, "0");
      if (src[F.flood] == null || src[F.flood] === "") missingFlood++;
      const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
      const ctr = [(Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...xs) + Math.max(...xs)) / 2];   // [lat, lng] ใช้วางหมุด คำนวณครั้งเดียว
      const flood = Math.max(0, toNumber(src[F.flood], 0));
      out.push({
        type: "Feature",
        properties: {
          bldg_id: polys.length > 1 ? `${baseId}-${k + 1}` : baseId,
          bldg_type: src[F.type] != null ? String(src[F.type]) : "",
          flood_level: flood,
          flood_years: src[F.years || "flood_years"] != null ? String(src[F.years || "flood_years"]) : "",   // ปีที่ท่วม เช่น "2011,2013" ใช้กรองรายปี
          cls: classIndex(flood),
          ctr
        },
        geometry: { type: "Polygon", coordinates: [ring] }
      });
    });
  });
  return { type: "FeatureCollection", features: out };
}

// GeoNode ถือว่า "ตั้งค่าแล้ว" เมื่อมี OWS_URL และไม่ใช่ค่าตัวอย่าง
function hasGeonode() {
  const G = C.GEONODE || {};
  return !!G.OWS_URL && !/YOUR-GEONODE-HOST/i.test(G.OWS_URL);
}

// สร้าง URL ดึงข้อมูลเวกเตอร์ (GeoJSON) จาก GeoServer ผ่าน WFS
function wfsUrl(layer, cql) {
  const q = new URLSearchParams({
    service: "WFS", version: "1.0.0", request: "GetFeature",
    typeName: layer, outputFormat: "application/json", srsName: "EPSG:4326"
  });
  if (cql) q.set("CQL_FILTER", cql);
  return `${C.GEONODE.OWS_URL}?${q}`;
}

function buildingsUrl() {
  if (MODE === "geonode") return wfsUrl(C.GEONODE.BUILDINGS_LAYER, C.GEONODE.BUILDINGS_CQL);
  return C.MOCK_URL;
}

// ไฟล์ GeoJSON (ถ้าใส่) มาก่อน  ถ้าไม่มีให้ใช้ชื่อ layer บน GeoNode  ไม่มีทั้งคู่ = ข้ามชั้นนี้
function optionalLayerUrl(fileUrl, layerName) {
  if (fileUrl) return fileUrl;
  if (layerName && hasGeonode()) return wfsUrl(layerName);
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res.json();
}

function passes(f) {
  const p = f.properties;
  if (state.query && !String(p.bldg_id).toLowerCase().includes(state.query)) return false;
  return true;
}

function filtered() { return DATA ? DATA.features.filter(passes) : []; }

/* ================= จุดน้ำท่วม (ชั้นแยกจากอาคาร) ================= */
function pointsUrl() {
  const G = C.GEONODE || {};
  if (hasGeonode() && G.FLOOD_POINTS_LAYER) return wfsUrl(G.FLOOD_POINTS_LAYER);
  return C.FLOOD_POINTS_URL || null;
}

function normalizePoints(raw) {
  const F = C.POINT_FIELDS;
  const out = [];
  ((raw && raw.features) || []).forEach(f => {
    const g = f && f.geometry;
    if (!g) return;
    const pts = g.type === "Point" ? [g.coordinates] : g.type === "MultiPoint" ? g.coordinates : [];
    const src = f.properties || {};
    pts.forEach((c, k) => {
      if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
      const baseId = src[F.id] != null ? String(src[F.id]) : "P-" + String(out.length + 1).padStart(3, "0");
      const flood = Math.max(0, toNumber(src[F.flood], 0));
      out.push({
        id: pts.length > 1 ? `${baseId}-${k + 1}` : baseId,
        name: src[F.name] != null ? String(src[F.name]) : "",
        type: src[F.type] != null ? String(src[F.type]) : "",
        flood,
        cls: classIndex(flood),
        latlng: [c[1], c[0]]
      });
    });
  });
  return out;
}

function pointPopupHtml(p) {
  return `<b>${escapeHtml(p.name || p.id)}</b><br>` +
    `รหัส: ${escapeHtml(p.id)}<br>` +
    (p.type ? `ประเภท: ${escapeHtml(p.type)}<br>` : "") +
    `น้ำท่วมสะสม: <b>${escapeHtml(p.flood)} ${C.UNIT||'ครั้ง'}</b>`;
}

function renderPoints() {
  if (pointLayer) pointLayer.remove();
  pointLayer = null;
  if (!pointData || !pointData.length) return;
  if (!pointRenderer) pointRenderer = L.svg();   // วาดแบบ SVG แยกชั้น จึงอยู่เหนือ canvas ของอาคารเสมอ
  pointLayer = L.layerGroup(pointData.map(p =>
    L.circleMarker(p.latlng, {
      renderer: pointRenderer, radius: 8, color: "#12303f", weight: 1.5,
      fillColor: classColor(p.flood), fillOpacity: 0.95
    })
      .bindPopup(pointPopupHtml(p), { maxWidth: 260 })
      .bindTooltip(`${escapeHtml(p.name || p.id)} (${p.flood} ${C.UNIT||'ครั้ง'})`, { direction: "top", className: "bld-tip" })
  ));
  const chk = document.getElementById("chk-flood-points");
  if (!chk || chk.checked) pointLayer.addTo(map);
}

/* ================= การวาดอาคาร ================= */
function buildingStyle(feature) {
  const p = feature.properties;
  if (!state.groupOn) {
    return { color: "#12303f", weight: 1.2, fillColor: "#ffffff", fillOpacity: 0.92 };
  }
  const dim = state.activeClass !== null && p.cls !== state.activeClass;
  return {
    color: dim ? "#8a9ba3" : "#12303f",
    weight: dim ? 0.6 : 1.3,
    fillColor: dim ? "#cfd8dc" : C.CLASSES[p.cls].color,
    fillOpacity: dim ? 0.35 : 0.9
  };
}

/* เลือกปี: 'all' = จำนวนครั้งสะสม, ปีใดปีหนึ่ง = ท่วม(1)/ไม่ท่วม(0) ในปีนั้น */
window.setFloodYear = function (y) {
  if (!DATA) return false;
  state.year = y;
  DATA.features.forEach(f => {
    const p = f.properties;
    if (p.flood_total == null) { p.flood_total = p.flood_level; p.flood_yrs = String(p.flood_years || "").split(",").filter(Boolean); }
    p.flood_level = y === "all" ? p.flood_total : (p.flood_yrs.includes(String(y)) ? 1 : 0);
    p.cls = classIndex(p.flood_level);
  });
  renderBuildings();
  updateSummary();
  return true;
};

function popupHtml(p) {
  return `<b>รหัสอาคาร: ${escapeHtml(p.bldg_id)}</b><br>` +
    `ประเภท: ${escapeHtml(p.bldg_type || "ไม่ระบุ")}<br>` +
    (state.year && state.year !== "all"
      ? `ปี ${state.year}: <b>${p.flood_level ? "ท่วม" : "ไม่ท่วม"}</b><br>` : "") +
    `ท่วมสะสม: <b>${escapeHtml(p.flood_total != null ? p.flood_total : p.flood_level)} ${C.UNIT||'ครั้ง'}</b>` +
    (p.flood_years ? `<br><small>ปีที่ท่วม: ${escapeHtml(p.flood_years.split(",").join(", ") || "-")}</small>` : "");
}

function renderBuildings() {
  if (!DATA) return;
  const list = filtered();
  if (buildingLayer) buildingLayer.remove();
  buildingLayer = L.geoJSON({ type: "FeatureCollection", features: list }, {
    style: buildingStyle,
    onEachFeature: (f, layer) => layer.bindPopup(popupHtml(f.properties), { maxWidth: 260 })
  });
  if (document.getElementById("chk-bld").checked) buildingLayer.addTo(map);

  if (pinLayer) pinLayer.remove();
  pinLayer = L.layerGroup(list.map(f => {
    return L.circleMarker(f.properties.ctr, { radius: 4, color: "#fff", weight: 2, fillColor: "#1f8aa6", fillOpacity: 1 })
      .bindTooltip(`${escapeHtml(f.properties.bldg_id)} (${f.properties.flood_level} ${C.UNIT||'ครั้ง'})`, { direction: "top", className: "bld-tip" });
  }));
  if (pinsOn) pinLayer.addTo(map);
  updateSummary();
}

function restyleBuildings() {
  if (buildingLayer) buildingLayer.setStyle(buildingStyle);
}

function updateSummary() {
  if (!DATA) return;
  const shown = filtered();
  const affected = shown.filter(f => f.properties.flood_level > 0).length;
  const counts = C.CLASSES.map(() => 0);
  shown.forEach(f => counts[f.properties.cls]++);
  const pct = shown.length ? Math.round(affected / shown.length * 100) : 0;

  const box = document.getElementById("summary");
  if (box) {
    const yr = state.year && state.year !== "all" ? state.year : null;
    box.innerHTML = `<div class="sm-head"><b>${affected}</b> ${yr ? `หลังถูกน้ำท่วมในปี ${escapeHtml(yr)}` : "หลังเคยถูกน้ำท่วม"}<span>${pct}% ของ ${shown.length} หลัง</span></div>`;
  }
  const legendBox = document.getElementById("legend");
  if (legendBox) {
    const yr = state.year && state.year !== "all";
    const rows = yr   // โหมดรายปี: ค่ามีแค่ 0/1 จึงแสดง 2 แถว
      ? [{ c: C.CLASSES[0], label: "ไม่ท่วม", n: counts[0] }, { c: C.CLASSES[1], label: "ท่วมในปีนี้", n: counts[1] }]
      : C.CLASSES.map((c, i) => ({ c, label: c.label, n: counts[i] }));
    legendBox.innerHTML = rows.map(r =>
      `<div class="lg"><i style="background:${r.c.color}"></i><span>${escapeHtml(r.label)}</span><em>${r.n}</em></div>`).join("");
  }
}

function zoomToFeatures(features) {
  if (!features || !features.length) return;
  const b = L.geoJSON({ type: "FeatureCollection", features }).getBounds();
  if (b.isValid()) map.fitBounds(b, { padding: DEFAULT_ZOOM_PADDING, maxZoom: 19 });
}

/* ================= เมนูความถี่น้ำท่วม (สร้างจาก C.CLASSES) ================= */
function buildLevelList() {
  const box = document.getElementById("flood-sublayers");
  if (!box) return;
  box.innerHTML = C.CLASSES.map((c, i) => `
    <div class="layer-item">
      <label class="chk-wrap">
        <input type="checkbox" class="fld-lvl-chk" data-class="${i}">
        <span class="chk-box"></span>
        <i class="lvl-sw" style="background:${c.color}"></i>
        <span class="layer-title">${escapeHtml(c.label)}</span>
      </label>
      <button class="zoom-layer-btn" data-class="${i}" title="ซูมไปที่อาคารในระดับนี้">${ZOOM_ICON}</button>
    </div>`).join("");
}

function buildLegend() {
  const legendBox = document.getElementById("legend");
  if (legendBox) {
    legendBox.innerHTML = C.CLASSES
      .map(c => `<div class="lg"><i style="background:${c.color}"></i><span>${escapeHtml(c.label)}</span></div>`).join("");
  }
}

/* ================= ปุ่มและหน้าต่างต่างๆ ================= */
function wireUI() {
  const on = (id, evt, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); return el; };

  on("btn-home", "click", () => {
    if (boundaryLayer) map.fitBounds(boundaryLayer.getBounds(), { padding: [30, 30] });
    else map.setView(C.CENTER, C.ZOOM);
  });
  on("chk-boundary", "change", e => {
    if (!boundaryLayer) return;
    if (e.target.checked) boundaryLayer.addTo(map); else boundaryLayer.remove();
  });
  on("btn-zoom-in", "click", () => map.zoomIn());
  on("btn-zoom-out", "click", () => map.zoomOut());

  // ----- หน้าต่างลอย -----
  const panel = document.getElementById("floating-panel");
  const actionBtns = document.querySelectorAll("[data-panel]");
  const views = document.querySelectorAll(".panel-view");
  actionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const isOpen = btn.classList.contains("active") && !panel.classList.contains("hidden");
      if (isOpen) {
        panel.classList.add("hidden");
        btn.classList.remove("active");
      } else {
        panel.classList.remove("hidden");
        actionBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        setLayersOpen(false);   // แผงทั้งสองอยู่ตำแหน่งเดียวกัน เปิดทีละแผง
        views.forEach(v => v.classList.toggle("hidden", v.id !== btn.dataset.panel));
      }
    });
  });
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      panel.classList.add("hidden");
      actionBtns.forEach(b => b.classList.remove("active"));
    });
  });

  // ----- แผง Layers: เปิด/ปิดจากปุ่มในแถบซ้าย -----
  const layersPanel = document.getElementById("layers-panel");
  const layersBtn = document.getElementById("btn-layers");
  const setLayersOpen = open => {
    layersPanel.classList.toggle("hidden", !open);
    layersBtn.classList.toggle("active", open);
  };
  layersBtn.addEventListener("click", () => {
    const open = layersPanel.classList.contains("hidden");
    if (open) { panel.classList.add("hidden"); actionBtns.forEach(b => b.classList.remove("active")); }
    setLayersOpen(open);
  });
  document.querySelectorAll("[data-toggle-layers]").forEach(b => b.addEventListener("click", () => setLayersOpen(false)));

  // ----- Legend: กดหัวแผงเพื่อพับเก็บ-เปิด -----
  document.querySelectorAll(".side-head").forEach(head => {
    head.addEventListener("click", () => {
      const sec = document.getElementById(head.dataset.collapse);
      const collapsed = sec.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", String(!collapsed));
    });
  });

  // ----- เลเยอร์ -----
  on("chk-bld", "change", e => {
    if (!buildingLayer) return;
    if (e.target.checked) buildingLayer.addTo(map); else buildingLayer.remove();
  });
  on("chk-pins", "change", e => {
    pinsOn = e.target.checked;
    if (!pinLayer) return;
    if (pinsOn) pinLayer.addTo(map); else pinLayer.remove();
  });

  // อาคารกับน้ำท่วมแยกกัน: ปุ่มของส่วนหนึ่งไม่กระทบอีกส่วน
  const chkColor = document.getElementById("chk-flood-color");   // ระบายสีอาคารตามระดับน้ำ
  const chkWater = document.getElementById("chk-flood-water");   // ผิวน้ำท่วม (WMS)
  const chkBodies = document.getElementById("chk-water-bodies"); // แหล่งน้ำ (แม่น้ำ/บ่อ)

  chkWater.addEventListener("change", () => {
    if (!wmsLayer) return;
    if (chkWater.checked) wmsLayer.addTo(map); else wmsLayer.remove();
  });
  chkBodies.addEventListener("change", () => {
    if (!waterLayer) return;
    if (chkBodies.checked) { waterLayer.addTo(map); waterLayer.bringToBack(); } else waterLayer.remove();
  });

  const chkPoints = document.getElementById("chk-flood-points");   // จุดน้ำท่วม
  chkPoints.addEventListener("change", () => {
    if (!pointLayer) return;
    if (chkPoints.checked) pointLayer.addTo(map); else pointLayer.remove();
  });

  // เลือกความถี่ได้ทีละระดับ: เน้นเฉพาะอาคารในช่วงนั้น  ไม่เลือกเลย = แสดงทุกระดับ
  const subChks = Array.from(document.querySelectorAll(".fld-lvl-chk"));
  subChks.forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) {
        subChks.forEach(o => { if (o !== chk) o.checked = false; });
        state.activeClass = parseInt(chk.dataset.class, 10);
        state.groupOn = true;
        chkColor.checked = true;
      } else {
        state.activeClass = null;
      }
      restyleBuildings();
    });
  });
  chkColor.addEventListener("change", () => {
    state.groupOn = chkColor.checked;
    if (!chkColor.checked) { state.activeClass = null; subChks.forEach(c => { c.checked = false; }); }
    restyleBuildings();
  });

  const zoomBtnHandler = btn => btn.addEventListener("click", () => {
    if (btn.dataset.zoom === "water") {
      const wb = waterLayer && waterLayer.getBounds();
      if (wb && wb.isValid()) map.fitBounds(wb, { padding: DEFAULT_ZOOM_PADDING });
      else if (boundaryLayer) map.fitBounds(boundaryLayer.getBounds(), { padding: [30, 30] });
      else map.setView(C.CENTER, C.ZOOM);
      return;
    }
    if (btn.dataset.zoom === "points") {
      if (pointData && pointData.length) map.fitBounds(L.latLngBounds(pointData.map(p => p.latlng)), { padding: DEFAULT_ZOOM_PADDING, maxZoom: 19 });
      return;
    }
    if (!DATA) return;
    if (btn.dataset.zoom === "all") { zoomToFeatures(filtered()); return; }
    const cls = parseInt(btn.dataset.class, 10);
    const m = DATA.features.filter(f => f.properties.cls === cls);
    zoomToFeatures(m.length ? m : DATA.features);
  });
  document.querySelectorAll(".zoom-layer-btn").forEach(zoomBtnHandler);

  // ----- ค้นหา / กรอง -----
  const search = document.getElementById("search");
  let searchTimer = null;
  const applyQuery = () => { state.query = search.value.trim().toLowerCase(); renderBuildings(); };
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyQuery, 200); });   // หน่วง 200 ms ไม่วาดใหม่ทุกตัวอักษร
  search.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    clearTimeout(searchTimer);
    applyQuery();
    zoomToFeatures(filtered());
  });
  on("reset", "click", () => {
    clearTimeout(searchTimer);
    search.value = "";
    state.query = "";
    renderBuildings();
    if (DATA) zoomToFeatures(DATA.features);
  });

  // ----- แผนที่ฐาน -----
  document.querySelectorAll(".bm-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".bm-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      const key = card.dataset.bm;
      Object.keys(baseLayers).forEach(k => { if (k === key) baseLayers[k].addTo(map); else baseLayers[k].remove(); });
      state.basemap = key;
    });
  });
}

/* ================= เริ่มทำงาน ================= */
async function init() {
  buildLevelList();
  buildLegend();
  wireUI();

  const G = C.GEONODE || {};

  // ยังตั้งค่า GeoNode ไม่ครบ -> ใช้ข้อมูลตัวอย่างไปก่อน แทนที่จะพัง
  if (MODE === "geonode" && !(hasGeonode() && G.BUILDINGS_LAYER)) {
    MODE = "mock";
    showMessage("ยังไม่ได้ตั้งค่า GeoNode (OWS_URL / BUILDINGS_LAYER) จึงแสดงข้อมูลอาคารตัวอย่างไปก่อน", 9000);
  }

  // ชั้นน้ำท่วมแบบ WMS ใช้ได้อิสระจากโหมดอาคาร: ใส่ OWS_URL + FLOOD_WMS_LAYER เมื่อไรก็ขึ้นเมื่อนั้น
  if (hasGeonode() && G.FLOOD_WMS_LAYER) {
    wmsLayer = L.tileLayer.wms(G.OWS_URL, {
      layers: G.FLOOD_WMS_LAYER, format: "image/png", transparent: true, version: "1.1.1",
      opacity: G.WMS_OPACITY != null ? G.WMS_OPACITY : 0.7
    }).addTo(map);
    let wmsWarned = false;
    wmsLayer.on("tileerror", () => {
      if (wmsWarned) return;
      wmsWarned = true;
      showMessage("โหลดชั้นน้ำท่วม (WMS) ไม่สำเร็จ ตรวจ OWS_URL, FLOOD_WMS_LAYER และ CORS ของ GeoServer", 9000);
    });
  }

  const boundaryUrl = optionalLayerUrl(C.BOUNDARY_URL, G.BOUNDARY_LAYER);
  if (boundaryUrl) {
    try {
      const rawB = await fetchJson(boundaryUrl);
      boundaryLayer = L.geoJSON(rawB, {
        style: { color: "#d4492e", weight: 3, dashArray: "10 6", fill: false },
        interactive: false
      }).addTo(map);
      const bb = boundaryLayer.getBounds();
      if (bb.isValid()) map.fitBounds(bb, { padding: [30, 30] });   // เริ่มที่ขอบเขตหมู่ 15
    } catch (err) {
      console.warn("โหลดขอบเขตหมู่ 15 ไม่สำเร็จ:", err);
      showMessage("โหลดไฟล์ขอบเขตหมู่ 15 ไม่สำเร็จ ตรวจ BOUNDARY_URL / GEONODE.BOUNDARY_LAYER ใน config.js");
    }
  }

  const waterUrl = optionalLayerUrl(C.WATER_URL, G.WATER_LAYER);
  try {
    const [rawBuildings, rawWater] = await Promise.all([
      fetchJson(buildingsUrl()),
      waterUrl ? fetchJson(waterUrl).catch(err => { console.warn("โหลดขอบเขตน้ำไม่สำเร็จ:", err); return null; }) : null
    ]);
    DATA = normalizeBuildings(rawBuildings);
    if (!DATA.features.length) throw new Error("ไฟล์ไม่มีอาคารที่เป็น Polygon");

    if (rawWater && rawWater.features && rawWater.features.length) {
      waterLayer = L.geoJSON(rawWater, { style: { color: "#1f8aa6", weight: 1, fillColor: "#1f8aa6", fillOpacity: 0.4 }, interactive: false }).addTo(map);
      waterLayer.bringToBack();
    }

    renderBuildings();
    if (missingFlood === DATA.features.length) {
      showMessage(`ไม่พบฟิลด์ความถี่น้ำท่วม "${C.FIELDS.flood}" ในข้อมูลอาคาร ทุกหลังจึงแสดงเป็น 0 ตรวจ FIELDS.flood ใน config.js`, 12000);
    }
    // มุมมองเริ่มต้น: ถ้ามีขอบเขตหมู่ 15 จะซูมไปที่ขอบเขตนั้น ไม่เช่นนั้นใช้ C.CENTER / C.ZOOM
    // ไม่ซูมตามข้อมูลอาคารทั้งหมด เพราะข้อมูลจริงจาก GeoNode อาจครอบคลุมพื้นที่กว้างกว่าหมู่ 15
  } catch (e) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", e);
    showMessage(MODE === "geonode"
      ? "โหลดข้อมูลอาคารจาก GeoNode ไม่สำเร็จ: ตรวจ OWS_URL, BUILDINGS_LAYER, CQL และ CORS ของ GeoServer (ดูรายละเอียดใน Console)"
      : "โหลดข้อมูลอาคารไม่สำเร็จ: ตรวจสอบว่าไฟล์อยู่ใน data/ และเปิดผ่านเซิร์ฟเวอร์ (เช่น Live Server) ไม่ใช่เปิดไฟล์ตรงๆ");
  }

  // จุดน้ำท่วม: โหลดหลังอาคาร เพื่อให้ชั้น SVG ของจุดอยู่เหนือ canvas ของอาคาร
  const pUrl = pointsUrl();
  if (pUrl) {
    try {
      pointData = normalizePoints(await fetchJson(pUrl));
      renderPoints();
    } catch (err) {
      console.warn("โหลดจุดน้ำท่วมไม่สำเร็จ:", err);
      showMessage("โหลดจุดน้ำท่วมไม่สำเร็จ ตรวจ FLOOD_POINTS_URL / GEONODE.FLOOD_POINTS_LAYER ใน config.js", 9000);
    }
  }

  // ชั้นไหนไม่มีข้อมูล ปิดช่องติ๊กของชั้นนั้น  ถ้าไม่มีเลยให้บอกว่าต้องตั้งค่าอะไร
  const hasWms = !!wmsLayer;
  const hasWater = !!waterLayer;
  const hasPoints = !!(pointData && pointData.length);
  const chkW = document.getElementById("chk-flood-water");
  if (chkW) { chkW.disabled = !hasWms; chkW.checked = hasWms; }
  const chkB = document.getElementById("chk-water-bodies");
  if (chkB) { chkB.disabled = !hasWater; chkB.checked = hasWater; }
  const chkP = document.getElementById("chk-flood-points");
  if (chkP) { chkP.disabled = !hasPoints; chkP.checked = hasPoints; }
  const hint = document.getElementById("flood-hint");
  if (hint) hint.classList.toggle("hidden", hasWms || hasWater || hasPoints);
}

init();