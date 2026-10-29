// ตั้งค่าที่เดียว: ตอนสลับเป็นข้อมูลจริง แก้แค่ไฟล์นี้
window.CONFIG = {
  MODE: "mock", // "mock" = ใช้ไฟล์ GeoJSON ในเครื่อง | "geonode" = ดึงอาคารจาก GeoNode ผ่าน WFS (ถ้าตั้งค่าไม่ครบ จะถอยกลับเป็น mock เอง)
  CENTER: [16.7727, 100.123], // จุดเริ่มต้นตอนเปิดเว็บ = บางระกำ หมู่ 15  [ละติจูด, ลองจิจูด]
  ZOOM: 17,

  // ----- โหมด mock -----
  MOCK_URL: "data/buildings_moo15.geojson",

  // ----- จุดน้ำท่วมอื่นๆ (ชั้นแยกจากอาคาร) -----
  // ไฟล์ GeoJSON แบบ Point  ถ้าตั้ง GEONODE.FLOOD_POINTS_LAYER ไว้ จะดึงจาก GeoNode แทนไฟล์นี้  ไม่ใช้ก็ใส่ null
  FLOOD_POINTS_URL: null,

  // ----- GeoNode / GeoServer -----
  // ทุกค่าเว้นว่างได้ (null) ใส่เท่าที่มี ชั้นไหนยังไม่ใส่จะข้ามไปเอง ไม่ต้องแก้โค้ด
  GEONODE: {
    OWS_URL: "https://YOUR-GEONODE-HOST/geoserver/ows", // TODO: URL จริงของ GeoServer (ใส่แล้วชั้น WMS/WFS ด้านล่างจะเริ่มทำงาน)
    BUILDINGS_LAYER: null,   // เช่น "geonode:buildings_moo15"  อาคาร ดึงเป็น WFS (ใช้เมื่อ MODE = "geonode")
    BUILDINGS_CQL: null,     // กรองอาคารฝั่งเซิร์ฟเวอร์ เช่น "moo=15" (ไม่ต้องใช้ก็ปล่อย null)
    FLOOD_WMS_LAYER: null,   // เช่น "geonode:flood_level_moo15"  ชั้นน้ำท่วมแบบภาพ วางทับแผนที่ (ใช้ได้แม้ MODE ยังเป็น "mock")
    WMS_OPACITY: 0.7,        // ความโปร่งใสของชั้น WMS 0–1
    BOUNDARY_LAYER: null,    // เช่น "geonode:boundary_moo15"  ขอบเขตหมู่ 15 ดึงเป็น WFS (ถ้าไม่มีไฟล์ BOUNDARY_URL)
    FLOOD_POINTS_LAYER: null, // เช่น "geonode:flood_points_moo15"  จุดน้ำท่วม (Point) ดึงเป็น WFS
    WATER_LAYER: null        // เช่น "geonode:water_moo15"     แหล่งน้ำ ดึงเป็น WFS (ถ้าไม่มีไฟล์ WATER_URL)
  },

  // ชื่อฟิลด์ในไฟล์อาคาร: แก้ตรงนี้ถ้าไฟล์จริงตั้งชื่อต่างจากนี้ (ไม่ต้องแก้โค้ด)
  FIELDS: {
    id: "bldg_id",         // รหัสอาคาร
    type: "bldg_type",     // ประเภทอาคาร (แสดงในป๊อปอัป)
    flood: "flood_level",  // ความถี่น้ำท่วม = จำนวนครั้ง (ปี) ที่ท่วม จากข้อมูล 15 ปี (ไม่ใช่ความสูงน้ำ)
    years: "flood_years"   // ปีที่ท่วม คั่นด้วยจุลภาค เช่น "2011,2013" (ใช้กดดูรายปี)
  },

  // ชื่อฟิลด์ในไฟล์จุดน้ำท่วม
  POINT_FIELDS: {
    id: "point_id",
    name: "point_name",
    type: "point_type",
    flood: "flood_level"   // ความถี่น้ำท่วม (จำนวนครั้ง) ใช้เลือกสีตาม CLASSES
  },

  // ไฟล์แหล่งน้ำ (แม่น้ำ/บ่อ/คลอง) แบบ Polygon หรือ MultiPolygon พิกัด WGS84
  // ตอนนี้ใช้ข้อมูล OSM ที่แปลงจาก water.shp  ถ้าไม่ใช้ให้ใส่ null
  WATER_URL: "data/water_moo15.geojson",

  // ไฟล์ขอบเขตหมู่ 15 บางระกำ (Polygon/MultiPolygon พิกัด WGS84) เช่น "data/boundary_moo15.geojson"
  // ถ้าใส่ จะวาดเส้นขอบเขตบนแผนที่ และปุ่ม Home จะซูมให้พอดีกับขอบเขตนี้
  BOUNDARY_URL: "data/boundary_moo15.geojson",

  // หน่วยของค่า flood_level: ข้อมูลนี้คือ "ความถี่" (จำนวนครั้งที่ท่วมใน 15 ปี) ไม่ใช่ระดับความสูงน้ำ
  UNIT: "ครั้ง",

  // ช่วงความถี่น้ำท่วมและสี (ค่า v ตกช่วงแรกที่ v < max)  ตรงกับ SLD ที่จะตั้งใน GeoServer
  CLASSES: [
    { max: 1,   color: "#E6F2FC", label: "ไม่เคยท่วม" },
    { max: 2,   color: "#C4DEF5", label: "ท่วม 1 ครั้ง" },
    { max: 3,   color: "#9CC5EC", label: "ท่วม 2 ครั้ง" },
    { max: 4,   color: "#6AA6E0", label: "ท่วม 3 ครั้ง" },
    { max: 5,   color: "#3F85CF", label: "ท่วม 4 ครั้ง" },
    { max: 6,   color: "#1F5FA8", label: "ท่วม 5 ครั้ง" },
    { max: Infinity, color: "#0B3A75", label: "ท่วม 6 ครั้งขึ้นไป" }
  ]
};