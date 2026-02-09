# 🚀 Quick Start Guide

Get World Explorer 3D running in under 2 minutes!

## Option 1: Double-Click (Easiest)

1. Download or clone the repository
2. Open `index.html` in your web browser
3. Select a city and click "START GAME"
4. Drive with **WASD** or **Arrow Keys**

That's it! 🎉

## Option 2: Local Server (Recommended)

For better performance, run a local server:

### Using Python (Built into Mac/Linux)
```bash
cd world-explorer-3d
python -m http.server 8000
```
Then open: http://localhost:8000

### Using Node.js
```bash
cd world-explorer-3d
npx http-server -p 8000
```
Then open: http://localhost:8000

### Using VS Code
1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

## 🎮 First Steps

### 1. Choose Your Location
- Select from 11 pre-loaded cities
- OR click "🌍 Custom" to enter any location

### 2. Pick a Game Mode
- **Free Roam** - Just explore (recommended for first time)
- **Time Trial** - Race against the clock
- **Checkpoints** - Collect markers around the city

### 3. Learn the Controls
Click the "Controls" tab to see all keys, but here are the basics:
- **W** - Gas
- **S** - Brake
- **A/D** - Steer
- **Space** - Handbrake (for drifting!)

### 4. Try These Fun Features
- Press **Ctrl** for boost 🚀
- Press **6** for drone camera 🚁
- Press **C** to cycle camera views 📷
- Click the floating menu (☰) in bottom-right for more options

## 🚔 Police Mode

1. Start the game
2. Click the floating menu (☰) bottom-right
3. Click "🚔 Police"
4. Speed over the limit to trigger a chase!
5. They won't stop chasing even if you slow down - you must escape!

## 🌍 Exploring Custom Locations

1. Select "🌍 Custom" in location menu
2. Type a city name (e.g., "Tokyo, Japan")
3. Click search 🔍
4. Hit "START GAME"

Or use GPS coordinates from Google Maps!

## ⌨️ Essential Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **W/↑** | Accelerate |
| **S/↓** | Brake/Reverse |
| **A/←** | Turn Left |
| **D/→** | Turn Right |
| **Space** | Handbrake |
| **Ctrl** | Boost |
| **C** | Change Camera |
| **F** | Toggle Walking Mode |
| **6** | Toggle Drone Mode |
| **M** | Show Map |
| **N** | Next City |
| **R** | Record Track |
| **Esc** | Pause |

## 🚀 Space Travel

1. Open the Travel menu from the floating menu (bottom-right)
2. Choose "Direct to Moon" for instant travel or "Rocket to Moon" for the full launch experience
3. In rocket mode, fly freely through the solar system with planets at real orbital positions
4. Land on the Moon and explore the lunar surface
5. Return to Earth when you're ready

## 🌅 Time of Day

Click the time-of-day button in the Explore menu to cycle through: Day, Sunset, Night, and Sunrise. At night you can see the full star field with real constellations!

## 🎯 Pro Tips

1. **Drifting**: Hold **Space** while turning at high speed
2. **Boost Management**: Boost refills over time, use it wisely
3. **Off-Road**: Hold **Shift** to drive off-road with less penalty
4. **Map Navigation**: Click minimap to see full map; right-click to teleport
5. **Track Recording**: Press **R** to record your route
6. **Walking Mode**: Press **F** to get out and walk around on foot
7. **Drone Mode**: Press **6** for a free-flying aerial camera
8. **Consistent Cities**: Procedural building/window/road texture variation is now deterministic per location, so reloading the same city preserves its look
   
## ⚠️ Troubleshooting

### Black Screen?
- Make sure WebGL is enabled in your browser
- Try Chrome or Firefox
- Update your graphics drivers

### Laggy Performance?
- Close other browser tabs
- Lower graphics quality in browser settings
- Try a different browser

### Roads Not Loading?
- Check your internet connection
- Try a different city
- Wait 5-10 seconds for data to load
- Dense urban areas may use adaptive query tuning and can take a bit longer

### Map Not Showing?
- The game loads real map data from the internet
- It may take a few seconds
- Look for the loading spinner

## 🎊 You're Ready!

Start with **Baltimore** in **Free Roam** mode to get a feel for the controls.

Then try enabling **Police Mode** and see if you can outrun them!

Have fun exploring the world! 🌍🚗💨

---

Need more help? Check the full [README.md](README.md) or [open an issue](https://github.com/yourusername/world-explorer-3d/issues).
