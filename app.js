const C = window.CONFIG;

// กำหนดความสูงอาคารให้สมจริงตามประเภทสิ่งปลูกสร้างในพื้นที่ (บ้าน, วัด, โรงเรียน)
const TYPE_HEIGHTS = {
  "วัด": 12,
  "โรงเรียน": 10,
  "บ้านพัก": 5.5,    // บ้านชั้นเดียวหรือสองชั้น
  "ร้านค้า": 5,
  "โรงเก็บของ": 4
};

const ROTATE_SPEED_X = 0.15;
const ROTATE_SPEED_Y = 0.12;
const PAN_SPEED = 0.65;

const state = {
  minLevel: 0,
  query: "",
  waterLevel: 1.0,
  waterOpacity: 0.55,
  orbitMode: true,
  spinning: false,
  is2D: false,
  minutes: 15 * 60,   // เวลาในวัน (นาที) ของแถบ Daylight
  sunAz: 210,
  sunAlt: 45,
  playing: false
};

let DATA = null;
let spinFrame = null;

const map = new maplibregl.Map({
  container: "map",
  center: [C.CENTER[1], C.CENTER[0]],
  zoom: C.ZOOM,
  pitch: 60,
  bearing: -30,
  maxPitch: 85,
  antialias: true,
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sky: {
      "sky-color": "#81d4fa",
      "sky-horizon-blend": 0.4,
      "horizon-color": "#ffffff",
      "horizon-fog-blend": 0.5,
      "fog-color": "#e1f5fe",
      "fog-ground-blend": 0.5
    },
    light: {
      anchor: "map",
      color: "#ffffff",
      intensity: 0.8,
      position: [1.5, 210, 45]
    },
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "© Esri"
      },
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap"
      },
      light: {
        type: "raster",
        tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap © CARTO"
      },
      street: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "© Esri"
      },
      topo: {
        type: "raster",
        tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© OpenTopoMap (CC-BY-SA)"
      }
    },
    layers: [
      { id: "basemap-osm", type: "raster", source: "osm", layout: { visibility: "none" } },
      { id: "basemap-light", type: "raster", source: "light", layout: { visibility: "none" } },
      { id: "basemap-street", type: "raster", source: "street", layout: { visibility: "none" } },
      { id: "basemap-topo", type: "raster", source: "topo", layout: { visibility: "none" } },
      { id: "basemap-sat", type: "raster", source: "satellite", layout: { visibility: "visible" } }
    ]
  }
});

map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

function setup3DCameraControl() {
  const canvas = map.getCanvasContainer();
  let dragging = false;
  let btn = 0;
  let lastX = 0, lastY = 0;

  map.dragPan.disable();
  map.dragRotate.disable();

  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("mousedown", e => {
    stopSpin();
    dragging = true;
    btn = e.button;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const isRotateAction = !state.is2D && ((state.orbitMode && btn === 0) || (!state.orbitMode && btn === 2));

    if (isRotateAction) {
      const bearing = map.getBearing() - dx * ROTATE_SPEED_X;
      const pitch = Math.max(0, Math.min(85, map.getPitch() - dy * ROTATE_SPEED_Y));
      map.jumpTo({ bearing, pitch });
    } else {
      map.panBy([-dx * PAN_SPEED, -dy * PAN_SPEED], { animate: false });
    }
  });

  window.addEventListener("mouseup", () => { dragging = false; });

  const compassSvg = document.getElementById("compass-svg");
  map.on("rotate", () => {
    if (compassSvg) compassSvg.style.transform = `rotate(${-map.getBearing()}deg)`;
  });
}

function stopSpin() {
  if (state.spinning) {
    state.spinning = false;
    cancelAnimationFrame(spinFrame);
    const btn = document.getElementById("btn-autospin");
    if (btn) btn.textContent = "🔄 หมุนมุมกล้อง 360° อัตโนมัติ";
  }
}

