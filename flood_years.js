/* ชั้นน้ำท่วมรายปีจากแรสเตอร์ 2011–2025 (data/flood/*.png)
   dropdown = สะสม / ความถี่เท่านั้น   ปุ่มปี = เลือกรายปี (ไม่มีรายการปีใน dropdown แล้ว) */
(async function () {
  try {
    const meta = await (await fetch("data/flood/meta.json")).json();
    const sel = document.getElementById("flood-year");
    const chk = document.getElementById("chk-flood-year");
    if (!sel || !chk) return;
    let cur = "all";   // ค่าที่เลือกอยู่: "all" | "freq_1".."freq_6" | "2011".."2025"

    sel.innerHTML = `<option value="all">สะสมทุกปี (ความถี่)</option>` +
      [1,2,3,4,5,6].map(k => `<option value="freq_${k}">ความถี่ ${k===6?"6 ครั้งขึ้นไป":k+" ครั้ง"} เท่านั้น</option>`).join("") +
      `<option value="year" hidden>ปี</option>`;   // ซ่อนในรายการ ใช้แสดงปีที่เลือกจากปุ่ม
    const yearOpt = sel.querySelector('option[value="year"]');

    // ปุ่มเลือกปี
    const chips = document.createElement("div");
    chips.className = "year-chips";
    chips.innerHTML = `<button type="button" data-v="all">สะสม</button>` +
      meta.years.map(y => `<button type="button" data-v="${y}">${y}</button>`).join("");
    sel.insertAdjacentElement("afterend", chips);
    const mark = () => chips.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === cur));

    let layer = null;
    const draw = () => {
      if (layer) { layer.remove(); layer = null; }
      if (!chk.checked) return;
      layer = L.imageOverlay(`data/flood/${cur}.png`, meta.bounds, { opacity: 0.85, interactive: false, className: "flood-img" }).addTo(map);
      layer.bringToBack();
      layer.getElement().addEventListener("error", () => {
        console.warn("ไม่พบไฟล์ภาพ", layer && layer._url);
        const hint = document.getElementById("flood-hint");
        if (hint) { hint.textContent = "ไม่พบภาพน้ำท่วม: ต้องมีโฟลเดอร์ data/flood/ (all.png, 2011.png … 2025.png, freq_1.png … freq_6.png, meta.json) วางอยู่ข้างไฟล์ index.html"; hint.classList.remove("hidden"); }
        if (layer) { layer.remove(); layer = null; }
      });
    };
    const sync = () => { const v = chk.checked && !cur.startsWith("freq_") ? cur : "all"; return window.setFloodYear ? window.setFloodYear(v) : false; };
    const apply = () => { mark(); draw(); sync(); };

    chips.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      cur = b.dataset.v; chk.checked = true;
      if (cur === "all" || cur.startsWith("freq_")) sel.value = cur;
      else { yearOpt.textContent = "ปี " + cur; sel.value = "year"; }
      apply();
    });
    sel.addEventListener("change", () => { cur = sel.value; apply(); });
    chk.addEventListener("change", apply);
    const t = setInterval(() => { if (sync()) clearInterval(t); }, 300);
    apply();
  } catch (e) { console.warn("โหลดชั้นน้ำท่วมรายปีไม่สำเร็จ", e); }
})();