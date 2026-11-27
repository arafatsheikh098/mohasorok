// The Bangladesh road network the game is built from: all 64 zilla towns and the national / regional
// highways between them.
//
// NODES: zilla towns and junctions (lat/lon, Bangla + English names). `zilla` marks a district headquarters;
//   `term` gives it a bus terminal (a short access road to a walled terminal yard is added automatically,
//   see src/net.js). `town` = length of the built-up stretch in metres of game road; `kind: 'city'` = big city.
// ROADS: a road between two nodes through via points (towns, river bridges, toll plazas). lanes: 6 (expressway,
//   three each way, a concrete median barrier and service roads), 4 (divided) or 2 (one lane each way).
//   expressway: true marks an access-controlled expressway; elevated: { from, to } (fractions of the road) a
//   flyover / elevated expressway on pillars. km (optional): real length; otherwise worked out from the map.
//   Features (fuel stations, rest stops, police) are in real km from the `from` node; side -1 = the left
//   carriageway going from → to (Bangladesh drives on the left). Roads without them get some automatically.
//
// Coordinates, highway numbers, terminal names and toll fees are approximate: a game map, not for navigation.
import { TOLL_FEE } from '../config.js';

// ---------------------------------------------------------------- helpers
const DIV = {
  dhaka: ['ঢাকা', 'Dhaka'], ctg: ['চট্টগ্রাম', 'Chattogram'], raj: ['রাজশাহী', 'Rajshahi'], khu: ['খুলনা', 'Khulna'],
  bar: ['বরিশাল', 'Barishal'], syl: ['সিলেট', 'Sylhet'], rang: ['রংপুর', 'Rangpur'], mym: ['ময়মনসিংহ', 'Mymensingh'],
};
export const DIVISIONS = DIV;
// a zilla headquarters town: id, lat, lon, English, Bangla, division, [terminal bn, terminal en], extra
const Z = (lat, lon, en, bn, div, term, o = {}) => ({ lat, lon, en, bn, div, zilla: o.zilla || en, town: o.town || 600, kind: o.kind, term: term || true, ...o });
const J = (lat, lon, en, bn, o = {}) => ({ lat, lon, en, bn, town: o.town ?? 0, ...o });
const river = (en, bn, width, offset = 0) => ({ river: { en, bn, width, offset } });
const toll = (fee, bn, en) => ({ toll: { fee, bn, en } });
const v = (lat, lon, en, bn, o = {}) => ({ lat, lon, en, bn, town: 250, ...o });