function toggleSpin() {
  if (state.is2D) return;
  if (state.spinning) {
    stopSpin();
  } else {
    state.spinning = true;
    const btn = document.getElementById("btn-autospin");
    if (btn) btn.textContent = "⏹️ หยุดหมุนอัตโนมัติ";
    const loop = () => {
      if (!state.spinning) return;
      map.jumpTo({ bearing: map.getBearing() + 0.12 });
      spinFrame = requestAnimationFrame(loop);
    };
    spinFrame = requestAnimationFrame(loop);
  }
}

function classIndex(v) {
  for (let i = 0; i < C.CLASSES.length; i++) if (v < C.CLASSES[i].max) return i;
  return C.CLASSES.length - 1;
}
function classColor(v) { return C.CLASSES[classIndex(v)].color; }
// สีผิวน้ำตามระดับที่เลือก: ทุก 0.5 ม. ต่อ 1 ระดับ (7 ระดับ อ่อน → เข้ม)
function levelColor(v) {
  const i = Math.max(0, Math.min(C.CLASSES.length - 1, Math.ceil(v / 0.5 - 1e-9) - 1));
  return C.CLASSES[i].color;
}

function passes(f) {
  const p = f.properties;
  if (p.flood_level < state.minLevel) return false;
  if (state.query && !String(p.bldg_id).toLowerCase().includes(state.query)) return false;
  return true;
}

function getWaterSurfaceGeoJSON(features, height) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  features.forEach(f => {
    f.geometry.coordinates[0].forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  });
  const pad = 0.001;
  minLng -= pad; minLat -= pad; maxLng += pad; maxLat += pad;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { height },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [minLng, minLat], [maxLng, minLat],
          [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]
        ]]
      }
    }]
  };
}

// ---------- แสงอาทิตย์ + เงาอาคาร ----------
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// เงาทอดไปด้านตรงข้ามดวงอาทิตย์ ยาว = ความสูงอาคาร / tan(มุมเงยดวงอาทิตย์)
function getShadowGeoJSON(features) {
  const alt = Math.max(5, state.sunAlt) * Math.PI / 180;
  const dir = (state.sunAz + 180) * Math.PI / 180;
  const out = [];
  features.forEach(f => {
    const ring = f.geometry.coordinates[0].slice(0, -1);
    const len = Math.min(150, f.properties.bldg_height / Math.tan(alt));
    const dLat = Math.cos(dir) * len / 110574;
    const dLng = Math.sin(dir) * len / (111320 * Math.cos(ring[0][1] * Math.PI / 180));
    const hull = convexHull(ring.concat(ring.map(([x, y]) => [x + dLng, y + dLat])));
    hull.push(hull[0]);
    out.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hull] } });
  });
  return { type: "FeatureCollection", features: out };
}

// ตำแหน่งดวงอาทิตย์จริงตามเวลา (อัลกอริทึมดาราศาสตร์แบบย่อ) ที่พิกัดหมู่ 15 วันนี้ เวลาไทย (UTC+7)
function sunFromMinutes(min) {
  const lat = C.CENTER[0], lon = C.CENTER[1], rad = Math.PI / 180;
  const now = new Date();
  const ms = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0) + (min - 7 * 60) * 60000;
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const H = (gmst + lon) * rad - ra;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat * rad) - Math.tan(dec) * Math.cos(lat * rad)) / rad + 180;
  return { az: (az % 360 + 360) % 360, alt: alt / rad };
}

function updateSunState() {
  const p = sunFromMinutes(state.minutes);
  state.sunAz = p.az;
  state.sunAlt = p.alt;
}

const BASEMAP_IDS = ["basemap-sat", "basemap-osm", "basemap-light", "basemap-street", "basemap-topo"];

function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// ความสว่างทั้งแมพ: 0 = กลางคืน, 1 = กลางวัน (เปลี่ยนค่อยๆ ช่วงดวงอาทิตย์ -6° ถึง +12°)
function daylightFactor() {
  const t = Math.max(0, Math.min(1, (state.sunAlt + 6) / 18));
  return t * t * (3 - 2 * t);
}

