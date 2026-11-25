// Mohasorok N1 prototype — world configuration.
// Coordinates are approximate real lat/lon along the Dhaka–Chattogram highway (N1).

export const MAP_SCALE = 1 / 12;        // ETS2-style compressed distances
export const REAL_ROUTE_KM = 245;       // shown to the player (Sayedabad → A.K. Khan)
export const SPEED_LIMIT = 80;          // km/h, highway limit for buses

// size: town length in metres of game road (0 = no town, just a marker)
export const WAYPOINTS = [
  { lat: 23.7215, lon: 90.4255, en: 'Dhaka (Sayedabad)', bn: 'ঢাকা (সায়েদাবাদ)', town: 1300, kind: 'city' },
  { lat: 23.7060, lon: 90.5200, en: 'Kanchpur', bn: 'কাঁচপুর', town: 350, river: { en: 'Shitalakshya', bn: 'শীতলক্ষ্যা', width: 110, offset: 260 } },
  { lat: 23.6560, lon: 90.6040, en: 'Mograpara (Sonargaon)', bn: 'মোগরাপাড়া', town: 350 },
  { lat: 23.6020, lon: 90.6180, en: 'Meghna Bridge', bn: 'মেঘনা সেতু', town: 0, river: { en: 'Meghna', bn: 'মেঘনা', width: 240, offset: 0 } },
  { lat: 23.5600, lon: 90.6450, en: 'Gazaria', bn: 'গজারিয়া', town: 200, toll: true },
  { lat: 23.5300, lon: 90.7050, en: 'Daudkandi', bn: 'দাউদকান্দি', town: 300, river: { en: 'Gumti', bn: 'গোমতী', width: 150, offset: -200 } },
  { lat: 23.4870, lon: 90.9970, en: 'Chandina', bn: 'চান্দিনা', town: 350 },
  { lat: 23.4300, lon: 91.1450, en: 'Cumilla', bn: 'কুমিল্লা', town: 900, kind: 'city', rest: true },
  { lat: 23.2200, lon: 91.3100, en: 'Chauddagram', bn: 'চৌদ্দগ্রাম', town: 350 },
  { lat: 23.0200, lon: 91.4050, en: 'Feni (Mohipal)', bn: 'ফেনী (মহিপাল)', town: 700, kind: 'city' },
  { lat: 22.8800, lon: 91.5000, en: 'Feni River', bn: 'ফেনী নদী', town: 0, river: { en: 'Feni', bn: 'ফেনী', width: 90, offset: 0 } },
  { lat: 22.7700, lon: 91.5700, en: 'Mirsharai', bn: 'মীরসরাই', town: 350, hills: true },
  { lat: 22.6200, lon: 91.6600, en: 'Sitakunda', bn: 'সীতাকুণ্ড', town: 450, hills: true, sea: true },
  { lat: 22.4800, lon: 91.7300, en: 'Kumira', bn: 'কুমিরা', town: 250, hills: true, sea: true },
  { lat: 22.3700, lon: 91.7900, en: 'Chattogram (A.K. Khan)', bn: 'চট্টগ্রাম (এ.কে. খান)', town: 1300, kind: 'city', hills: true },
];

// Road cross-section (metres). d < 0 is LEFT of travel direction (Bangladesh drives on the left).
export const ROAD = {
  median: 1.6,        // half-width of the median (curb to centre)
  lane: 3.6,
  lanes: 2,
  shoulder: 2.0,
  embank: 6.5,        // horizontal run of the side slope
  baseHeight: 1.3,    // road raised above the paddy
  bridgeHeight: 7.5,
  rampLen: 150,
};
ROAD.edge = ROAD.median + ROAD.lane * ROAD.lanes;   // outer edge line
ROAD.half = ROAD.edge + ROAD.shoulder;              // asphalt edge
ROAD.toe = ROAD.half + ROAD.embank;                 // bottom of embankment
// lane centre offsets for traffic heading TO Chattogram (forward). Oncoming = positive mirror.
ROAD.laneCenters = [-(ROAD.median + ROAD.lane * 1.5), -(ROAD.median + ROAD.lane * 0.5)]; // [slow(left), fast(right)]