export const NODES = {
  // ---------- Dhaka: three terminals on the city's edges, joined by city roads
  sayedabad: Z(23.7215, 90.4255, 'Dhaka (Sayedabad)', 'ঢাকা (সায়েদাবাদ)', 'dhaka', ['সায়েদাবাদ বাস টার্মিনাল', 'Sayedabad Bus Terminal'], { zilla: 'Dhaka', town: 1300, kind: 'city' }),
  mohakhali: Z(23.7785, 90.4005, 'Dhaka (Mohakhali)', 'ঢাকা (মহাখালী)', 'dhaka', ['মহাখালী বাস টার্মিনাল', 'Mohakhali Bus Terminal'], { zilla: 'Dhaka', town: 1300, kind: 'city', termDir: 325 }),
  gabtoli: Z(23.7850, 90.3450, 'Dhaka (Gabtoli)', 'ঢাকা (গাবতলী)', 'dhaka', ['গাবতলী বাস টার্মিনাল', 'Gabtoli Bus Terminal'], { zilla: 'Dhaka', town: 1300, kind: 'city' }),
  // ---------- Dhaka division
  gazipur: Z(23.9990, 90.4200, 'Gazipur', 'গাজীপুর', 'dhaka', ['গাজীপুর চৌরাস্তা বাস টার্মিনাল', 'Gazipur Chowrasta Bus Terminal'], { town: 900, kind: 'city' }),
  narayanganj: Z(23.6230, 90.4990, 'Narayanganj', 'নারায়ণগঞ্জ', 'dhaka', ['চাষাড়া বাস টার্মিনাল', 'Chashara Bus Terminal'], { town: 800, kind: 'city' }),
  narsingdi: Z(23.9220, 90.7180, 'Narsingdi', 'নরসিংদী', 'dhaka'),
  manikganj: Z(23.8620, 90.0000, 'Manikganj', 'মানিকগঞ্জ', 'dhaka'),
  munshiganj: Z(23.5430, 90.5300, 'Munshiganj', 'মুন্সীগঞ্জ', 'dhaka'),
  tangail: Z(24.2510, 89.9170, 'Tangail', 'টাঙ্গাইল', 'dhaka'),
  kishoreganj: Z(24.4400, 90.7800, 'Kishoreganj', 'কিশোরগঞ্জ', 'dhaka'),
  faridpur: Z(23.6070, 89.8420, 'Faridpur', 'ফরিদপুর', 'dhaka'),
  rajbari: Z(23.7570, 89.6440, 'Rajbari', 'রাজবাড়ী', 'dhaka'),
  madaripur: Z(23.1720, 90.2050, 'Madaripur', 'মাদারীপুর', 'dhaka'),
  shariatpur: Z(23.2070, 90.3500, 'Shariatpur', 'শরীয়তপুর', 'dhaka'),
  gopalganj: Z(23.0050, 89.8270, 'Gopalganj', 'গোপালগঞ্জ', 'dhaka'),
  // ---------- Mymensingh division
  mymensingh: Z(24.7470, 90.4100, 'Mymensingh', 'ময়মনসিংহ', 'mym', ['মাসকান্দা বাস টার্মিনাল', 'Maskanda Bus Terminal'], { town: 1000, kind: 'city' }),
  jamalpur: Z(24.9200, 89.9450, 'Jamalpur', 'জামালপুর', 'mym'),
  sherpur: Z(25.0200, 90.0170, 'Sherpur', 'শেরপুর', 'mym'),
  netrokona: Z(24.8800, 90.7300, 'Netrokona', 'নেত্রকোনা', 'mym'),
  // ---------- Chattogram division
  akkhan: Z(22.3700, 91.7900, 'Chattogram (A.K. Khan)', 'চট্টগ্রাম (এ.কে. খান)', 'ctg', ['এ. কে. খান বাস টার্মিনাল', 'A.K. Khan Bus Terminal'], { zilla: 'Chattogram', town: 1300, kind: 'city', hills: true }),
  bahaddarhat: Z(22.3600, 91.8450, 'Chattogram (Bahaddarhat)', 'চট্টগ্রাম (বহদ্দারহাট)', 'ctg', ['বহদ্দারহাট বাস টার্মিনাল', 'Bahaddarhat Bus Terminal'], { zilla: 'Chattogram', town: 1300, kind: 'city', hills: true }),
  oxygen: J(22.3950, 91.8200, 'Oxygen (Chattogram)', 'অক্সিজেন (চট্টগ্রাম)', { town: 900, kind: 'city', hills: true }),
  coxsbazar: Z(21.4380, 92.0050, "Cox's Bazar", 'কক্সবাজার', 'ctg', ['কক্সবাজার কেন্দ্রীয় বাস টার্মিনাল', "Cox's Bazar Bus Terminal"], { town: 900, kind: 'city', hills: true, sea: true }),
  teknaf: Z(20.8630, 92.3010, 'Teknaf', 'টেকনাফ', 'ctg', ['টেকনাফ বাস টার্মিনাল', 'Teknaf Bus Terminal'], { extra: "Cox's Bazar", town: 450, hills: true, sea: true }),
  rangamati: Z(22.6530, 92.1750, 'Rangamati', 'রাঙ্গামাটি', 'ctg', null, { hills: true }),
  bandarban: Z(22.1950, 92.2180, 'Bandarban', 'বান্দরবান', 'ctg', null, { hills: true }),
  khagrachhari: Z(23.1190, 91.9840, 'Khagrachhari', 'খাগড়াছড়ি', 'ctg', null, { hills: true }),
  feni: Z(23.0200, 91.4050, 'Feni (Mohipal)', 'ফেনী (মহিপাল)', 'ctg', ['মহিপাল বাস টার্মিনাল', 'Mohipal Bus Terminal'], { zilla: 'Feni', town: 700, kind: 'city' }),
  noakhali: Z(22.8690, 91.0990, 'Noakhali (Maijdee)', 'নোয়াখালী (মাইজদী)', 'ctg', null, { zilla: 'Noakhali' }),
  lakshmipur: Z(22.9430, 90.8410, 'Lakshmipur', 'লক্ষ্মীপুর', 'ctg'),
  chandpur: Z(23.2330, 90.6710, 'Chandpur', 'চাঁদপুর', 'ctg'),
  cumilla: Z(23.4300, 91.1450, 'Cumilla', 'কুমিল্লা', 'ctg', ['শাসনগাছা বাস টার্মিনাল', 'Shashongacha Bus Terminal'], { town: 900, kind: 'city' }),
  brahmanbaria: Z(23.9570, 91.1110, 'Brahmanbaria', 'ব্রাহ্মণবাড়িয়া', 'ctg'),
  // ---------- Sylhet division
  sylhet: Z(24.8950, 91.8700, 'Sylhet', 'সিলেট', 'syl', ['কদমতলী বাস টার্মিনাল', 'Kadamtali Bus Terminal'], { town: 1100, kind: 'city', hills: true }),
  moulvibazar: Z(24.4830, 91.7770, 'Moulvibazar', 'মৌলভীবাজার', 'syl', null, { hills: true }),
  habiganj: Z(24.3750, 91.4150, 'Habiganj', 'হবিগঞ্জ', 'syl'),
  sunamganj: Z(25.0660, 91.3990, 'Sunamganj', 'সুনামগঞ্জ', 'syl'),
  // ---------- Rajshahi division
  rajshahi: Z(24.3740, 88.6010, 'Rajshahi', 'রাজশাহী', 'raj', ['শিরোইল বাস টার্মিনাল', 'Shiroil Bus Terminal'], { town: 1100, kind: 'city' }),
  natore: Z(24.4200, 89.0000, 'Natore', 'নাটোর', 'raj'),
  naogaon: Z(24.8000, 88.9400, 'Naogaon', 'নওগাঁ', 'raj'),
  chapainawabganj: Z(24.5960, 88.2770, 'Chapai Nawabganj', 'চাঁপাইনবাবগঞ্জ', 'raj'),
  pabna: Z(24.0060, 89.2370, 'Pabna', 'পাবনা', 'raj'),
  sirajganj: Z(24.4530, 89.7000, 'Sirajganj', 'সিরাজগঞ্জ', 'raj'),
  bogura: Z(24.8470, 89.3730, 'Bogura', 'বগুড়া', 'raj', ['চারমাথা বাস টার্মিনাল', 'Charmatha Bus Terminal'], { town: 900, kind: 'city' }),
  joypurhat: Z(25.1020, 89.0230, 'Joypurhat', 'জয়পুরহাট', 'raj'),
  // ---------- Rangpur division
  rangpur: Z(25.7460, 89.2500, 'Rangpur', 'রংপুর', 'rang', ['রংপুর কেন্দ্রীয় বাস টার্মিনাল', 'Rangpur Central Bus Terminal'], { town: 1000, kind: 'city' }),
  dinajpur: Z(25.6280, 88.6370, 'Dinajpur', 'দিনাজপুর', 'rang'),
  thakurgaon: Z(26.0330, 88.4610, 'Thakurgaon', 'ঠাকুরগাঁও', 'rang'),
  panchagarh: Z(26.3410, 88.5540, 'Panchagarh', 'পঞ্চগড়', 'rang'),
  nilphamari: Z(25.9310, 88.8560, 'Nilphamari', 'নীলফামারী', 'rang'),
  lalmonirhat: Z(25.9170, 89.4450, 'Lalmonirhat', 'লালমনিরহাট', 'rang'),
  kurigram: Z(25.8070, 89.6360, 'Kurigram', 'কুড়িগ্রাম', 'rang'),
  gaibandha: Z(25.3290, 89.5280, 'Gaibandha', 'গাইবান্ধা', 'rang'),
  // ---------- Khulna division
  khulna: Z(22.8160, 89.5480, 'Khulna', 'খুলনা', 'khu', ['সোনাডাঙ্গা বাস টার্মিনাল', 'Sonadanga Bus Terminal'], { town: 1100, kind: 'city' }),
  jashore: Z(23.1660, 89.2080, 'Jashore', 'যশোর', 'khu', null, { town: 800, kind: 'city' }),
  benapole: Z(23.0420, 88.8960, 'Benapole', 'বেনাপোল', 'khu', ['বেনাপোল বাস টার্মিনাল', 'Benapole Bus Terminal'], { extra: 'Jashore', town: 450 }),
  satkhira: Z(22.7180, 89.0710, 'Satkhira', 'সাতক্ষীরা', 'khu'),
  bagerhat: Z(22.6510, 89.7850, 'Bagerhat', 'বাগেরহাট', 'khu'),
  narail: Z(23.1720, 89.5120, 'Narail', 'নড়াইল', 'khu'),
  magura: Z(23.4870, 89.4200, 'Magura', 'মাগুরা', 'khu'),
  jhenaidah: Z(23.5440, 89.1530, 'Jhenaidah', 'ঝিনাইদহ', 'khu'),
  kushtia: Z(23.9010, 89.1200, 'Kushtia', 'কুষ্টিয়া', 'khu'),
  chuadanga: Z(23.6400, 88.8410, 'Chuadanga', 'চুয়াডাঙ্গা', 'khu'),
  meherpur: Z(23.7620, 88.6320, 'Meherpur', 'মেহেরপুর', 'khu'),
  // ---------- Barishal division
  barishal: Z(22.7010, 90.3530, 'Barishal', 'বরিশাল', 'bar', ['নথুল্লাবাদ বাস টার্মিনাল', 'Nathullabad Bus Terminal'], { town: 1000, kind: 'city' }),
  patuakhali: Z(22.3590, 90.3290, 'Patuakhali', 'পটুয়াখালী', 'bar'),
  barguna: Z(22.1590, 90.1260, 'Barguna', 'বরগুনা', 'bar'),
  kuakata: Z(21.8170, 90.1200, 'Kuakata', 'কুয়াকাটা', 'bar', ['কুয়াকাটা বাস টার্মিনাল', 'Kuakata Bus Terminal'], { extra: 'Patuakhali', town: 450, sea: true }),
  jhalokathi: Z(22.6410, 90.1980, 'Jhalokathi', 'ঝালকাঠি', 'bar'),
  pirojpur: Z(22.5790, 89.9750, 'Pirojpur', 'পিরোজপুর', 'bar'),
  bhola: Z(22.6860, 90.6480, 'Bhola', 'ভোলা', 'bar'),
  // ---------- junctions (মোড়) and ferry ghats
  kanchpur: J(23.7060, 90.5200, 'Kanchpur', 'কাঁচপুর', { town: 350 }),
  kuril: J(23.8220, 90.4200, 'Kuril', 'কুড়িল', { town: 600, kind: 'city' }),
  kanchan: J(23.8000, 90.5550, 'Kanchan', 'কাঞ্চন', { town: 250 }),
  bhulta: J(23.7850, 90.5830, 'Bhulta', 'ভুলতা', { town: 300 }),
  daudkandi: J(23.5300, 90.7050, 'Daudkandi', 'দাউদকান্দি', { town: 300 }),
  baraiyarhat: J(22.8350, 91.5350, 'Baraiyarhat', 'বারইয়ারহাট', { town: 250 }),
  bhairab: J(24.0520, 90.9770, 'Bhairab', 'ভৈরব', { town: 450 }),
  biswaroad: J(24.0350, 91.1300, 'Biswaroad (Sarail)', 'বিশ্বরোড (সরাইল)', { town: 250 }),
  shaistaganj: J(24.2800, 91.4550, 'Shaistaganj', 'শায়েস্তাগঞ্জ', { town: 300 }),
  sherpur_syl: J(24.6280, 91.6800, 'Sherpur (Moulvibazar)', 'শেরপুর (মৌলভীবাজার)', { town: 200 }),
  nabinagar: J(23.9200, 90.2550, 'Nabinagar (Savar)', 'নবীনগর (সাভার)', { town: 400 }),
  chandra: J(24.0330, 90.2400, 'Chandra', 'চন্দ্রা', { town: 300 }),
  jamuna_west: J(24.4000, 89.6800, 'Jamuna Bridge West', 'যমুনা সেতু পশ্চিম', { town: 0 }),
  hatikumrul: J(24.4300, 89.5550, 'Hatikumrul', 'হাটিকুমরুল', { town: 250 }),
  bonpara: J(24.2900, 89.1300, 'Bonpara', 'বনপাড়া', { town: 250 }),
  gobindaganj: J(25.1330, 89.3800, 'Gobindaganj', 'গোবিন্দগঞ্জ', { town: 250 }),
  saidpur: J(25.7800, 88.9000, 'Saidpur', 'সৈয়দপুর', { town: 450 }),
  paturia: J(23.8150, 89.8300, 'Paturia Ghat', 'পাটুরিয়া ঘাট', { town: 200, ghat: true }),
  daulatdia: J(23.7800, 89.7700, 'Daulatdia Ghat', 'দৌলতদিয়া ঘাট', { town: 200, ghat: true }),
  bhanga: J(23.3880, 89.9850, 'Bhanga', 'ভাঙ্গা', { town: 300 }),
  janjira: J(23.3150, 90.3050, 'Janjira', 'জাজিরা', { town: 150 }),
  chowmuhani: J(22.9400, 91.1000, 'Chowmuhani', 'চৌমুহনী', { town: 350 }),
  fakirhat: J(22.7800, 89.7100, 'Fakirhat', 'ফকিরহাট', { town: 200 }),
  keranihat: J(22.1450, 92.0500, 'Keranihat', 'কেরানীহাট', { town: 250, hills: true }),
  laharhat: J(22.7400, 90.4700, 'Laharhat Ghat', 'লাহারহাট ঘাট', { town: 150, ghat: true }),
  veduria: J(22.7000, 90.5850, 'Veduria Ghat', 'ভেদুরিয়া ঘাট', { town: 150, ghat: true }),
  amtali: J(22.2700, 90.2300, 'Amtali', 'আমতলী', { town: 250 }),
};

