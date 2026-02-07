# 🌍 World Explorer 3D

World Explorer 3D is a browser-based 3D exploration platform built with Three.js.  
It allows users to explore real-world Earth locations and transition into space and planetary environments within a single running session.

This project is a **platform and systems prototype**, not a finished game or commercial product.  
The focus is on architecture, environment traversal, and interaction across scales.

🔗 **Live Demo:** https://rrg314.github.io/WorldExplorer3D/  
💻 **GitHub:** https://github.com/RRG314/WorldExplorer3D/

---

## ✨ Overview

World Explorer 3D connects multiple environments into one continuous experience:

- 🌍 Real-world Earth exploration using open map data  
- 🚀 Space flight with a navigable solar system  
- 🌙 Moon landing and surface exploration  
- 🔁 Seamless transitions between environments  

You can travel from Earth into space, fly to the Moon, land, explore the surface, and return to Earth without restarting the application.

---

## 🧭 Environments

### 🌍 Earth
- Explore locations by city name or GPS coordinates  
- Roads and terrain generated from OpenStreetMap data  
- Procedural building placeholders  
- Minimap and large interactive map  
- Road, land-use, and satellite map layers  

### 🚀 Space
- Free-flight navigation  
- Sun-centered solar system model  
- Orbiting planets with visible orbital paths  
- Planetary moons where applicable  
- Clickable planets with informational panels  

### 🌙 Moon
- Manual flight and landing sequence  
- Low-gravity physics  
- Walking and driving on the surface  
- Return-to-Earth transition  

---

## 🎮 Movement Modes

- 🚗 Driving with vehicle physics  
- 🚶 Walking with first-person controls  
- 🚁 Drone-style aerial navigation  
- 🛰️ Manual space flight  

---

## 🧱 Architecture

The project was originally developed as a single large HTML/JavaScript file and has since been refactored into a **modular structure**.

The current architecture separates concerns across multiple JavaScript files:

- Engine and rendering setup  
- World and data loading  
- Physics and movement systems  
- Input handling  
- UI and HUD logic  
- Map rendering  
- Terrain generation  
- Sky and astronomy systems  
- Global state management  

This refactor made it possible to add space travel and planetary environments without rewriting existing Earth systems.

---

## ⌨️ Controls

### Driving
| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / ← | Turn left |
| D / → | Turn right |
| Space | Handbrake |
| Ctrl | Boost |

### Walking
| Key | Action |
|-----|--------|
| Arrow Keys | Move |
| W / S | Look up / down |
| A / D | Look left / right |
| Space | Jump |
| Shift | Run |

### General
| Key | Action |
|-----|--------|
| F | Toggle walk / drive |
| 6 | Toggle drone mode |
| C | Cycle camera |
| M | Toggle map |
| R | Start / stop track recording |
| Esc | Pause |

---

## 💻 System Requirements

**Minimum**
- Modern browser (Chrome, Firefox, Safari, Edge)  
- 4 GB RAM  
- Integrated graphics  

**Recommended**
- Recent browser version  
- 8 GB RAM or more  
- Dedicated GPU  

Mobile devices are supported with reduced visual fidelity.

---

## 🐛 Known Issues

- Performance spikes during city or environment switches  
- Occasional terrain and road alignment edge cases  
- FPS varies depending on hardware and browser  
- Optimization and cleanup are ongoing  

---

## 🚧 Project Status

World Explorer 3D is under active development.  
Core systems are functional and integrated.

Current focus:
- Performance improvements  
- Stability during environment transitions  
- Terrain and road alignment polish  

This repository should be viewed as:
- a platform prototype  
- a systems exploration project  
- a foundation for future specialization  

---

## 📚 Documentation

- 📄 API Setup Guide: `API_SETUP.md`  
- 📘 User Guide: `USER_GUIDE.md`  
- 🧠 Technical Documentation: `TECHNICAL_DOCS.md`  
- 📝 Changelog: `CHANGELOG.md`  
- 🙏 Acknowledgements: `ACKNOWLEDGEMENTS.md`  

---

## 📄 License

**Copyright © 2026 World Explorer 3D**  
All rights reserved.

This software is proprietary. No part may be copied, modified, or distributed without explicit written permission.

---

## 🙏 Credits

Built with **Three.js** and **OpenStreetMap** data.  
Additional data sources include Rentcast, Attom, Estated, and public-domain NASA materials.
