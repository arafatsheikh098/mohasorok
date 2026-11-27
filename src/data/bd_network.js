// The Bangladesh road network the game is built from.
//
// NODES: places where roads meet or end (junctions, terminals, ferry ghats). Each has lat/lon, names and
//   `town` (length of the built-up stretch, m of game road; 0 = none). A node with `terminal` gets a bus terminal yard.
// ROADS: one road between two nodes, as a chain of via points (towns, rivers, toll plazas) in real lat/lon.
//   lanes: 4 (divided, with a median) or 2 (one lane each way). km: real length in km (shown to the player).
//   Every feature on a road (fuel stations, rest stops, police) is given in real km from the road's `from` node,
//   with side -1 = the left carriageway when driving from `from` to `to` (Bangladesh drives on the left).
//
// Coordinates, highway numbers and toll fees are approximate: good enough for a game map, not for navigation.
import { WAYPOINTS, FUEL_STATIONS, REST_STOPS, REAL_ROUTE_KM, TOLL_FEE } from '../config.js';

const W = WAYPOINTS;
const first = W[0], last = W[W.length - 1];

export const NODES = {
  sayedabad: { lat: first.lat, lon: first.lon, en: first.en, bn: first.bn, town: first.town, kind: first.kind, zilla: 'dhaka',
    terminal: { en: 'Sayedabad Bus Terminal', bn: 'সায়েদাবাদ বাস টার্মিনাল', road: 'n1', side: -1 } },
  akkhan: { lat: last.lat, lon: last.lon, en: last.en, bn: last.bn, town: last.town, kind: last.kind, hills: last.hills, zilla: 'chattogram',
    terminal: { en: 'A.K. Khan Bus Terminal', bn: 'এ. কে. খান বাস টার্মিনাল', road: 'n1', side: 1 } },
};

export const ROADS = [
  {
    id: 'n1', ref: 'N1', lanes: 4, from: 'sayedabad', to: 'akkhan', km: REAL_ROUTE_KM,
    en: 'Dhaka–Chattogram Highway', bn: 'ঢাকা–চট্টগ্রাম মহাসড়ক',
    via: W.slice(1, -1).map((w) => ({ ...w, ...(w.toll ? { toll: { fee: TOLL_FEE, bn: 'মেঘনা–গোমতী সেতু টোল প্লাজা', en: 'Meghna–Gumti Bridge Toll Plaza' } } : {}) })),
    fuel: FUEL_STATIONS.map((f) => ({ ...f, km: f.f * REAL_ROUTE_KM })),
    rest: REST_STOPS.map((r) => ({ ...r, km: r.f * REAL_ROUTE_KM })),
    police: [{ km: 15, en: 'Meghna approach' }, { km: 101, en: 'Cumilla bypass' }, { km: 205, en: 'Sitakunda' }],
  },
];