// ---------------------------------------------------------------- roads
// [id, ref, lanes, from, to, [via...], extra]
const R = (id, ref, lanes, from, to, via = [], o = {}) => ({ id, ref, lanes, from, to, via, ...o });
const N1 = 'Dhaka–Chattogram Highway', N1bn = 'ঢাকা–চট্টগ্রাম মহাসড়ক';

export const ROADS = [
  // ---------- N1 Dhaka – Chattogram (4 lanes) – the original route, unchanged towns
  R('n1a', 'N1', 4, 'sayedabad', 'kanchpur', [v(23.712, 90.470, 'Signboard', 'সাইনবোর্ড', { town: 300 })], { en: N1, bn: N1bn }),
  R('n1b', 'N1', 4, 'kanchpur', 'daudkandi', [
    v(23.700, 90.546, 'Shitalakshya Bridge', 'শীতলক্ষ্যা সেতু', { town: 0, ...river('Shitalakshya', 'শীতলক্ষ্যা', 110) }),
    v(23.656, 90.604, 'Mograpara (Sonargaon)', 'মোগরাপাড়া', { town: 350 }),
    v(23.602, 90.618, 'Meghna Bridge', 'মেঘনা সেতু', { town: 0, ...river('Meghna', 'মেঘনা', 240) }),
    v(23.560, 90.645, 'Gazaria', 'গজারিয়া', { town: 200, ...toll(TOLL_FEE, 'মেঘনা–গোমতী সেতু টোল প্লাজা', 'Meghna–Gumti Bridge Toll Plaza') }),
    v(23.538, 90.684, 'Gumti Bridge', 'গোমতী সেতু', { town: 0, ...river('Gumti', 'গোমতী', 150) }),
  ], { en: N1, bn: N1bn, police: [{ km: 8, en: 'Meghna approach' }] }),
  R('n1c', 'N1', 4, 'daudkandi', 'cumilla', [v(23.487, 90.997, 'Chandina', 'চান্দিনা', { town: 350 })], { en: N1, bn: N1bn }),
  R('n1d', 'N1', 4, 'cumilla', 'feni', [v(23.220, 91.310, 'Chauddagram', 'চৌদ্দগ্রাম', { town: 350 })], {
    en: N1, bn: N1bn, police: [{ km: 9, en: 'Cumilla bypass' }],
    rest: [{ km: 14, side: -1, bn: 'হাইওয়ে ইন রেস্তোরাঁ', en: 'Highway Inn Restaurant', col: '#b71c1c' },
      { km: 17, side: 1, bn: 'যাত্রা বিরতি হোটেল', en: 'Jatra Biroti Hotel', col: '#1b5e20' }],
  }),
  R('n1e', 'N1', 4, 'feni', 'baraiyarhat', [v(22.880, 91.500, 'Feni River', 'ফেনী নদী', { town: 0, ...river('Feni', 'ফেনী', 90) })], { en: N1, bn: N1bn }),
  R('n1f', 'N1', 4, 'baraiyarhat', 'akkhan', [
    v(22.770, 91.570, 'Mirsharai', 'মীরসরাই', { town: 350, hills: true }),
    v(22.620, 91.660, 'Sitakunda', 'সীতাকুণ্ড', { town: 450, hills: true, sea: true }),
    v(22.480, 91.730, 'Kumira', 'কুমিরা', { town: 250, hills: true, sea: true }),
  ], {
    en: N1, bn: N1bn, police: [{ km: 50, en: 'Sitakunda' }],
    rest: [{ km: 8, side: -1, bn: 'মীরসরাই ফুড ভিলেজ', en: 'Mirsharai Food Village', col: '#e65100' },
      { km: 11, side: 1, bn: 'সবুজ বাংলা রেস্তোরাঁ', en: 'Sobuj Bangla Restaurant', col: '#004d40' }],
  }),
  // ---------- Chattogram city, Cox's Bazar, Teknaf, the hill districts
  R('ctg1', 'CTG', 4, 'akkhan', 'oxygen', [], { en: 'Chattogram City Road', bn: 'চট্টগ্রাম শহর সড়ক', km: 7 }),
  R('ctg2', 'CTG', 4, 'oxygen', 'bahaddarhat', [], { en: 'Chattogram City Road', bn: 'চট্টগ্রাম শহর সড়ক', km: 5 }),
  R('n1g', 'N1', 2, 'bahaddarhat', 'keranihat', [
    v(22.330, 91.850, 'Shah Amanat Bridge', 'শাহ আমানত সেতু', { town: 0, ...river('Karnaphuli', 'কর্ণফুলী', 120), ...toll(75, 'শাহ আমানত সেতু টোল', 'Shah Amanat Bridge Toll') }),
    v(22.290, 91.980, 'Patiya', 'পটিয়া', { town: 350, hills: true }),
  ], { en: 'Chattogram–Cox\'s Bazar Highway', bn: 'চট্টগ্রাম–কক্সবাজার মহাসড়ক' }),
  R('n1h', 'N1', 2, 'keranihat', 'coxsbazar', [
    v(21.990, 92.060, 'Lohagara', 'লোহাগাড়া', { town: 250, hills: true }),
    v(21.770, 92.080, 'Chakaria', 'চকরিয়া', { town: 350, hills: true, ...river('Matamuhuri', 'মাতামুহুরী', 70) }),
    v(21.590, 92.030, 'Ramu', 'রামু', { town: 250, hills: true }),
  ], { en: 'Chattogram–Cox\'s Bazar Highway', bn: 'চট্টগ্রাম–কক্সবাজার মহাসড়ক', rest: [{ km: 30, side: -1, bn: 'চকরিয়া হাইওয়ে রেস্তোরাঁ', en: 'Chakaria Highway Restaurant', col: '#6a1b9a' }] }),
  R('marine', 'R170', 2, 'coxsbazar', 'teknaf', [
    v(21.280, 92.040, 'Inani', 'ইনানী', { town: 200, sea: true, hills: true }),
    v(21.050, 92.180, 'Shamlapur', 'শামলাপুর', { town: 200, sea: true, hills: true }),
  ], { en: 'Marine Drive', bn: 'মেরিন ড্রাইভ' }),
  R('bandar', 'R', 2, 'keranihat', 'bandarban', [], { en: 'Keranihat–Bandarban Road', bn: 'কেরানীহাট–বান্দরবান সড়ক', hills: true }),
  R('rangam', 'N106', 2, 'oxygen', 'rangamati', [v(22.540, 91.930, 'Raozan', 'রাউজান', { town: 300, hills: true }), v(22.600, 92.060, 'Ghagra', 'ঘাগড়া', { town: 150, hills: true })], { en: 'Chattogram–Rangamati Highway', bn: 'চট্টগ্রাম–রাঙ্গামাটি মহাসড়ক' }),
  R('khagra', 'R', 2, 'baraiyarhat', 'khagrachhari', [v(22.990, 91.720, 'Ramgarh', 'রামগড়', { town: 250, hills: true }), v(23.050, 91.870, 'Manikchhari', 'মানিকছড়ি', { town: 200, hills: true })], { en: 'Baraiyarhat–Khagrachhari Road', bn: 'বারইয়ারহাট–খাগড়াছড়ি সড়ক' }),
  // ---------- Noakhali, Lakshmipur, Chandpur
  R('noakh', 'N104', 2, 'feni', 'chowmuhani', [v(22.950, 91.230, 'Senbagh', 'সেনবাগ', { town: 200 })], { en: 'Feni–Noakhali Highway', bn: 'ফেনী–নোয়াখালী মহাসড়ক' }),
  R('noakh2', 'N104', 2, 'chowmuhani', 'noakhali', [], { en: 'Feni–Noakhali Highway', bn: 'ফেনী–নোয়াখালী মহাসড়ক', km: 9 }),
  R('lakhno', 'R', 2, 'chowmuhani', 'lakshmipur', [v(22.940, 90.980, 'Begumganj', 'বেগমগঞ্জ', { town: 200 })], { en: 'Chowmuhani–Lakshmipur Road', bn: 'চৌমুহনী–লক্ষ্মীপুর সড়ক' }),
  R('chandp', 'R', 2, 'daudkandi', 'chandpur', [v(23.430, 90.690, 'Gouripur', 'গৌরীপুর', { town: 250 }), v(23.350, 90.710, 'Matlab', 'মতলব', { town: 250 })], { en: 'Daudkandi–Chandpur Road', bn: 'দাউদকান্দি–চাঁদপুর সড়ক' }),
  R('lakhch', 'R', 2, 'chandpur', 'lakshmipur', [v(23.040, 90.770, 'Raipur', 'রায়পুর', { town: 250 })], { en: 'Chandpur–Lakshmipur Road', bn: 'চাঁদপুর–লক্ষ্মীপুর সড়ক' }),
  // ---------- N2 Dhaka – Sylhet, Brahmanbaria, Kishoreganj, Sunamganj
  R('n2a', 'N2', 4, 'kanchpur', 'bhulta', [], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('n2a2', 'N2', 4, 'bhulta', 'narsingdi', [v(23.850, 90.640, 'Panchdona', 'পাঁচদোনা', { town: 200 })], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('n2b', 'N2', 2, 'narsingdi', 'bhairab', [v(23.990, 90.850, 'Raipura', 'রায়পুরা', { town: 200 })], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('n2c', 'N2', 2, 'bhairab', 'biswaroad', [
    v(24.045, 91.000, 'Bhairab Bridge', 'ভৈরব সেতু', { town: 0, ...river('Meghna', 'মেঘনা', 120), ...toll(145, 'সৈয়দ নজরুল ইসলাম সেতু টোল', 'Bhairab Bridge Toll') }),
    v(24.040, 91.040, 'Ashuganj', 'আশুগঞ্জ', { town: 300 }),
  ], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('n2d', 'N2', 2, 'biswaroad', 'shaistaganj', [v(24.110, 91.290, 'Madhabpur', 'মাধবপুর', { town: 250 })], {
    en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক', rest: [{ km: 12, side: -1, bn: 'উজান ভাটি রেস্তোরাঁ', en: 'Ujan Bhati Restaurant', col: '#1565c0' }] }),
  R('n2e', 'N2', 2, 'shaistaganj', 'sherpur_syl', [v(24.450, 91.560, 'Bahubal', 'বাহুবল', { town: 200, hills: true })], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('n2f', 'N2', 2, 'sherpur_syl', 'sylhet', [
    v(24.660, 91.700, 'Kushiyara Bridge', 'কুশিয়ারা সেতু', { town: 0, ...river('Kushiyara', 'কুশিয়ারা', 90) }),
    v(24.790, 91.740, 'Goalabazar', 'গোয়ালাবাজার', { town: 250 }),
  ], { en: 'Dhaka–Sylhet Highway', bn: 'ঢাকা–সিলেট মহাসড়ক' }),
  R('sunam', 'R', 2, 'sylhet', 'sunamganj', [v(25.000, 91.640, 'Gobindaganj (Chhatak)', 'গোবিন্দগঞ্জ (ছাতক)', { town: 200 })], { en: 'Sylhet–Sunamganj Road', bn: 'সিলেট–সুনামগঞ্জ সড়ক' }),
  R('moulvi', 'R', 2, 'sherpur_syl', 'moulvibazar', [], { en: 'Sherpur–Moulvibazar Road', bn: 'শেরপুর–মৌলভীবাজার সড়ক', hills: true }),
  R('habig', 'R', 2, 'shaistaganj', 'habiganj', [], { en: 'Shaistaganj–Habiganj Road', bn: 'শায়েস্তাগঞ্জ–হবিগঞ্জ সড়ক' }),
  R('bbaria', 'N102', 2, 'biswaroad', 'brahmanbaria', [], { en: 'Cumilla–Sylhet Highway', bn: 'কুমিল্লা–সিলেট মহাসড়ক' }),
  R('cumbb', 'N102', 2, 'cumilla', 'brahmanbaria', [v(23.640, 91.140, 'Kasba', 'কসবা', { town: 200 })], { en: 'Cumilla–Sylhet Highway', bn: 'কুমিল্লা–সিলেট মহাসড়ক' }),
  R('kishor', 'R', 2, 'bhairab', 'kishoreganj', [v(24.250, 90.880, 'Kuliarchar', 'কুলিয়ারচর', { town: 200 })], { en: 'Bhairab–Kishoreganj Road', bn: 'ভৈরব–কিশোরগঞ্জ সড়ক' }),
  R('kishmy', 'R', 2, 'kishoreganj', 'mymensingh', [v(24.560, 90.650, 'Nandail', 'নান্দাইল', { town: 200 })], { en: 'Kishoreganj–Mymensingh Road', bn: 'কিশোরগঞ্জ–ময়মনসিংহ সড়ক' }),
  // ---------- Dhaka city links, Narayanganj, Munshiganj
  R('dcity1', 'DHK', 4, 'sayedabad', 'mohakhali', [
    v(23.7235, 90.4115, 'Gulistan', 'গুলিস্তান', { town: 400 }), v(23.7385, 90.3955, 'Shahbag', 'শাহবাগ', { town: 400 }),
    v(23.7575, 90.3895, 'Farmgate', 'ফার্মগেট', { town: 400 }),
  ], { en: 'Dhaka City Road (Mayor Hanif Flyover)', bn: 'ঢাকা শহর সড়ক (মেয়র হানিফ ফ্লাইওভার)', km: 11,
    elevated: { from: 0, to: 0.32, en: 'Mayor Hanif Flyover', bn: 'মেয়র হানিফ ফ্লাইওভার' } }),
  R('dee', 'DEE', 4, 'sayedabad', 'kuril', [
    v(23.7330, 90.4300, 'Kamalapur', 'কমলাপুর', { town: 0 }), v(23.7490, 90.4080, 'Moghbazar', 'মগবাজার', { town: 0 }),
    v(23.7620, 90.4250, 'Rampura', 'রামপুরা', { town: 0 }), v(23.7800, 90.4320, 'Badda', 'বাড্ডা', { town: 0 }),
  ], { en: 'Dhaka Elevated Expressway', bn: 'ঢাকা এলিভেটেড এক্সপ্রেসওয়ে', km: 16, elevated: { from: 0, to: 1, en: 'Dhaka Elevated Expressway', bn: 'ঢাকা এলিভেটেড এক্সপ্রেসওয়ে', fee: 160 } }),
  R('p300', 'P300', 6, 'kuril', 'kanchan', [
    v(23.8330, 90.4800, 'Purbachal', 'পূর্বাচল', { town: 0 }),
    v(23.8120, 90.5300, 'Balu Bridge', 'বালু সেতু', { town: 0, ...river('Balu', 'বালু', 60) }),
  ], { en: '300 Feet Road (Purbachal Expressway)', bn: '৩০০ ফিট সড়ক (পূর্বাচল এক্সপ্রেসওয়ে)', km: 13, expressway: true }),
  R('byp1', 'N105', 4, 'gazipur', 'kanchan', [v(23.9300, 90.4800, 'Pubail', 'পুবাইল', { town: 200 }), v(23.8600, 90.5350, 'Debogram', 'দেবগ্রাম', { town: 0 })], { en: 'Dhaka Bypass', bn: 'ঢাকা বাইপাস' }),
  R('byp2', 'N105', 4, 'kanchan', 'bhulta', [], { en: 'Dhaka Bypass', bn: 'ঢাকা বাইপাস', km: 4 }),
  R('dcity2', 'DHK', 4, 'mohakhali', 'gabtoli', [], { en: 'Dhaka City Road', bn: 'ঢাকা শহর সড়ক', km: 8 }),
  R('nganj', 'R', 4, 'kanchpur', 'narayanganj', [], { en: 'Kanchpur–Narayanganj Road', bn: 'কাঁচপুর–নারায়ণগঞ্জ সড়ক' }),
  R('munsh', 'R', 2, 'narayanganj', 'munshiganj', [v(23.585, 90.515, 'Muktarpur Bridge', 'মুক্তারপুর সেতু', { town: 0, ...river('Dhaleshwari', 'ধলেশ্বরী', 80), ...toll(85, 'মুক্তারপুর সেতু টোল', 'Muktarpur Bridge Toll') })], { en: 'Narayanganj–Munshiganj Road', bn: 'নারায়ণগঞ্জ–মুন্সীগঞ্জ সড়ক' }),
  // ---------- N3 Dhaka – Mymensingh, Netrokona, Jamalpur, Sherpur
  R('n3a', 'N3', 4, 'mohakhali', 'kuril', [v(23.7950, 90.4050, 'Banani', 'বনানী', { town: 400 })], { en: 'Airport Road', bn: 'এয়ারপোর্ট রোড' }),
  R('n3a2', 'N3', 4, 'kuril', 'gazipur', [v(23.850, 90.410, 'Airport', 'বিমানবন্দর', { town: 450 }), v(23.895, 90.405, 'Tongi', 'টঙ্গী', { town: 450, ...river('Turag', 'তুরাগ', 60) })], { en: 'Dhaka–Mymensingh Highway', bn: 'ঢাকা–ময়মনসিংহ মহাসড়ক' }),
  R('n3b', 'N3', 4, 'gazipur', 'mymensingh', [
    v(24.200, 90.470, 'Sreepur', 'শ্রীপুর', { town: 250 }), v(24.380, 90.380, 'Bhaluka', 'ভালুকা', { town: 300 }), v(24.580, 90.395, 'Trishal', 'ত্রিশাল', { town: 250 }),
  ], { en: 'Dhaka–Mymensingh Highway', bn: 'ঢাকা–ময়মনসিংহ মহাসড়ক', rest: [{ km: 45, side: -1, bn: 'ভালুকা ফুড কোর্ট', en: 'Bhaluka Food Court', col: '#ad1457' }] }),
  R('netro', 'R', 2, 'mymensingh', 'netrokona', [v(24.760, 90.440, 'Shambhuganj Bridge', 'শম্ভুগঞ্জ সেতু', { town: 0, ...river('Brahmaputra', 'ব্রহ্মপুত্র', 90), ...toll(45, 'শম্ভুগঞ্জ সেতু টোল', 'Shambhuganj Bridge Toll') })], { en: 'Mymensingh–Netrokona Road', bn: 'ময়মনসিংহ–নেত্রকোনা সড়ক' }),
  R('jamal', 'R', 2, 'mymensingh', 'jamalpur', [v(24.800, 90.200, 'Muktagachha', 'মুক্তাগাছা', { town: 250 })], { en: 'Mymensingh–Jamalpur Road', bn: 'ময়মনসিংহ–জামালপুর সড়ক' }),
  R('sherp', 'R', 2, 'jamalpur', 'sherpur', [v(24.965, 89.975, 'Brahmaputra Bridge', 'ব্রহ্মপুত্র সেতু', { town: 0, ...river('Brahmaputra', 'ব্রহ্মপুত্র', 90) })], { en: 'Jamalpur–Sherpur Road', bn: 'জামালপুর–শেরপুর সড়ক' }),
  // ---------- N4 Gazipur – Tangail – Jamuna Bridge, N5 Dhaka – Aricha
  R('n4a', 'N4', 4, 'gazipur', 'chandra', [v(24.000, 90.320, 'Konabari', 'কোনাবাড়ী', { town: 300 })], { en: 'Joydebpur–Chandra Highway', bn: 'জয়দেবপুর–চন্দ্রা মহাসড়ক' }),
  R('n5a', 'N5', 4, 'gabtoli', 'nabinagar', [v(23.790, 90.320, 'Aminbazar', 'আমিনবাজার', { town: 350, ...river('Turag', 'তুরাগ', 60) }), v(23.850, 90.265, 'Savar', 'সাভার', { town: 450 })], { en: 'Dhaka–Aricha Highway', bn: 'ঢাকা–আরিচা মহাসড়ক' }),
  R('nabch', 'N5', 4, 'nabinagar', 'chandra', [v(23.980, 90.250, 'Baipail', 'বাইপাইল', { town: 300 })], { en: 'Nabinagar–Chandra Highway', bn: 'নবীনগর–চন্দ্রা মহাসড়ক' }),
  R('n4b', 'N4', 4, 'chandra', 'tangail', [v(24.110, 90.100, 'Mirzapur', 'মির্জাপুর', { town: 250 })], {
    en: 'Dhaka–Tangail Highway', bn: 'ঢাকা–টাঙ্গাইল মহাসড়ক', rest: [{ km: 22, side: -1, bn: 'ফুড প্যালেস', en: 'Food Palace', col: '#2e7d32' }] }),
  R('n4c', 'N4', 4, 'tangail', 'jamuna_west', [
    v(24.335, 89.920, 'Elenga', 'এলেঙ্গা', { town: 300 }),
    v(24.400, 89.770, 'Bangabandhu Bridge', 'বঙ্গবন্ধু সেতু', { town: 0, ...river('Jamuna', 'যমুনা', 340), ...toll(1350, 'বঙ্গবন্ধু সেতু টোল প্লাজা', 'Bangabandhu Bridge Toll Plaza') }),
  ], { en: 'Dhaka–Tangail Highway', bn: 'ঢাকা–টাঙ্গাইল মহাসড়ক' }),
  R('siraj', 'R', 2, 'jamuna_west', 'sirajganj', [], { en: 'Sirajganj Link Road', bn: 'সিরাজগঞ্জ সংযোগ সড়ক' }),
  R('n4d', 'N4', 4, 'jamuna_west', 'hatikumrul', [], { en: 'Bridge Approach Road', bn: 'সেতু সংযোগ সড়ক' }),
  R('n5b', 'N5', 2, 'nabinagar', 'manikganj', [v(23.900, 90.150, 'Dhamrai', 'ধামরাই', { town: 300 })], { en: 'Dhaka–Aricha Highway', bn: 'ঢাকা–আরিচা মহাসড়ক' }),
  R('n5c', 'N5', 2, 'manikganj', 'paturia', [v(23.840, 89.900, 'Uthali', 'উথলী', { town: 150 })], { en: 'Dhaka–Aricha Highway', bn: 'ঢাকা–আরিচা মহাসড়ক' }),
  R('ferry1', 'FERRY', 2, 'paturia', 'daulatdia', [], { en: 'Paturia–Daulatdia Ferry', bn: 'পাটুরিয়া–দৌলতদিয়া ফেরি', ferry: { fare: 1450, minutes: 50 }, km: 8 }),
  // ---------- North Bengal: Bogura, Rangpur, Dinajpur ... (N5)
  R('n5d', 'N5', 4, 'hatikumrul', 'bogura', [v(24.620, 89.470, 'Chandaikona', 'চান্দাইকোনা', { town: 200 }), v(24.680, 89.420, 'Sherpur (Bogura)', 'শেরপুর (বগুড়া)', { town: 300 })], {
    en: 'Dhaka–Rangpur Highway', bn: 'ঢাকা–রংপুর মহাসড়ক', rest: [{ km: 18, side: -1, bn: 'ফুড ভিলেজ', en: 'Food Village', col: '#c62828' }, { km: 20, side: 1, bn: 'হাইওয়ে হোটেল', en: 'Highway Hotel', col: '#00695c' }] }),
  R('n5e', 'N5', 4, 'bogura', 'gobindaganj', [v(24.990, 89.390, 'Shibganj (Bogura)', 'শিবগঞ্জ (বগুড়া)', { town: 200 })], { en: 'Dhaka–Rangpur Highway', bn: 'ঢাকা–রংপুর মহাসড়ক' }),
  R('n5f', 'N5', 4, 'gobindaganj', 'rangpur', [v(25.400, 89.300, 'Pirganj', 'পীরগঞ্জ', { town: 250 }), v(25.560, 89.280, 'Mithapukur', 'মিঠাপুকুর', { town: 250 })], { en: 'Dhaka–Rangpur Highway', bn: 'ঢাকা–রংপুর মহাসড়ক' }),
  R('gaib', 'R', 2, 'gobindaganj', 'gaibandha', [v(25.240, 89.480, 'Palashbari', 'পলাশবাড়ী', { town: 200 })], { en: 'Gobindaganj–Gaibandha Road', bn: 'গোবিন্দগঞ্জ–গাইবান্ধা সড়ক' }),
  R('kurig', 'R', 2, 'rangpur', 'kurigram', [v(25.790, 89.450, 'Rajarhat', 'রাজারহাট', { town: 200 })], { en: 'Rangpur–Kurigram Road', bn: 'রংপুর–কুড়িগ্রাম সড়ক' }),
  R('lalmo', 'R', 2, 'rangpur', 'lalmonirhat', [v(25.840, 89.270, 'Gangachara', 'গঙ্গাচড়া', { town: 200 }), v(25.880, 89.360, 'Teesta Bridge', 'তিস্তা সেতু', { town: 0, ...river('Teesta', 'তিস্তা', 110), ...toll(60, 'তিস্তা সেতু টোল', 'Teesta Bridge Toll') })], { en: 'Rangpur–Lalmonirhat Road', bn: 'রংপুর–লালমনিরহাট সড়ক' }),
  R('n5g', 'N5', 2, 'rangpur', 'saidpur', [v(25.770, 89.060, 'Taraganj', 'তারাগঞ্জ', { town: 200 })], { en: 'Rangpur–Saidpur Road', bn: 'রংপুর–সৈয়দপুর সড়ক' }),
  R('nilph', 'R', 2, 'saidpur', 'nilphamari', [], { en: 'Saidpur–Nilphamari Road', bn: 'সৈয়দপুর–নীলফামারী সড়ক' }),
  R('dinaj', 'N5', 2, 'saidpur', 'dinajpur', [v(25.710, 88.770, 'Dashmile', 'দশমাইল', { town: 200 })], { en: 'Saidpur–Dinajpur Road', bn: 'সৈয়দপুর–দিনাজপুর সড়ক' }),
  R('thakur', 'N5', 2, 'dinajpur', 'thakurgaon', [v(25.860, 88.570, 'Birganj', 'বীরগঞ্জ', { town: 200 })], { en: 'Dinajpur–Thakurgaon Road', bn: 'দিনাজপুর–ঠাকুরগাঁও সড়ক' }),
  R('panch', 'N5', 2, 'thakurgaon', 'panchagarh', [v(26.200, 88.520, 'Boda', 'বোদা', { town: 200 })], { en: 'Thakurgaon–Panchagarh Road', bn: 'ঠাকুরগাঁও–পঞ্চগড় সড়ক' }),
  R('naog', 'R', 2, 'bogura', 'naogaon', [v(24.820, 89.100, 'Santahar', 'সান্তাহার', { town: 250 })], { en: 'Bogura–Naogaon Road', bn: 'বগুড়া–নওগাঁ সড়ক' }),
  R('joyp', 'R', 2, 'bogura', 'joypurhat', [v(25.000, 89.200, 'Kahaloo', 'কাহালু', { town: 200 })], { en: 'Bogura–Joypurhat Road', bn: 'বগুড়া–জয়পুরহাট সড়ক' }),
  // ---------- N6 to Rajshahi, Kushtia and the south-west (N7)
  R('n6a', 'N6', 2, 'hatikumrul', 'bonpara', [v(24.380, 89.300, 'Chalan Beel', 'চলনবিল', { town: 0 })], { en: 'Hatikumrul–Bonpara Highway', bn: 'হাটিকুমরুল–বনপাড়া মহাসড়ক' }),
  R('n6b', 'N6', 2, 'bonpara', 'natore', [], { en: 'Dhaka–Rajshahi Highway', bn: 'ঢাকা–রাজশাহী মহাসড়ক' }),
  R('n6c', 'N6', 2, 'natore', 'rajshahi', [v(24.365, 88.840, 'Puthia', 'পুঠিয়া', { town: 250 })], { en: 'Dhaka–Rajshahi Highway', bn: 'ঢাকা–রাজশাহী মহাসড়ক' }),
  R('chapai', 'N6', 2, 'rajshahi', 'chapainawabganj', [v(24.470, 88.420, 'Godagari', 'গোদাগাড়ী', { town: 200 })], { en: 'Rajshahi–Chapai Nawabganj Road', bn: 'রাজশাহী–চাঁপাইনবাবগঞ্জ সড়ক' }),
  R('pabna', 'R', 2, 'hatikumrul', 'pabna', [v(24.180, 89.580, 'Baghabari', 'বাঘাবাড়ী', { town: 200, ...river('Baral', 'বড়াল', 60) })], { en: 'Hatikumrul–Pabna Road', bn: 'হাটিকুমরুল–পাবনা সড়ক' }),
  R('kusht', 'R', 2, 'bonpara', 'kushtia', [
    v(24.130, 89.070, 'Ishwardi', 'ঈশ্বরদী', { town: 300 }),
    v(24.060, 89.030, 'Lalon Shah Bridge', 'লালন শাহ সেতু', { town: 0, ...river('Padma', 'পদ্মা', 150), ...toll(285, 'লালন শাহ সেতু টোল', 'Lalon Shah Bridge Toll') }),
    v(24.020, 88.990, 'Bheramara', 'ভেড়ামারা', { town: 250 }),
  ], { en: 'Bonpara–Kushtia Highway', bn: 'বনপাড়া–কুষ্টিয়া মহাসড়ক' }),
  R('n7k', 'N7', 2, 'kushtia', 'jhenaidah', [v(23.730, 89.130, 'Shailkupa', 'শৈলকুপা', { town: 200 })], { en: 'Kushtia–Jhenaidah Highway', bn: 'কুষ্টিয়া–ঝিনাইদহ মহাসড়ক' }),
  R('chujh', 'N704', 2, 'jhenaidah', 'chuadanga', [v(23.600, 89.000, 'Harinakunda', 'হরিণাকুণ্ডু', { town: 200 })], { en: 'Jhenaidah–Chuadanga Road', bn: 'ঝিনাইদহ–চুয়াডাঙ্গা সড়ক' }),
  R('chuad', 'R', 2, 'kushtia', 'chuadanga', [v(23.770, 88.960, 'Alamdanga', 'আলমডাঙ্গা', { town: 200 })], { en: 'Kushtia–Chuadanga Road', bn: 'কুষ্টিয়া–চুয়াডাঙ্গা সড়ক' }),
  R('meher', 'R', 2, 'chuadanga', 'meherpur', [], { en: 'Chuadanga–Meherpur Road', bn: 'চুয়াডাঙ্গা–মেহেরপুর সড়ক' }),
  R('n7a', 'N7', 2, 'daulatdia', 'faridpur', [v(23.730, 89.780, 'Goalanda', 'গোয়ালন্দ', { town: 200 })], { en: 'Dhaka–Khulna Highway', bn: 'ঢাকা–খুলনা মহাসড়ক' }),
  R('rajb', 'R', 2, 'daulatdia', 'rajbari', [], { en: 'Daulatdia–Rajbari Road', bn: 'দৌলতদিয়া–রাজবাড়ী সড়ক' }),
  R('n7b', 'N7', 2, 'faridpur', 'magura', [v(23.530, 89.640, 'Kamarkhali', 'কামারখালী', { town: 200, ...river('Madhumati', 'মধুমতি', 90) })], { en: 'Dhaka–Khulna Highway', bn: 'ঢাকা–খুলনা মহাসড়ক' }),
  R('n7c', 'N7', 2, 'magura', 'jhenaidah', [], { en: 'Dhaka–Khulna Highway', bn: 'ঢাকা–খুলনা মহাসড়ক' }),
  R('n7d', 'N7', 2, 'jhenaidah', 'jashore', [v(23.380, 89.180, 'Kaliganj', 'কালীগঞ্জ', { town: 200 })], { en: 'Jhenaidah–Jashore Highway', bn: 'ঝিনাইদহ–যশোর মহাসড়ক' }),
  R('n7e', 'N7', 2, 'jashore', 'khulna', [v(23.060, 89.380, 'Noapara', 'নওয়াপাড়া', { town: 300 }), v(22.950, 89.470, 'Fultala', 'ফুলতলা', { town: 200 })], { en: 'Jashore–Khulna Highway', bn: 'যশোর–খুলনা মহাসড়ক' }),
  R('benap', 'N706', 2, 'jashore', 'benapole', [v(23.100, 89.020, 'Jhikargachha', 'ঝিকরগাছা', { town: 250 })], { en: 'Jashore–Benapole Highway', bn: 'যশোর–বেনাপোল মহাসড়ক' }),
  R('satkh', 'R', 2, 'jashore', 'satkhira', [v(22.920, 89.140, 'Kalaroa', 'কলারোয়া', { town: 200 })], { en: 'Jashore–Satkhira Road', bn: 'যশোর–সাতক্ষীরা সড়ক' }),
  R('narail', 'R', 2, 'jashore', 'narail', [], { en: 'Jashore–Narail Road', bn: 'যশোর–নড়াইল সড়ক' }),
  R('kalna', 'N806', 2, 'narail', 'bhanga', [
    v(23.190, 89.620, 'Kalna Bridge', 'কালনা সেতু', { town: 0, ...river('Madhumati', 'মধুমতি', 90), ...toll(175, 'কালনা (মধুমতি) সেতু টোল', 'Kalna Bridge Toll') }),
    v(23.250, 89.720, 'Kashiani', 'কাশিয়ানী', { town: 200 }),
    v(23.300, 89.840, 'Bhatiapara', 'ভাটিয়াপাড়া', { town: 200 }),
  ], { en: 'Bhanga–Narail–Jashore Highway', bn: 'ভাঙ্গা–নড়াইল–যশোর মহাসড়ক' }),
  R('rupsha', 'N7', 2, 'khulna', 'fakirhat', [v(22.800, 89.600, 'Rupsha Bridge', 'রূপসা সেতু', { town: 0, ...river('Rupsha', 'রূপসা', 80), ...toll(100, 'খানজাহান আলী (রূপসা) সেতু টোল', 'Rupsha Bridge Toll') })], { en: 'Khulna–Mongla Highway', bn: 'খুলনা–মোংলা মহাসড়ক' }),
  R('bager', 'R', 2, 'fakirhat', 'bagerhat', [], { en: 'Fakirhat–Bagerhat Road', bn: 'ফকিরহাট–বাগেরহাট সড়ক' }),
  R('gopal', 'N805', 2, 'fakirhat', 'gopalganj', [v(22.920, 89.760, 'Mollahat', 'মোল্লাহাট', { town: 200, ...river('Madhumati', 'মধুমতি', 80) })], { en: 'Khulna–Gopalganj Highway', bn: 'খুলনা–গোপালগঞ্জ মহাসড়ক' }),
  R('gopbh', 'N805', 2, 'gopalganj', 'bhanga', [v(23.170, 89.930, 'Tekerhat', 'টেকেরহাট', { town: 200 })], { en: 'Bhanga–Gopalganj Highway', bn: 'ভাঙ্গা–গোপালগঞ্জ মহাসড়ক' }),
  R('fbhan', 'N8', 4, 'faridpur', 'bhanga', [], { en: 'Faridpur–Bhanga Highway', bn: 'ফরিদপুর–ভাঙ্গা মহাসড়ক' }),
  // ---------- N8 Dhaka – Padma Bridge – Barishal – Kuakata, Bhola
  R('n8a', 'N8', 6, 'sayedabad', 'janjira', [
    v(23.690, 90.400, 'Postogola', 'পোস্তগোলা', { town: 350, ...river('Buriganga', 'বুড়িগঙ্গা', 80) }),
    v(23.600, 90.330, 'Dhaleshwari Toll', 'ধলেশ্বরী টোল প্লাজা', { town: 0, ...toll(550, 'ঢাকা–মাওয়া এক্সপ্রেসওয়ে টোল', 'Dhaka–Mawa Expressway Toll') }),
    v(23.530, 90.285, 'Sreenagar', 'শ্রীনগর', { town: 250 }),
    v(23.445, 90.265, 'Mawa', 'মাওয়া', { town: 250 }),
    v(23.410, 90.272, 'Padma Bridge', 'পদ্মা সেতু', { town: 0, ...river('Padma', 'পদ্মা', 450), ...toll(2400, 'পদ্মা সেতু টোল প্লাজা', 'Padma Bridge Toll Plaza') }),
  ], { en: 'Dhaka–Mawa–Bhanga Expressway', bn: 'ঢাকা–মাওয়া–ভাঙ্গা এক্সপ্রেসওয়ে', expressway: true }),
  R('n8b', 'N8', 6, 'janjira', 'bhanga', [v(23.360, 90.170, 'Shibchar', 'শিবচর', { town: 250 })], { en: 'Dhaka–Mawa–Bhanga Expressway', bn: 'ঢাকা–মাওয়া–ভাঙ্গা এক্সপ্রেসওয়ে', expressway: true }),
  R('shari', 'R', 2, 'janjira', 'shariatpur', [v(23.270, 90.340, 'Naodoba', 'নাওডোবা', { town: 150 })], { en: 'Janjira–Shariatpur Road', bn: 'জাজিরা–শরীয়তপুর সড়ক' }),
  R('n8c', 'N8', 2, 'bhanga', 'madaripur', [v(23.310, 90.040, 'Malignaj', 'মালিগ্রাম', { town: 150 }), v(23.250, 90.090, 'Mostofapur', 'মোস্তফাপুর', { town: 200 })], { en: 'Dhaka–Barishal Highway', bn: 'ঢাকা–বরিশাল মহাসড়ক' }),
  R('n8d', 'N8', 2, 'madaripur', 'barishal', [v(22.970, 90.230, 'Gournadi', 'গৌরনদী', { town: 250 })], {
    en: 'Dhaka–Barishal Highway', bn: 'ঢাকা–বরিশাল মহাসড়ক', rest: [{ km: 18, side: -1, bn: 'গৌরনদী হাইওয়ে রেস্তোরাঁ', en: 'Gournadi Highway Restaurant', col: '#4527a0' }] }),
  R('n8e', 'N8', 2, 'barishal', 'patuakhali', [v(22.440, 90.380, 'Payra Bridge', 'পায়রা সেতু', { town: 0, ...river('Payra', 'পায়রা', 120), ...toll(165, 'পায়রা সেতু টোল', 'Payra Bridge Toll') })], { en: 'Barishal–Patuakhali Highway', bn: 'বরিশাল–পটুয়াখালী মহাসড়ক' }),
  R('n8f', 'N8', 2, 'patuakhali', 'amtali', [], { en: 'Patuakhali–Kuakata Highway', bn: 'পটুয়াখালী–কুয়াকাটা মহাসড়ক' }),
  R('kuaka', 'N8', 2, 'amtali', 'kuakata', [v(22.030, 90.230, 'Kalapara', 'কলাপাড়া', { town: 250, sea: true })], { en: 'Patuakhali–Kuakata Highway', bn: 'পটুয়াখালী–কুয়াকাটা মহাসড়ক' }),
  R('bargu', 'R', 2, 'amtali', 'barguna', [], { en: 'Amtali–Barguna Road', bn: 'আমতলী–বরগুনা সড়ক' }),
  R('jhalo', 'R', 2, 'barishal', 'jhalokathi', [], { en: 'Barishal–Jhalokathi Road', bn: 'বরিশাল–ঝালকাঠি সড়ক' }),
  R('piroj', 'R', 2, 'jhalokathi', 'pirojpur', [], { en: 'Jhalokathi–Pirojpur Road', bn: 'ঝালকাঠি–পিরোজপুর সড়ক' }),
  R('lahar', 'R', 2, 'barishal', 'laharhat', [], { en: 'Barishal–Laharhat Road', bn: 'বরিশাল–লাহারহাট সড়ক' }),
  R('ferry2', 'FERRY', 2, 'laharhat', 'veduria', [], { en: 'Laharhat–Veduria Ferry', bn: 'লাহারহাট–ভেদুরিয়া ফেরি', ferry: { fare: 950, minutes: 40 }, km: 13 }),
  R('bhola', 'R', 2, 'veduria', 'bhola', [], { en: 'Veduria–Bhola Road', bn: 'ভেদুরিয়া–ভোলা সড়ক' }),
];