function applyAmbient() {
  const d = daylightFactor();
  BASEMAP_IDS.forEach(id => {
    if (!map.getLayer(id)) return;
    map.setPaintProperty(id, "raster-brightness-max", 0.2 + 0.8 * d);
    map.setPaintProperty(id, "raster-saturation", -0.55 * (1 - d));
    map.setPaintProperty(id, "raster-contrast", -0.15 * (1 - d));
  });
  if (map.getLayer("bld-3d")) {
    map.setPaintProperty("bld-3d", "fill-extrusion-color", mixHex("#3b4859", "#e8ecef", d));
  }
  if (typeof map.setSky === "function") {
    map.setSky({
      "sky-color": mixHex("#050b1a", "#81d4fa", d),
      "horizon-color": mixHex("#16254a", "#ffffff", d),
      "fog-color": mixHex("#0a1530", "#e1f5fe", d),
      "sky-horizon-blend": 0.4,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.5
    });
  }
}

function applySun() {
  applyAmbient();
  const dark = state.sunAlt <= 0;
  const alt = Math.max(0, state.sunAlt);
  map.setLight({
    anchor: "map",
    color: dark ? "#8fa6c4" : "#ffffff",
    intensity: dark ? 0.25 : 0.8,
    position: [1.5, state.sunAz, Math.min(90 - alt, 89)]
  });
  if (map.getLayer("shadow-2d")) {
    map.setPaintProperty("shadow-2d", "fill-opacity", dark ? 0 : 0.38 * Math.min(1, alt / 10));
  }
  const src = map.getSource("shadows");
  if (src && DATA) src.setData(getShadowGeoJSON(DATA.features.filter(passes)));
}

function getBuildingCentroids(features) {
  return {
    type: "FeatureCollection",
    features: features.map(f => {
      const coords = f.geometry.coordinates[0];
      let lng = 0, lat = 0;
      const n = coords.length - 1;
      for (let i = 0; i < n; i++) { lng += coords[i][0]; lat += coords[i][1]; }
      return {
        type: "Feature",
        properties: f.properties,
        geometry: { type: "Point", coordinates: [lng / n, lat / n] }
      };
    })
  };
}

function updateSummary() {
  if (!DATA) return;
  const box = document.getElementById("summary");
  if (!box) return;
  const shown = DATA.features.filter(passes);
  const affected = shown.filter(f => f.properties.flood_level > 0).length;
  const counts = C.CLASSES.map(() => 0);
  shown.forEach(f => counts[classIndex(f.properties.flood_level)]++);
  const max = Math.max(1, ...counts);
  const pct = shown.length ? Math.round(affected / shown.length * 100) : 0;

  box.innerHTML =
    `<div>อาคารที่ได้รับผลกระทบ</div>
     <div class="sm-num">${affected} <small>หลัง (${pct}% ของที่แสดง)</small></div>
     <div style="margin-bottom:6px;">แสดง ${shown.length} จากทั้งหมด ${DATA.features.length} หลัง</div>` +
    C.CLASSES.map((c, i) =>
      `<div class="sm-row"><i style="background:${c.color}"></i><span>${c.label}</span><b>${counts[i]}</b></div>
       <div class="sm-bar"><div style="width:${counts[i] / max * 100}%"></div></div>`).join("");
}

function refreshData() {
  if (!DATA || !map.getSource("buildings")) return;
  const filteredFeatures = DATA.features.filter(passes);
  map.getSource("buildings").setData({ type: "FeatureCollection", features: filteredFeatures });
  map.getSource("pins").setData(getBuildingCentroids(filteredFeatures));
  if (map.getSource("shadows")) map.getSource("shadows").setData(getShadowGeoJSON(filteredFeatures));
  updateSummary();
}

function zoomToFeatures(features) {
  if (!features || !features.length) return;
  const bounds = new maplibregl.LngLatBounds();
  features.forEach(f => f.geometry.coordinates[0].forEach(c => bounds.extend(c)));
  map.fitBounds(bounds, { padding: 90, maxZoom: 19, pitch: state.is2D ? 0 : 60, bearing: state.is2D ? 0 : map.getBearing(), duration: 900 });
}

