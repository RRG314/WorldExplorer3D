# World Explorer 3D 🌍

A real-time 3D world exploration platform that combines open map data, interactive gameplay, and immersive experiences. Drive, walk, or fly through realistic recreations of major cities worldwide, travel to the moon, and explore real estate data—all from your browser.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Three.js](https://img.shields.io/badge/three.js-r128-orange.svg)

## ✨ Features

### 🎮 Multiple Exploration Modes
- **Free Roam** - Explore cities at your own pace
- **Time Trial** - Race against the clock to reach destinations
- **Checkpoint Challenge** - Collect markers scattered across the map
- **Walking Mode** - First-person pedestrian exploration with jumping
- **Drone Mode** - Aerial photography and exploration

### 🗺️ Real-World Integration
- **OpenStreetMap Data** - Community-contributed map data for realistic terrain
- **11+ Major Cities** - Baltimore, New York, Tokyo, Paris, Monaco, and more
- **Custom Location Support** - Search any address or enter GPS coordinates
- **Dynamic Map System** - Interactive map with multiple layers and filters

### 🏠 Real Estate Features
- **Live Property Data** - Integration with Rentcast, Attom, and Estated APIs
- **3D Property Markers** - Visualize properties in the 3D world
- **Property Details** - View prices, sizes, and descriptions
- **Market Analysis** - Filter and analyze real estate data

### 🌙 Space Exploration
- **Travel to the Moon** - Click the moon to travel there
- **Apollo 11 Landing Site** - Visit the historic landing site with American flag
- **Star Constellations** - Interactive star map with constellation information
- **Realistic Moon Physics** - Low gravity jumping and movement

### 🎨 Advanced Graphics
- **Dynamic Day/Night Cycle** - Realistic lighting and sky colors
- **Weather Effects** - Atmospheric rendering
- **Building Generation** - Procedural 3D buildings from real data
- **Multiple Camera Modes** - 3rd person, 1st person, and overhead views

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection for satellite imagery
- (Optional) API keys for real estate features

### Installation

1. **Download the HTML file**
   ```bash
   # Save world-explorer-complete.html to your computer
   ```

2. **Open in Browser**
   - Simply double-click the HTML file, or
   - Right-click → Open With → Your preferred browser

3. **Configure (Optional)**
   - Click the Settings tab
   - Add API keys for real estate features (see [API Setup Guide](API_SETUP.md))

### First Launch

1. **Select Location**
   - Choose from preset cities, or
   - Search for an address, or
   - Enter GPS coordinates

2. **Choose Game Mode**
   - Free Roam (recommended for first-time players)
   - Time Trial
   - Checkpoints

3. **Click "EXPLORE"**
   - Wait for the world to load (~5-15 seconds)
   - Start exploring!

## 🎮 Controls

### Driving Mode 🚗
| Key | Action |
|-----|--------|
| `W` or `↑` | Accelerate |
| `S` or `↓` | Brake/Reverse |
| `A` or `←` | Turn Left |
| `D` or `→` | Turn Right |
| `Space` | Handbrake |
| `Ctrl` | Boost |
| `Shift` | Off-Road Mode |

### Walking Mode 🚶
| Key | Action |
|-----|--------|
| `↑` / `↓` | Walk Forward/Back |
| `←` / `→` | Strafe Left/Right |
| `A` / `D` | Look Left/Right |
| `W` / `S` | Look Up/Down |
| `Space` | Jump |
| `Shift` | Run (2x speed) |
| `Right Click + Drag` | Mouse Look |

### Drone Mode 🚁
| Key | Action |
|-----|--------|
| `W` / `S` | Move Forward/Back |
| `A` / `D` | Move Left/Right |
| `Space` | Move Up |
| `Shift` / `Ctrl` | Move Down |
| `↑` / `↓` | Look Up/Down |
| `←` / `→` | Turn Left/Right |
| `Mouse` | Free Look |

### Universal Controls ⚙️
| Key | Action |
|-----|--------|
| `F` | Toggle Walk/Drive Mode |
| `6` | Toggle Drone Mode |
| `C` | Cycle Camera View |
| `V` | Look Back |
| `M` | Toggle Map |
| `N` | Next City (Teleport) |
| `R` | Record/Stop Track |
| `Esc` | Pause Menu |

### Mouse Controls 🖱️
| Action | Function |
|--------|----------|
| `Click Moon` | Travel to Moon |
| `Click Stars` | View Constellation Info |
| `Right Click Map` | Teleport to Location |
| `Left Click Map` | View Property/POI Info |
| `Click Apollo 11 Flag` | View Mission Info (on Moon) |

## 📋 System Requirements

### Minimum
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **RAM**: 4 GB
- **GPU**: Integrated graphics
- **Internet**: 5 Mbps for map data

### Recommended
- **Browser**: Latest Chrome or Firefox
- **RAM**: 8 GB or more
- **GPU**: Dedicated graphics card
- **Internet**: 25 Mbps or faster

### Mobile Support
- Optimized for tablets and smartphones
- Touch controls supported
- Reduced graphics for better performance

## 🔧 Configuration

### API Keys (Optional)

For real estate features, you'll need API keys from:

1. **Rentcast API** ([rentcast.io](https://www.rentcast.io))
   - Property rental estimates
   - Market data

2. **Attom API** ([attomdata.com](https://www.attomdata.com))
   - Property details
   - School information

3. **Estated API** ([estated.com](https://estated.com))
   - Property values
   - Owner information

See [API_SETUP.md](API_SETUP.md) for detailed configuration instructions.

### Custom Locations

Add your own locations by:
1. Finding GPS coordinates online (from any mapping service)
2. Entering them in the Settings tab
3. Clicking "Search Location"

## 🗺️ Available Cities

- **Baltimore**, Maryland, USA
- **New York City**, New York, USA
- **Miami**, Florida, USA
- **Las Vegas**, Nevada, USA
- **Hollywood**, California, USA
- **Tokyo**, Japan
- **London**, United Kingdom
- **Paris**, France
- **Dubai**, UAE
- **Monaco**, Monte Carlo
- **Nürburgring**, Germany

## 🎯 Game Modes

### Free Roam
Explore at your own pace with no time limits or objectives. Perfect for sightseeing and discovering hidden locations.

### Time Trial
Race against the clock to reach a random destination. The faster you arrive, the higher your score.

### Checkpoint Challenge
Collect all checkpoints scattered across the map. Find the optimal route to maximize your score.

## 🌟 Advanced Features

### Track Recording
- Press `R` to start/stop recording your route
- Playback recorded tracks
- Share routes with others

### Real Estate Mode
- Toggle in Settings or with floating menu
- 3D markers show property locations
- Click properties for detailed information
- Filter by price, type, and features

### Map System
- Press `M` to open the large map
- Zoom in/out with `+`/`-` buttons
- Toggle roads/land-use/property layers
- Right-click to teleport anywhere
- View legend for marker meanings

### Historic Sites
- Toggle historic site markers
- Learn about important locations
- Special markers on the map

## 📱 Mobile Controls

### Touch Controls
- **Single Touch Drag**: Look around
- **Two Finger Pinch**: Zoom (map)
- **Tap**: Select/Interact

### Floating Menu
Access quick actions:
- 🌍 Exploration - POIs and navigation
- 🏘️ Real Estate - Property browser
- 🎮 Game Mode - Start challenges
- 🌿 Environment - Map layers and settings

## 🐛 Known Issues

1. **Performance on Older Devices**: May experience lag on devices >5 years old
2. **Map Tile Loading**: Can take 5-15 seconds on slow connections
3. **Real Estate Data**: Requires valid API keys and may have coverage gaps
4. **Mobile Graphics**: Some visual effects disabled for performance

## 🔮 Future Roadmap

- [ ] Multiplayer support
- [ ] Vehicle customization
- [ ] More game modes (Tag, Hide & Seek, Racing)
- [ ] Weather system (rain, snow, fog)
- [ ] Day/night cycle control
- [ ] VR/AR support
- [ ] More cities and locations
- [ ] Mission system with rewards
- [ ] Traffic simulation
- [ ] Pedestrian AI

## 🛠️ Technical Stack

- **Three.js** (r128) - 3D graphics engine
- **OpenStreetMap** - Map data and tiles
- **Real Estate APIs** - Rentcast, Attom, Estated
- **Vanilla JavaScript** - No frameworks
- **HTML5 Canvas** - 2D map rendering
- **CSS3** - Modern UI styling

## 📚 Additional Documentation

- [API Setup Guide](API_SETUP.md) - Detailed API configuration
- [User Guide](USER_GUIDE.md) - Complete feature walkthrough
- [Technical Documentation](TECHNICAL_DOCS.md) - Architecture and code structure
- [Changelog](CHANGELOG.md) - Version history
- [Acknowledgements](ACKNOWLEDGEMENTS.md) - Third-party credits and licenses

## 🤝 Contributing

This is proprietary software. Contributions are only accepted under specific legal agreements.

Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Contributor License Agreement (CLA) requirements
- Non-Disclosure Agreement (NDA) requirements
- Development process
- Coding standards

**Important**: All contributions become the exclusive property of World Explorer 3D. Contact sreid1118@gmail.com to begin the contribution process.

**GitHub**: RRG314

## 📄 License & Copyright

**Copyright © 2026 World Explorer 3D. All Rights Reserved.**

This is proprietary software. No part of this software may be reproduced, modified, distributed, or used without explicit written permission from the copyright holder.

See the [LICENSE](LICENSE) file for complete terms and conditions.

### Third-Party Acknowledgements

This software incorporates the following third-party components:
- **Three.js** - MIT License © 2010-2023 three.js authors
- **OpenStreetMap** - Open Database License (ODbL) © OpenStreetMap contributors
- **Google Fonts** - Open Font License (Inter, Poppins, Orbitron, Righteous)
- **Real Estate APIs** - Rentcast, Attom, Estated (subject to their respective terms)

All third-party components are used in accordance with their respective licenses. The use of these components does not grant any rights to the proprietary portions of this software.

## 🙏 Credits

### APIs & Services
- OpenStreetMap
- Rentcast API
- Attom Data Solutions
- Estated API

### Libraries
- Three.js by Mr.doob and contributors
- Google Fonts (Inter, Poppins, Orbitron, Righteous)

### Inspiration
- Google Earth
- Flight Simulator series
- Grand Theft Auto series
- Minecraft

## 🙏 Acknowledgements

This software would not be possible without the following third-party components and services. See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for complete details and license information.

### Core Technologies
- **Three.js** (MIT License) - © 2010-2023 three.js authors
- **OpenStreetMap** (ODbL) - © OpenStreetMap contributors

### Fonts
- **Inter** - © 2020 The Inter Project Authors (OFL)
- **Poppins** - © 2020 Indian Type Foundry (OFL)
- **Orbitron** - © 2018 The Orbitron Project Authors (OFL)
- **Righteous** - © 2011 The Righteous Project Authors (OFL)

### Data Providers
- **Rentcast API** - Real estate data
- **Attom Data Solutions** - Property information
- **Estated API** - Market data
- **NASA** - Apollo 11 public domain materials

**Required Attribution**: "Powered by Three.js (MIT License) | Map data © OpenStreetMap contributors"

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for full third-party license texts and attribution requirements.

## 📞 Support

For issues, questions, or licensing inquiries:
- Open an issue on GitHub
- Check the [User Guide](USER_GUIDE.md)
- Review [Known Issues](#-known-issues)

## ⚠️ Disclaimer

**PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**

This software is provided "as is" without warranty of any kind. The copyright holder is not responsible for:
- Accuracy of real estate data (provided by third-party APIs)
- Availability of third-party services (OpenStreetMap, Real Estate APIs)
- Performance on specific hardware configurations
- Any damages or losses resulting from use

Map data is provided by OpenStreetMap contributors and is subject to the Open Database License (ODbL). Real estate data is provided by third-party APIs and may not be current or accurate. Always verify information independently for important decisions.

**Usage Restrictions**: This software may not be copied, modified, distributed, or used for commercial purposes without explicit written permission from the copyright holder.

**Third-Party Services**: Users must comply with all applicable third-party terms of service, including OpenStreetMap ODbL and Real Estate API Terms.

**Contact**: sreid1118@gmail.com | **GitHub**: RRG314

---

**Made with Three.js** | Version 1.0.0 | Last Updated: February 2026

**Copyright © 2026 World Explorer 3D. All Rights Reserved.**

Powered by Three.js (MIT License) | Map data © OpenStreetMap contributors
