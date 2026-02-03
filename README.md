# World Explorer 3D 🌍

A real-time 3D world exploration platform that combines satellite imagery, interactive gameplay, and immersive experiences. Drive, walk, or fly through realistic recreations of major cities worldwide, travel to the moon, and explore real estate data—all from your browser.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Three.js](https://img.shields.io/badge/three.js-r128-orange.svg)

## ✨ Features

### 🎮 Multiple Exploration Modes
- **Free Roam** - Explore cities at your own pace
- **Time Trial** - Race against the clock to reach destinations
- **Checkpoint Challenge** - Collect markers scattered across the map
- **Walking Mode** - First-person pedestrian exploration with jumping
- **Drone Mode** - Aerial photography and exploration

### 🗺️ Real-World Integration
- **Live Satellite Imagery** - Google Maps integration for photorealistic terrain
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
- **Internet**: 5 Mbps

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
1. Finding GPS coordinates on Google Maps
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
- Toggle satellite/roads/land-use layers
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
2. **Satellite Imagery Loading**: Can take 10-20 seconds on slow connections
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
- **Google Maps API** - Satellite imagery and geocoding
- **Real Estate APIs** - Rentcast, Attom, Estated
- **Vanilla JavaScript** - No frameworks
- **HTML5 Canvas** - 2D map rendering
- **CSS3** - Modern UI styling

## 📚 Additional Documentation

- [API Setup Guide](API_SETUP.md) - Detailed API configuration
- [User Guide](USER_GUIDE.md) - Complete feature walkthrough
- [Technical Documentation](TECHNICAL_DOCS.md) - Architecture and code structure
- [Changelog](CHANGELOG.md) - Version history

## 🤝 Contributing

This is currently a prototype/demo project. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Credits

### APIs & Services
- Google Maps Platform
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

## 📞 Support

For issues, questions, or feedback:
- Open an issue on GitHub
- Check the [User Guide](USER_GUIDE.md)
- Review [Known Issues](#-known-issues)

## ⚠️ Disclaimer

This project is for educational and demonstration purposes. Satellite imagery is provided by Google Maps and is subject to their terms of service. Real estate data is provided by third-party APIs and may not be current or accurate. Always verify information independently for real decisions.

---

**Made with ❤️ and Three.js** | Version 1.0.0 | Last Updated: February 2026
