<div align="center">

# 🐍 Wild Roads

**A 3D browser survival game built with Three.js, TypeScript, and Vite**

*Hunt · Grow · Survive*

[![Live Demo](https://img.shields.io/badge/demo-wild--roads.vercel.app-2ea44f?style=for-the-badge)](https://wild-roads.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

[Play Now](https://wild-roads.vercel.app) · [Report a Bug](https://github.com/Faisal01011/wild-roads/issues) · [Request a Feature](https://github.com/Faisal01011/wild-roads/issues)

</div>

---

## About

**Wild Roads** is a snake-inspired survival game rendered in full 3D. You slither through an endlessly generated wilderness, hunting deer to grow and score points while evading wolves that stalk and attack you. The world streams in dynamically around the player, cycles through day and night, and is built entirely with a hand-rolled Three.js rendering pipeline — no game engine, just the raw graphics stack.

The project doubles as an exploration of real-time 3D web game architecture: chunk-based procedural terrain, animated GLTF/FBX creature AI, dynamic lighting, and mobile-first touch controls, all shipped as a fast, dependency-light Vite app.

## Features

- 🐍 **3D Snake Movement** — Smooth, physically responsive steering and segment-following movement in a full 3D world (not a grid).
- 🦌 **Hunting & Growth Loop** — Chase and eat deer to grow your body and rack up score; species-driven spawn logic keeps prey populations flowing around the player.
- 🐺 **Predator AI** — Wolves actively hunt the player; getting caught shrinks your snake and costs points, adding real risk to the chase.
- 🌍 **Procedural World Streaming** — Terrain is generated in chunks using simplex noise and streamed in/out around the player for a seamless, infinite map.
- 🌗 **Dynamic Day/Night Cycle** — A continuous lighting cycle shifts sun color, ambient light, and sky mood between day, sunset, and night.
- ✨ **Stamina & Boost System** — Sprint through danger or toward prey using a stamina-gated speed boost with regen mechanics and timed power-ups.
- 🎮 **Cross-Platform Controls** — Full keyboard support (WASD / arrow keys + Shift/Space to boost) alongside on-screen touch controls for mobile play.
- 🔊 **Ambient Audio** — Looping ambient soundscape and eat/action sound effects via a lightweight custom audio manager.
- 🎨 **Procedural Textures & Effects** — Ground textures, glow sprites, screen shake, and hit/eat particle bursts generated at runtime rather than pre-baked.
- 📊 **Live HUD** — Real-time score, stamina bar, and stats display, plus an FPS counter for performance visibility.
- ⚡ **Performance Monitoring** — Integrated with [Vercel Speed Insights](https://vercel.com/docs/speed-insights) for real-world performance tracking.

## Tech Stack

| Category | Technology |
|---|---|
| Language | [TypeScript](https://www.typescriptlang.org/) |
| 3D Rendering | [Three.js](https://threejs.org/) |
| Build Tool | [Vite](https://vitejs.dev/) |
| Procedural Noise | [simplex-noise](https://www.npmjs.com/package/simplex-noise) |
| Models | FBX / GLTF (loaded via Three.js `FBXLoader` / `GLTFLoader`) |
| Analytics | [@vercel/speed-insights](https://vercel.com/docs/speed-insights) |
| Deployment | [Vercel](https://vercel.com/) |

## Project Structure

```
wild-roads/
├── public/
│   ├── models/          # FBX/GLTF assets — trees, rocks, grass, Deer, Wolf
│   └── sounds/          # Ambient and SFX audio
├── src/
│   ├── entities/        # Animal AI: animatedAnimal.ts, animalManager.ts
│   ├── player/           # Player-controlled snake logic (snake.ts)
│   ├── world/            # Scene, chunk streaming, lighting, sky, camera
│   ├── utils/             # Asset loading, audio, input, effects, UI, FPS counter
│   ├── main.ts            # Game bootstrap, loop, and state management
│   └── style.css          # HUD and menu styling
├── index.html
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (bundled with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/Faisal01011/wild-roads.git
cd wild-roads

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

Opens the game with hot module reload, typically at `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Type-checks the project with `tsc` and outputs an optimized production build via Vite.

### Preview the Build

```bash
npm run preview
```

Serves the production build locally for a final check before deployment.

## How to Play

| Action | Keyboard | Touch |
|---|---|---|
| Steer Left | `A` / `←` | Left on-screen button |
| Steer Right | `D` / `→` | Right on-screen button |
| Boost | `Shift` / `Space` | Boost on-screen button |

Eat deer to grow and increase your score. Avoid wolves — getting hit shrinks your snake and costs points. Boosting drains stamina, which regenerates over time, so time your sprints carefully.

## Deployment

Wild Roads is deployed on [Vercel](https://vercel.com) and live at **[wild-roads.vercel.app](https://wild-roads.vercel.app)**. Any static host capable of serving a Vite build output works equally well.

## Roadmap

- [ ] Additional prey/predator species
- [ ] Persistent leaderboard
- [ ] Expanded power-up variety
- [ ] Alternate vehicle/movement modes

## Contributing

Contributions, issues, and feature requests are welcome.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project does not currently specify a license. All rights reserved by the author unless otherwise stated.

## Author

**Faisal Fayaz**

- GitHub: [@Faisal01011](https://github.com/Faisal01011)
- LinkedIn: [faisal-fayaz](https://linkedin.com/in/faisal-fayaz)

---

<div align="center">

If you enjoyed playing, consider giving the repo a ⭐

</div>
