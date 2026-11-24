# মহাসড়ক Mohasorok: Bangladesh Bus Simulator

Drive a Hino AK1J and other Bangladeshi intercity buses on the **Dhaka → Chattogram N1 highway**, right in your browser on a PC or a phone. It's free and there's nothing to install.

**▶ Play:** https://YOUR-GITHUB-USERNAME.github.io/mohasorok/

## Features
- **Route:** the real N1 route, from Sayedabad through Kanchpur, the Meghna and Gumti bridges, Cumilla, Feni and Sitakunda to Chattogram. It is compressed 1:12, and the game shows about 245 km.
- **Buses:** four types.
  - **AK1J AC** (default) and **AK1J Non-AC**: Hino AK1J with a Bangladeshi body, a front-engine cab, an engine cover with a manual gear lever, and the classic Hino gauge panel.
  - **Coach** (Universe-style) and **High-deck** (Scania/Volvo-style).
- **Operators:** 12 liveries, plus your own skins (**＋ Import skin**).
- **On the road:**
  - a toll plaza where you stop to pay
  - fuel stations where you refuel with **F**
  - U-turns in the median, so you can drive back to Dhaka
  - footbridges, gantry signs, Bangla shop signs, villages, brick kilns and rivers
- **Driving:**
  - live rear-view mirrors and working indicators
  - realistic collisions, a top speed of 140 km/h, and speed cameras in towns
- **Time of day:** morning, noon, evening and night with headlights.

## Controls
| | PC | Phone (landscape) |
|---|---|---|
| Drive | W / S (hold S when stopped to reverse) | GAS / BRAKE pedals |
| Steer | A / D | turn the on-screen wheel |
| Horn | H | HORN |
| Indicators | Q / E | ◀ ▶ |
| Camera | C or 1–4 (1 = driver's seat) | 🎥 · drag the view to look around |
| Lights / cruise / refuel | L / X / F | 💡 / CRUISE / ⛽ |
| Screen mirrors / reset / pause | V / R / P | 🪞 / ↺ / ⏸ |

A gamepad also works: the left stick steers, RT is throttle, LT is brake, and A is the horn.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```
Every push to `main` deploys to GitHub Pages automatically (`.github/workflows/deploy.yml`).

## Where to change things
- `src/operators.js`: operators and liveries
- `src/busModel.js`: bus bodies and cabs
- `src/config.js`: route, towns, toll fee, diesel price
- `src/physics.js`: driving feel
- `src/world/`: road, scenery, toll plaza, fuel stations, footbridges

## Credits and disclaimer
- **Fan-made project, not affiliated** with any bus operator, Hino Motors or any other company. Operator names belong to their owners. If you represent an operator and want a change, please open an issue.
- **Nothing copied:** all buses, liveries and scenery are drawn by the game's own code. No images or 3D models from other games or mods are included. See `REFERENCES.md` for the photos used as visual reference.
- **Libraries and fonts:** [three.js](https://threejs.org) (MIT) and Noto Sans Bengali (SIL Open Font License).
