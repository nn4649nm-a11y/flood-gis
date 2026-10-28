// ตั้งค่าที่เดียว: ตอนสลับเป็นข้อมูลจริง แก้แค่ไฟล์นี้
window.CONFIG = {
  MODE: "mock", // "mock" = ใช้ไฟล์จำลองในเครื่อง | "geonode" = ดึงจาก GeoNode ผ่าน WMS
  CENTER: [16.7727, 100.123],
  ZOOM: 17,
  MOCK_URL: "data/mock_buildings_moo15.geojson",
  GEONODE: {
    WMS_URL: "https://YOUR-GEONODE-HOST/geoserver/ows", // TODO: ใส่ URL จากพี่ตอน D2
    BUILDINGS_LAYER: "geonode:buildings_moo15",          // TODO: ชื่อ layer จริง
    FLOOD_LAYER: "geonode:flood_level_moo15"             // TODO: ชื่อ layer จริง
  },
  // ช่วงระดับน้ำและสี (ตรงกับ SLD ที่จะตั้งใน GeoServer)
  CLASSES: [
    { max: 0.5, color: "#E6F2FC", label: "น้อยกว่า 0.5" },
    { max: 1,   color: "#C4DEF5", label: "0.5 – 1" },
    { max: 1.5, color: "#9CC5EC", label: "1 – 1.5" },
    { max: 2,   color: "#6AA6E0", label: "1.5 – 2" },
    { max: 2.5, color: "#3F85CF", label: "2 – 2.5" },
    { max: 3,   color: "#1F5FA8", label: "2.5 – 3" },
    { max: Infinity, color: "#0B3A75", label: "มากกว่า 3" }
  ]
};