function wireUI() {
  const btnHome = document.getElementById("btn-home");
  if (btnHome) {
    btnHome.addEventListener("click", () => {
      stopSpin();
      map.easeTo({ center: [C.CENTER[1], C.CENTER[0]], zoom: C.ZOOM, pitch: state.is2D ? 0 : 60, bearing: state.is2D ? 0 : -30, duration: 900 });
    });
  }
  
  const zoomIn = document.getElementById("btn-zoom-in");
  if (zoomIn) zoomIn.addEventListener("click", () => map.zoomIn({ duration: 300 }));
  
  const zoomOut = document.getElementById("btn-zoom-out");
  if (zoomOut) zoomOut.addEventListener("click", () => map.zoomOut({ duration: 300 }));

  const btnPan = document.getElementById("btn-pan");
  const btnRotate = document.getElementById("btn-rotate");
  if (btnPan && btnRotate) {
    btnPan.addEventListener("click", () => {
      state.orbitMode = false;
      btnPan.classList.add("active");
      btnRotate.classList.remove("active");
    });
    btnRotate.addEventListener("click", () => {
      state.orbitMode = true;
      btnRotate.classList.add("active");
      btnPan.classList.remove("active");
    });
  }

  const btn2D = document.getElementById("btn-2d");
  if (btn2D) {
    btn2D.addEventListener("click", () => {
      stopSpin();
      state.is2D = !state.is2D;
      if (state.is2D) {
        map.setMaxPitch(0);
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      } else {
        map.setMaxPitch(85);
        map.easeTo({ pitch: 60, bearing: -30, duration: 700 });
      }
      btn2D.textContent = state.is2D ? "3D" : "2D";
      btn2D.title = state.is2D ? "สลับเป็นมุมมอง 3 มิติ" : "สลับเป็นมุมมอง 2 มิติ (มองจากด้านบน)";
      btn2D.classList.toggle("active", state.is2D);
      document.getElementById("btn-rotate")?.classList.toggle("disabled", state.is2D);
      document.getElementById("btn-autospin")?.classList.toggle("disabled", state.is2D);
    });
  }

  const btnCompass = document.getElementById("btn-compass");
  if (btnCompass) {
    btnCompass.addEventListener("click", () => {
      stopSpin();
      map.easeTo({ bearing: 0, duration: 600 });
    });
  }

  const panel = document.getElementById("floating-panel");
  const actionBtns = document.querySelectorAll(".action-btn");
  const views = document.querySelectorAll(".panel-view");

  actionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.panel;
      const isAlreadyActive = btn.classList.contains("active") && panel && !panel.classList.contains("hidden");

      if (isAlreadyActive) {
        panel.classList.add("hidden");
        btn.classList.remove("active");
      } else {
        if (panel) panel.classList.remove("hidden");
        actionBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        views.forEach(v => v.classList.toggle("hidden", v.id !== targetId));
      }
    });
  });

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (panel) panel.classList.add("hidden");
      actionBtns.forEach(b => b.classList.remove("active"));
    });
  });

  const tabLayers = document.getElementById("tab-btn-layers");
  const tabLegend = document.getElementById("tab-btn-legend");
  const contentLayers = document.getElementById("tab-content-layers");
  const contentLegend = document.getElementById("tab-content-legend");

  if (tabLayers && tabLegend && contentLayers && contentLegend) {
    tabLayers.addEventListener("click", () => {
      tabLayers.classList.add("active");
      tabLegend.classList.remove("active");
      contentLayers.classList.remove("hidden");
      contentLegend.classList.add("hidden");
    });
    tabLegend.addEventListener("click", () => {
      tabLegend.classList.add("active");
      tabLayers.classList.remove("active");
      contentLegend.classList.remove("hidden");
      contentLayers.classList.add("hidden");
    });
  }

  const chkBldWhite = document.getElementById("chk-bld3d");
  if (chkBldWhite) {
    chkBldWhite.addEventListener("change", () => {
      map.setLayoutProperty("bld-3d", "visibility", chkBldWhite.checked ? "visible" : "none");
    });
  }

  const chkPins = document.getElementById("chk-pins");
  if (chkPins) {
    chkPins.addEventListener("change", e => {
      const v = e.target.checked ? "visible" : "none";
      map.setLayoutProperty("pins-circle", "visibility", v);
      map.setLayoutProperty("pins-label", "visibility", v);
    });
  }

  const chkFloodGroup = document.getElementById("chk-flood-group");
  const subChks = document.querySelectorAll(".fld-lvl-chk");

  function setWaterSurfaceHeight(lvl) {
    state.waterLevel = lvl;
    if (map.getLayer("water-plane-3d")) map.setPaintProperty("water-plane-3d", "fill-extrusion-color", levelColor(lvl));
    if (map.getSource("water-surface")) {
      map.getSource("water-surface").setData(getWaterSurfaceGeoJSON(DATA.features, lvl));
    }
  }

  if (chkFloodGroup) {
    chkFloodGroup.addEventListener("change", () => {
      map.setLayoutProperty("water-plane-3d", "visibility", chkFloodGroup.checked ? "visible" : "none");
    });
  }

  subChks.forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) {
        subChks.forEach(other => { if (other !== chk) other.checked = false; });
        if (chkFloodGroup) chkFloodGroup.checked = true;
        map.setLayoutProperty("water-plane-3d", "visibility", "visible");
        setWaterSurfaceHeight(parseFloat(chk.value));
      } else {
        const anyChecked = Array.from(subChks).some(c => c.checked);
        if (!anyChecked) map.setLayoutProperty("water-plane-3d", "visibility", "none");
      }
    });
  });

  document.querySelectorAll(".zoom-layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!DATA) return;
      if (btn.dataset.zoom === "all") {
        zoomToFeatures(DATA.features.filter(passes));
      } else {
        const min = parseFloat(btn.dataset.min);
        const max = parseFloat(btn.dataset.max);
        const matches = DATA.features.filter(f => f.properties.flood_level >= min && f.properties.flood_level <= max);
        zoomToFeatures(matches.length ? matches : DATA.features);
      }
    });
  });

  const search = document.getElementById("search");
  const minlevel = document.getElementById("minlevel");
  if (search) {
    search.addEventListener("input", () => { state.query = search.value.trim().toLowerCase(); refreshData(); });
    search.addEventListener("keydown", e => { if (e.key === "Enter") zoomToFeatures(DATA.features.filter(passes)); });
  }
  if (minlevel) {
    minlevel.addEventListener("change", () => { state.minLevel = parseFloat(minlevel.value); refreshData(); });
  }

  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (search) search.value = "";
      if (minlevel) minlevel.value = "0";
      state.query = "";
      state.minLevel = 0;
      refreshData();
      zoomToFeatures(DATA.features);
    });
  }

  document.querySelectorAll(".bm-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".bm-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      ["sat", "osm", "light", "street", "topo"].forEach(key => {
        map.setLayoutProperty("basemap-" + key, "visibility", key === card.dataset.bm ? "visible" : "none");
      });
    });
  });

  // ---------- Daylight: แถบเวลาเดียว ควบคุมทั้งทิศและความสูงของดวงอาทิตย์ ----------
  const timeSlider = document.getElementById("sun-time");
  const timeLbl = document.getElementById("dl-time");
  const playBtn = document.getElementById("btn-daylight-play");
  let sunQueued = false;
  const queueSun = () => {
    if (sunQueued) return;
    sunQueued = true;
    requestAnimationFrame(() => { sunQueued = false; applySun(); });
  };
  function setTime(min) {
    state.minutes = min;
    if (timeSlider) timeSlider.value = min;
    const hh = String(Math.floor(min / 60) % 24).padStart(2, "0");
    const mm = String(Math.floor(min % 60)).padStart(2, "0");
    if (timeLbl) {
      timeLbl.innerHTML = `${hh}:${mm} <small>ICT</small>`;
      timeLbl.style.setProperty("--p", min / 1440);
    }
    updateSunState();
    queueSun();
  }
  function stopPlay() {
    state.playing = false;
    if (playBtn) { playBtn.textContent = "▶"; playBtn.classList.remove("playing"); }
  }
  if (timeSlider) {
    timeSlider.addEventListener("input", () => { stopPlay(); setTime(parseFloat(timeSlider.value)); });
    setTime(state.minutes);
  }
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (state.playing) { stopPlay(); return; }
      state.playing = true;
      playBtn.textContent = "❚❚";
      playBtn.classList.add("playing");
      let last = performance.now();
      const tick = now => {
        if (!state.playing) return;
        const dt = (now - last) / 1000;
        last = now;
        setTime((state.minutes + dt * 120) % 1440);   // 1 วินาที = 2 ชั่วโมง
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  const chkShadow = document.getElementById("chk-shadow");
  if (chkShadow) {
    chkShadow.addEventListener("change", () => {
      map.setLayoutProperty("shadow-2d", "visibility", chkShadow.checked ? "visible" : "none");
    });
  }

  const autospinBtn = document.getElementById("btn-autospin");
  if (autospinBtn) autospinBtn.addEventListener("click", toggleSpin);
}

