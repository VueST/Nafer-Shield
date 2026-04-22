# <img src="assets/icons/icon-128.png" width="48" align="center"> Nafer Shield

**The ad blocker that works where others fail.**

[![Version](https://img.shields.io/badge/version-3.0.0-blueviolet?style=flat-square)](https://github.com/VueST/Nafer-Shield/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox-orange?style=flat-square)](#)

---

Most ad blockers are built around mainstream ad networks. **Nafer Shield** goes further — targeting the alternative ad networks that operate on free streaming, manga, sports, and content sites where other blockers fall short.

## 🛡️ How It Works — 3 Layers of Defense

| Layer | Method | What It Catches |
|-------|--------|-----------------|
| **Static DNR Rules** | Chrome's native Declarative Net Request | 56,000+ known ad domains |
| **Dynamic Network Rules** | Runtime-injected domain block list | 50+ alternative ad networks (ExoClick, TrafficJunky, JuicyAds...) |
| **Cosmetic CSS + DOM Guard** | Content script injection + MutationObserver | Ad containers, images & iframes that slip through network blocking |

## ✨ Features

- 🚫 **Blocks alternative ad networks** — ExoClick, TrafficJunky, JuicyAds, Adnium, PropellerAds, and 45+ more
- 🔁 **Works on SPAs** — MutationObserver catches dynamically injected ads on React/Vue apps
- ⚡ **Self-healing engine** — HealthService re-activates rules if Chrome silently disables them
- 🎛️ **Per-site control** — pause protection on trusted sites without global disable
- 🔒 **Zero telemetry** — no data collection, all logic runs locally
- 🪶 **Lightweight** — under 25KB compiled, no heavy dependencies

## 🚀 Install (Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** → select the project folder
5. Done ✅

## 🛠️ Build From Source

```bash
git clone https://github.com/VueST/Nafer-Shield.git
cd Nafer-Shield
npm install
npm run build
# Load the project folder in Chrome as unpacked extension
```

### Recompile Filter Lists (optional)
```bash
node tools/compile-rules.js
# Auto-downloads EasyList, splits into shards, patches manifest.json
npm run build
```

## 📁 Architecture

```
src/
├── core/
│   ├── AdNetworks.js        # Central registry of ad network domains & CSS patterns
│   ├── NetworkRulesEngine.js # Dynamic DNR rule management
│   ├── FilterEngine.js       # Core engine orchestrator
│   └── CosmeticFilter.js    # CSS-based element hiding
├── application/services/
│   ├── FilterListService.js  # Filter list state management
│   ├── HealthService.js      # Engine health monitoring & self-healing
│   └── StatsService.js       # Block count tracking
└── background/
    └── MessageRouter.js      # Popup ↔ Background message bus
```

## 👤 Author

Developed and maintained by **gtqn**

## 💬 Support & Contact

- **Discord**: [gtqn](https://discord.com/users/gtqn)
- **GitHub**: [VueST](https://github.com/VueST)

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---
© 2026 Nafer Platform. All rights reserved.