// Toll plaza: the road fans out to a wide concrete apron with a row of booths for ~200 m
// (40 m full width either side of the booths, 60 m tapers), so queues spread over many lanes.
export const PLAZA = { booths: 5, laneW: 3.6, islandW: 1.4, flat: 40, taper: 60, apron: 1.0, islandLen: 22 };
PLAZA.pitch = PLAZA.laneW + PLAZA.islandW;
PLAZA.laneC = (i) => ROAD.median + PLAZA.laneW / 2 + i * PLAZA.pitch;              // booth lane centre |d|, 0 = by the median
PLAZA.islandC = (i) => ROAD.median + PLAZA.laneW + PLAZA.islandW / 2 + i * PLAZA.pitch;  // island to the outside of lane i
PLAZA.half = PLAZA.islandC(PLAZA.booths - 1) + PLAZA.islandW / 2 + PLAZA.apron;  // paved half-width at the booths
PLAZA.reach = PLAZA.flat + PLAZA.taper;

export const CHUNK = 500;          // scenery chunk length (m of road)
export const VIEW_CHUNKS = 5;      // chunks visible ahead/behind

export const QUALITY = {
  // touchPR: phones/tablets have small, very dense screens, so they need more pixels to look sharp
  high:   { pixelRatio: 1.5, touchPR: 2.0, shadow: 4096, shadowArea: 90,  treeDensity: 1.0 },
  medium: { pixelRatio: 1.0, touchPR: 1.5, shadow: 2048, shadowArea: 70,  treeDensity: 0.7 },
  low:    { pixelRatio: 0.8, touchPR: 1.0, shadow: 1024, shadowArea: 60,  treeDensity: 0.45 },
};

// ---- road facilities ----
export const TOLL_FEE = 465;          // ৳ for a bus at the Meghna–Gumti toll plaza
export const DIESEL_PRICE = 114;      // ৳ per litre
export const TANK_LITRES = 300;
export const START_FUEL = 0.32;       // fraction of the tank at the start of a trip
export const BUS_KM_PER_LITRE = 3.4;
// fuel stations: s as a fraction of the route, side -1 = towards Chattogram (left), +1 = towards Dhaka
// roadside rest stops with a highway restaurant (buses stop ~20 min); side -1 = towards Chattogram
export const REST_STOPS = [
  { f: 0.455, side: -1, bn: 'হাইওয়ে ইন রেস্তোরাঁ', en: 'Highway Inn Restaurant', col: '#b71c1c' },
  { f: 0.47, side: 1, bn: 'যাত্রা বিরতি হোটেল', en: 'Jatra Biroti Hotel', col: '#1b5e20' },
  { f: 0.665, side: -1, bn: 'মীরসরাই ফুড ভিলেজ', en: 'Mirsharai Food Village', col: '#e65100' },
  { f: 0.68, side: 1, bn: 'সবুজ বাংলা রেস্তোরাঁ', en: 'Sobuj Bangla Restaurant', col: '#004d40' },
];
export const REST_MINUTES = 20;

export const FUEL_STATIONS = [
  { f: 0.085, side: -1, bn: 'কাঁচপুর ফিলিং স্টেশন', en: 'Kanchpur Filling Station' },
  { f: 0.26, side: 1, bn: 'দাউদকান্দি ফিলিং স্টেশন', en: 'Daudkandi Filling Station' },
  { f: 0.36, side: -1, bn: 'মেঘনা ফিলিং স্টেশন', en: 'Meghna Filling Station' },
  { f: 0.43, side: 1, bn: 'কুমিল্লা পেট্রোল পাম্প', en: 'Cumilla Petrol Pump' },
  { f: 0.6, side: -1, bn: 'ফেনী ফিলিং স্টেশন', en: 'Feni Filling Station' },
  { f: 0.73, side: 1, bn: 'মীরসরাই ফিলিং স্টেশন', en: 'Mirsharai Filling Station' },
  { f: 0.82, side: -1, bn: 'সীতাকুণ্ড ফিলিং স্টেশন', en: 'Sitakunda Filling Station' },
];
export const UTURN_SPACING = 2300;    // m of game road between median openings
export const UTURN_GAP = 36;          // length of a median opening

// ---- passengers: roadside bus counters and fares ----
// towns (WAYPOINTS en names) with a bus counter on both carriageways
export const BUS_STOPS = ['Kanchpur', 'Mograpara (Sonargaon)', 'Daudkandi', 'Chandina', 'Cumilla', 'Feni (Mohipal)', 'Mirsharai', 'Sitakunda'];
export const FARE_PER_KM = 2.2;       // ৳ per real km, non-AC intercity (AC buses charge AC_FARE_FACTOR more)
export const AC_FARE_FACTOR = 1.6;
export const MIN_FARE = 60;           // ৳, shortest hop