function buildLegend() {
  const legendBox = document.getElementById("legend");
  if (legendBox) {
    legendBox.innerHTML = C.CLASSES
      .map(c => `<div class="lg"><i style="background:${c.color}"></i>${c.label}</div>`).join("");
  }
}

map.on("load", async () => {
  setup3DCameraControl();
  buildLegend();
  wireUI();

  try {
    const raw = await (await fetch(C.MOCK_URL)).json();
    raw.features.forEach(f => {
      const p = f.properties;
      p.bldg_height = TYPE_HEIGHTS[p.bldg_type] || 5.5;
      p.flood_color = classColor(p.flood_level);
    });
    DATA = raw;

    map.addSource("buildings", { type: "geojson", data: DATA });
    map.addSource("pins", { type: "geojson", data: getBuildingCentroids(DATA.features) });
    map.addSource("water-surface", {
      type: "geojson",
      data: getWaterSurfaceGeoJSON(DATA.features, state.waterLevel)
    });

    updateSunState();
    map.addSource("shadows", { type: "geojson", data: getShadowGeoJSON(DATA.features) });
    // เงาอาคารบนพื้น (อยู่ใต้ผิวน้ำและตัวอาคาร)
    map.addLayer({
      id: "shadow-2d",
      type: "fill",
      source: "shadows",
      paint: { "fill-color": "#0b1f2b", "fill-opacity": 0.38 }
    });

    // เลเยอร์ผิวน้ำท่วมพื้นที่ (สีฟ้าใสกลมกลืนกับแม่น้ำจริง)
    map.addLayer({
      id: "water-plane-3d",
      type: "fill-extrusion",
      source: "water-surface",
      paint: {
        "fill-extrusion-color": levelColor(state.waterLevel),
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": state.waterOpacity
      }
    });

    // เลเยอร์อาคาร 3 มิติสีขาว
    map.addLayer({
      id: "bld-3d",
      type: "fill-extrusion",
      source: "buildings",
      paint: {
        "fill-extrusion-color": "#e8ecef",
        "fill-extrusion-height": ["get", "bldg_height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1
      }
    });

    map.addLayer({
      id: "pins-circle",
      type: "circle",
      source: "pins",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": 5,
        "circle-color": "#0079c1",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff"
      }
    });
    map.addLayer({
      id: "pins-label",
      type: "symbol",
      source: "pins",
      layout: {
        visibility: "none",
        "text-field": ["concat", ["get", "bldg_id"], " (", ["get", "flood_level"], "ม.)"],
        "text-size": 11,
        "text-offset": [0, -1.2],
        "text-anchor": "bottom"
      },
      paint: {
        "text-color": "#1b2733",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5
      }
    });

    map.on("click", "bld-3d", e => {
      const p = e.features[0].properties;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<b>รหัสอาคาร: ${p.bldg_id}</b><br>ประเภท: ${p.bldg_type} (สูง ~${p.bldg_height} ม.)<br>ระดับน้ำท่วม: <b>${p.flood_level} ม.</b>`)
        .addTo(map);
    });

    applySun();
    updateSummary();
    zoomToFeatures(DATA.features);
  } catch (e) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", e);
  }
});