# মহাসড়ক Mohasorok: Bangladesh Bus Simulator

Drive a Hino AK1J and other Bangladeshi intercity buses on the **highways of Bangladesh, between any of the 64 zillas**, right in your browser on a PC or a phone. It's free and there's nothing to install.

**▶ Play:** https://arafatsheikh098.github.io/mohasorok/

## Features
- **The whole country:** all 64 zilla towns (plus Teknaf, Benapole and Kuakata) on the national and regional highways N1–N8 and more, compressed 1:12, with real kilometres shown.
  - **Pick a trip** on the map of Bangladesh in the menu (any zilla to any zilla), or tick **🧭 Free drive** and take any road you like.
  - **Turn at any junction.** Green boards before each junction show where every road goes. Drive onto another road and the trip reroutes (or tells you it's the wrong road).
  - **Real lanes:** divided 4-lane highways where the real road is 4-lane (N1, N3, N4, the Padma expressway and others), undivided 2-lane roads elsewhere, where overtaking means pulling into the oncoming lane.
  - **Expressways and flyovers:** the 6-lane Dhaka–Mawa–Bhanga Expressway and the 300 Feet Road (Purbachal Expressway) with a concrete median barrier and service roads, the Dhaka Elevated Expressway on pillars (electronic toll), the Mayor Hanif Flyover and the Dhaka Bypass. Trips choose the faster roads.
  - **Big bridges and their tolls** (bus, approximate): Padma ৳2,400 (with its steel truss), Bangabandhu (Jamuna) ৳1,350, Meghna–Gumti ৳465, Dhaka–Mawa Expressway ৳550, Lalon Shah ৳285, Kalna ৳175, Payra ৳165, Dhaka Elevated Expressway ৳160 (electronic), Bhairab ৳145, Rupsha ৳100, Muktarpur ৳85, Shah Amanat ৳75, Teesta ৳60, Shambhuganj ৳45.
  - **Ferries:** Paturia–Daulatdia and Laharhat–Veduria (to Bhola). Stop on the pontoon and press **F**.
  - **M** opens the full map: your route along the real roads, the stops on the way, the part already driven and your bus. It opens zoomed to the trip; zoom with the wheel or ＋ －, drag to move. On a phone, tap the minimap.
- **Terminals and stops:** every zilla has its own bus terminal (Sayedabad, Gabtoli and Mohakhali in Dhaka; A.K. Khan and Bahaddarhat in Chattogram; Sonadanga, Shiroil, Kadamtali, Nathullabad and others). Passengers board at the origin terminal and the counters on the way out of the city, and get down at every zilla on the way (or at the turn-off for a zilla just off the road).
- **Buses on real routes:** the AI buses run fixed services of the real operators (Hanif Dhaka–Rajshahi, Green Line Dhaka–Sylhet, Soudia Chattogram–Cox's Bazar, Sakura Dhaka–Kuakata and about 100 more). Each shows its route on a placard by the door and in the rear window. They stop at their towns' counters, signal and turn off where their route leaves yours, and come out of side roads and terminals to join the highway.
- **Buses:** four types.
  - **AK1J AC** (default) and **AK1J Non-AC**: Hino AK1J with a Bangladeshi body, a front-engine cab, an engine cover with a manual gear lever, and the classic Hino gauge panel.
  - **Coach** (Universe-style) and **High-deck** (Scania/Volvo-style).
- **Operators:** 12 liveries, plus your own skins (**＋ Import skin**).
- **On the road:**
  - toll plazas where you stop to pay
  - fuel stations where you refuel with **F**
  - U-turns in the median of divided highways (turn round anywhere on a 2-lane road)
  - footbridges, gantry signs, Bangla shop signs, villages, brick kilns and rivers
- **Driving:**
  - live rear-view mirrors and working indicators
  - realistic collisions and a top speed of 140 km/h
  - **AI traffic cameras** on poles over the road. They flash for every vehicle that passes and fine you above 80 km/h. Each one has an "এআই ক্যামেরা" warning sign 150 m before it.
- **Rest stops:** highway restaurants (near Cumilla, Mirsharai, Madhabpur, Chandaikona, Gournadi and others) with bus bays, tea stalls and parked buses. Stop in the lot and press **F** for a 20-minute passenger break. After 3 hours on the road the passengers ask for one.
- **Your own music:** add songs in the menu (**Music 🎵 → ＋ Add songs**, MP3/M4A/WAV/OGG…). They stay saved in your browser and are never uploaded. A small player shows while you drive: ⏮ ⏯ ⏭ and volume, **B** play/pause, **N** next song (Shift+N previous), 🎵 in the ☰ tray on phones. Optional shuffle and auto-play when a trip starts. You can also paste a **YouTube link** (one song or a whole playlist): it plays in YouTube's own small player window, which YouTube requires to stay visible; ✕ stops it. Videos whose owners block embedding are skipped.
- **Time of day:** you choose the start time (morning, noon, afternoon, evening or night), then the clock keeps running while you drive (12 game minutes per real minute). The sun moves across the sky through dawn, noon, the golden evening and dusk into night, and the headlights and street lights come on by themselves.

## Controls
| | PC | Phone (landscape) |
|---|---|---|
| Drive | W / S (hold S when stopped to reverse) | GAS / BRAKE pedals |
| Steer | A / D | turn the on-screen wheel |
| Horn | H | HORN |
| Indicators | Q / E | ◀ ▶ |
| Camera | C or 1–4 (1 = driver's seat) | 🎥 · drag the view to look around |
| Full map of your route | M | tap the minimap |
| Sound on / off | Z | — |
| Lights / cruise / refuel | L / X / F | 💡 / CRUISE / ⛽ |
| Screen mirrors / reset / pause | V / R / P | 🪞 / ↺ / ⏸ |
| Music play-pause / next | B / N (Shift+N previous) | 🎵 in ☰, or the on-screen player |
| Adjust driver's seat | **🪑 Seat** button in cabin view, or Alt + ← → ↑ ↓ (move), Alt + PgUp/PgDn (height), Alt + [ ] (field of view) | 🪑 then sliders |

A gamepad also works: the left stick steers, RT is throttle, LT is brake, and A is the horn.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```
Every push to `main` deploys to GitHub Pages automatically (`.github/workflows/deploy.yml`).

## Where to change things
- `src/data/bd_network.js`: zilla towns, junctions, roads (via towns, bridges, toll plazas, lanes), terminal names
- `src/data/services.js`: which operator runs which route
- `src/net.js`: the road network (centrelines, terminal access roads, roadside features, shortest paths)
- `src/route.js`: a trip corridor built from a path of roads; `src/world/stream.js`: the world is built in blocks around the bus
- `src/operators.js`: operators and liveries
- `src/busModel.js`: bus bodies and cabs
- `src/config.js`: lane profiles, toll fee, diesel price
- `src/physics.js`: driving feel
- `src/world/`: road, junctions, ferries, scenery, toll plazas, fuel stations, terminals, footbridges

## Credits and disclaimer
- **Fan-made project, not affiliated** with any bus operator, Hino Motors or any other company. Operator names belong to their owners. If you represent an operator and want a change, please open an issue.
- **Nothing copied:** all buses, liveries and scenery are drawn by the game's own code. No images or 3D models from other games or mods are included. See `REFERENCES.md` for the photos used as visual reference.
- **Libraries and fonts:** [three.js](https://threejs.org) (MIT) and Noto Sans Bengali (SIL Open Font License).
