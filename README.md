# 🌍 World Explorer 3D

A browser-based 3D driving game that lets you explore real-world cities using OpenStreetMap data. Drive through authentic street layouts of major cities around the world with realistic physics and multiple game modes.

![World Explorer 3D](assets/screenshot.png)

## ✨ Features

### 🗺️ Real-World Locations
- **11 Pre-loaded Cities**: Baltimore, Hollywood, New York, Miami, Tokyo, Monaco, Nürburgring, Las Vegas, London, Paris, Dubai
- **Custom Locations**: Enter any city name or GPS coordinates to explore anywhere in the world
- **Authentic Street Layouts**: Uses real OpenStreetMap data for accurate road networks

### 🚗 Realistic Driving Physics
- Speed-sensitive steering
- Realistic braking and drifting mechanics
- Off-road driving with reduced grip
- Boost system with visual feedback
- Complete stop when braking

### 🎮 Game Modes
- **Free Roam**: Explore cities at your own pace
- **Time Trial**: Race to reach the destination as fast as possible
- **Checkpoints**: Collect scattered markers around the map

### 🎨 Professional UI Design
- Modern, clean interface with gradient accents
- Smooth animations and transitions
- Responsive HUD showing speed, street name, and indicators
- Interactive minimap with expandable view

### 🌤️ Atmospheric Environment
- Dynamic sky with sun and clouds
- 100+ procedurally generated clouds at realistic altitude
- 15 large cloud formations for visual variety
- Realistic lighting with HDR environment mapping
- Fog effects for distance rendering

### 🚔 Police Chase System
- Toggle police pursuit mode
- Intelligent AI that chases when you speed
- Police can navigate through buildings during pursuit
- Persistent chase - slowing down won't stop them
- 3-strike system before getting caught

### 📷 Camera System
- Multiple camera angles
- Drone mode with full 6-axis control
- Look-back camera
- Smooth camera transitions

### 🏁 Track Recording
- Record custom race tracks
- Visual track overlay on road
- Save and replay your routes

## 🚀 Getting Started

### Prerequisites
- Modern web browser with WebGL support (Chrome, Firefox, Safari, Edge)
- Internet connection (for OpenStreetMap data and external libraries)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/world-explorer-3d.git
cd world-explorer-3d
```

2. Open `index.html` in your web browser:
```bash
# On macOS
open index.html

# On Linux
xdg-open index.html

# On Windows
start index.html
```

Or use a local development server:
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server
```

Then navigate to `http://localhost:8000` in your browser.

## 🎮 Controls

### Driving
- **W** / **↑** - Accelerate
- **S** / **↓** - Brake / Reverse
- **A** / **←** - Turn Left
- **D** / **→** - Turn Right
- **Space** - Handbrake (for drifting)
- **Ctrl** - Boost
- **Shift** - Off-road mode

### Camera
- **C** - Cycle through camera angles
- **V** - Look back
- **6** - Toggle drone mode

### Drone Mode
- **W/S** - Move Forward/Back
- **A/D** - Move Left/Right
- **Space** - Move Up
- **Shift/Ctrl** - Move Down
- **↑/↓** - Look Up/Down
- **←/→** - Turn Left/Right

### Special
- **R** - Start/stop recording track
- **N** - Jump to next city
- **M** - Toggle large map
- **Esc** - Pause game

## 🏗️ Project Structure

```
world-explorer-3d/
│
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styling and animations
├── js/
│   └── game.js         # Game logic, physics, rendering
├── assets/
│   └── screenshot.png  # Project screenshots
└── README.md           # This file
```

## 🛠️ Technical Details

### Technologies Used
- **Three.js r128** - 3D rendering engine
- **OpenStreetMap API** - Real-world map data
- **Nominatim API** - City name geocoding
- **WebGL** - Hardware-accelerated 3D graphics

### Key Features
- **PBR Materials**: Physically-based rendering for realistic materials
- **HDR Environment**: Real HDRI for accurate lighting and reflections
- **Procedural Textures**: Generated asphalt, normal maps, and roughness
- **Shadow Mapping**: Real-time soft shadows
- **Tile Caching**: Efficient OSM tile management
- **Physics Engine**: Custom car physics with realistic handling

### Browser Compatibility
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Requires WebGL 1.0 or higher support.

## 🎯 Roadmap

- [ ] Multiplayer mode
- [ ] Traffic system with AI vehicles
- [ ] Pedestrians
- [ ] Day/night cycle
- [ ] Weather effects (rain, snow)
- [ ] More vehicle types
- [ ] Building interiors
- [ ] Mobile touch controls
- [ ] Leaderboards
- [ ] More game modes (drift competitions, delivery missions)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **OpenStreetMap** - Map data © OpenStreetMap contributors
- **Poly Haven** - HDR environments
- **Three.js** - 3D graphics library
- **Google Fonts** - Inter and Poppins fonts

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Enjoy exploring the world! 🌍🚗**
