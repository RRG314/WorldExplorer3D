# User Guide 📖

Complete guide to using World Explorer 3D. Learn every feature, control, and secret.

## Table of Contents
- [Getting Started](#getting-started)
- [Game Modes](#game-modes)
- [Movement Systems](#movement-systems)
- [Camera Controls](#camera-controls)
- [Map System](#map-system)
- [Real Estate Features](#real-estate-features)
- [Space Exploration](#space-exploration)
- [Advanced Features](#advanced-features)
- [Tips & Tricks](#tips--tricks)
- [FAQ](#faq)

## Getting Started

### First Launch

1. **Open the Application**
   - Start a local server in the repo root (`python -m http.server 8000`)
   - Open `http://localhost:8000` in your browser

2. **Main Menu Appears**
   - You'll see tabs: Location, Settings, Controls
   - The logo and tagline at the top

3. **Choose Your Location**
   - **Preset Cities**: Click any city card (Baltimore is selected by default)
   - **Search Address**: Enter an address in the search box
   - **Custom Coordinates**: Enter latitude and longitude

4. **Choose Launch Mode (Top of Location Tab)**
   - **Earth**: Standard city/world start
   - **Moon**: Start directly in lunar environment
   - **Space**: Start in space-flight mode

5. **Select Game Mode**
   - Free Roam (recommended for first time)
   - Time Trial
   - Checkpoints

6. **Click "EXPLORE"**
   - The world begins loading
   - Satellite imagery downloads
   - Buildings and terrain generate
   - Wait 5-15 seconds depending on connection

7. **Start Exploring!**
   - You spawn in a car
   - Drive around and discover the city

### Interface Overview

#### HUD (Head-Up Display)
Located in top-left corner:
- **Speed**: Current MPH
- **Speed Limit**: Current road's speed limit
- **Boost Bar**: Shows available boost energy
- **Street Name**: Current street/location
- **Indicators**: BRK (braking), BOOST (boosting), DRIFT (drifting), OFF (off-road)

#### Minimap
Located in bottom-left corner:
- Shows nearby area
- Blue arrow = your position/direction
- Red circle = destination (in timed modes)
- Green dots = checkpoints
- Gray = roads, green = parks

#### Coordinates Display
Shows your current GPS position (lat/lon)

#### Controls Tab
Click header to expand/collapse in-game controls reference (includes driving, walking, drone, and space-flight controls)

## Game Modes

### Free Roam 🚗

**Perfect for**: First-time players, sightseeing, relaxation

**Description**: Explore the city with no time limits or objectives. Drive, walk, or fly anywhere.

**Features**:
- No timer or score
- No restrictions
- Full access to all features
- Moon travel enabled
- Real estate browsing

**Tips**:
- Take your time discovering landmarks
- Try different camera angles
- Experiment with all movement modes
- Visit the moon at night

### Time Trial ⏱️

**Perfect for**: Speed challenges, learning city layouts

**Description**: Race to reach a random destination as fast as possible.

**How It Works**:
1. Game spawns you at a random location
2. Red marker shows destination
3. Timer starts immediately
4. Navigate to the destination
5. Timer stops when you arrive
6. Score based on time

**Features**:
- Random destinations each round
- Visible destination marker
- Timer display
- Best time tracking
- Multiple difficulty levels (based on distance)

**Tips**:
- Use the map (M key) to plan route
- Boost on straightaways
- Cut through parks if allowed
- Learn shortcuts

**Scoring**:
- Under 1 minute: ⭐⭐⭐⭐⭐
- 1-2 minutes: ⭐⭐⭐⭐
- 2-3 minutes: ⭐⭐⭐
- 3-5 minutes: ⭐⭐
- Over 5 minutes: ⭐

### Checkpoint Challenge 🏁

**Perfect for**: Completionists, exploration with purpose

**Description**: Collect all checkpoints scattered across the map.

**How It Works**:
1. Multiple checkpoints spawn around the city
2. Green markers show locations
3. Drive/walk through checkpoints to collect them
4. Timer tracks total time
5. Collect all to complete the challenge

**Features**:
- 10-20 checkpoints per session
- Visible on minimap and in-world
- Checkpoints disappear when collected
- Counter shows progress (e.g., "5/15")
- No specific order required

**Tips**:
- Open map to see all checkpoint locations
- Plan an efficient route
- Use drone mode for hard-to-reach checkpoints
- Some checkpoints may be on rooftops

**Scoring**:
- Based on time to collect all
- Bonus for collecting in order (if nearby)
- Penalties for crashes/resets

## Movement Systems

### Driving Mode 🚗

**Default starting mode**. Control a car to explore the city.

#### Controls
- `W` / `↑` - Gas pedal (accelerate)
- `S` / `↓` - Brake / Reverse
- `A` / `←` - Turn left (while moving)
- `D` / `→` - Turn right (while moving)
- `Space` - Handbrake (drift/emergency stop)
- `Ctrl` - Boost (when bar is filled)
- `Shift` - Off-road mode toggle

#### Physics
- **Realistic handling**: Car has momentum and turning radius
- **Drift system**: Hold space while turning
- **Boost system**: Fills automatically over time
- **Off-road**: Slower on grass/dirt unless in off-road mode
- **Collisions**: Can bump into buildings (car respawns)

#### Tips
- Hold boost for straightaways
- Tap brake before sharp turns
- Use handbrake for 90° corners
- Off-road mode helps on unpaved surfaces
- Speed limit is shown but not enforced

#### HUD Indicators
- **BRK**: Lit when braking
- **BOOST**: Lit when boosting
- **DRIFT**: Lit when drifting
- **OFF**: Lit in off-road mode

### Walking Mode 🚶

**Toggle with F key**. Explore on foot with first-person view.

#### Controls
- `↑` - Walk forward
- `↓` - Walk backward
- `←` - Strafe left
- `→` - Strafe right
- `W` - Look up
- `S` - Look down
- `A` - Look left
- `D` - Look right
- `Space` - Jump
- `Shift` - Run (2x speed)
- `Right Click + Drag` - Free look with mouse

#### Movement
- **Walking speed**: ~3 mph
- **Running speed**: ~6 mph (hold Shift)
- **Jump height**: ~6 feet
- **Jump on moon**: ~36 feet (low gravity!)

#### Tips
- Use mouse look for easier camera control
- Hold Shift to run
- Jump to climb over small obstacles
- Great for exploring interiors and tight spaces
- Can walk up gentle slopes

#### When to Use
- Exploring buildings up close
- Finding hidden checkpoints
- Moon exploration (low gravity jumping!)
- Taking screenshots
- Investigating property details

### Drone Mode 🚁

**Toggle with 6 key**. Fly freely through the air.

#### Controls
- `W` - Move forward
- `S` - Move backward
- `A` - Strafe left
- `D` - Strafe right
- `Space` - Fly up
- `Shift` - Fly down
- `Ctrl` - Fly down (alternative)
- `↑` - Look up
- `↓` - Look down
- `←` - Turn left
- `→` - Turn right
- `Mouse` - Free look

#### Movement
- **Fly speed**: ~20 mph
- **Vertical speed**: ~15 mph
- **No gravity**: Free flight in any direction
- **No collisions**: Can fly through buildings
- **Unlimited range**: Fly anywhere

#### Tips
- Perfect for aerial photography
- Use to reach high checkpoints
- Scout routes from above
- Explore rooftops
- Find hidden areas

#### When to Use
- Collecting elevated checkpoints
- Surveying the city layout
- Taking aerial screenshots
- Reaching inaccessible areas
- Quick transportation

### Mode Switching

| From | To | Key | Note |
|------|----|----|------|
| Driving | Walking | `F` | Car remains at location |
| Walking | Driving | `F` | Teleports back to car |
| Any | Drone | `6` | Position saved |
| Drone | Previous | `6` | Returns to saved position |

## Camera Controls

### Camera Modes

Press `C` to cycle through modes:

#### 1. Third Person (Default)
- Camera behind and above vehicle/character
- Best for driving and general exploration
- Good situational awareness

#### 2. First Person
- Inside the car or character's eyes
- Most immersive view
- Best for realism

#### 3. Overhead
- Bird's eye view from above
- Best for navigation and orientation
- Good for seeing checkpoints

### Look Back

- Press and hold `V` to look behind you
- Useful while driving in reverse
- Helps avoid rear collisions

### Mouse Look (Walking/Drone)

- **Right-click and drag**: Free camera movement
- **Sensitivity**: Adjustable in code
- **Works in**: Walking and Drone modes only

## Map System

### Opening the Map

- Press `M` to open/close the large map
- Shows entire city area
- Real-time position tracking

### Map Features

#### Your Position
- **Blue arrow**: Shows your location and facing direction
- **Updates in real-time**: Moves as you move

#### Map Layers

Toggle in the legend (📋 button):
- **Satellite**: Aerial imagery
- **Roads**: Street overlay
- **Land Use**: Parks, water, zones
- **Properties**: Real estate markers (if enabled)
- **POIs**: Points of interest
- **Historic Sites**: Historic markers

#### Controls
- **Zoom In**: Click + button or mouse wheel
- **Zoom Out**: Click - button or mouse wheel
- **Zoom level**: Shown in corner (10-18)
- **Pan**: Click and drag

#### Interactive Elements

**Right-Click on Map**:
- Teleports you to that location
- Car/character respawns there
- Instant travel

**Left-Click on Marker**:
- Properties: View property details
- POIs: View location information
- Historic sites: View historical facts

### Map Legend

Open with 📋 button:

| Symbol | Meaning |
|--------|---------|
| 🏢 Green | Properties for sale |
| 🏢 Blue | Properties for rent |
| 📍 Red | Points of interest |
| 🏛️ Purple | Historic sites |
| 🚩 Red | Destination (Time Trial) |
| ✓ Green | Checkpoints |

### Tips
- Use map to plan routes
- Right-click teleport saves time
- Check legend for marker meanings
- Zoom in to see street names
- Toggle layers to reduce clutter

## Real Estate Features

### Enabling Real Estate Mode

1. **In Main Menu**:
   - Settings tab → Enable Real Estate Features
   
2. **In-Game**:
   - Float menu → 🏘️ Real Estate button

3. **Requirements**:
   - At least one API key configured
   - In a supported location (USA cities)

### Viewing Properties

#### In 3D World
- Green/blue markers float above buildings
- Green = For Sale
- Blue = For Rent
- Walk/drive near a property
- Property panel automatically opens

#### On Map
- Properties shown as markers
- Click marker to view details
- Colors indicate sale/rent status

### Property Panel

Shows detailed information:

**Basic Info**:
- Address
- Property type (house, condo, apartment)
- Status (for sale/rent)

**Pricing**:
- Sale price or monthly rent
- Price per square foot
- Market value estimate

**Details**:
- Bedrooms and bathrooms
- Square footage
- Lot size
- Year built

**Additional**:
- School ratings
- Crime data
- Nearby amenities
- Property history

### Property Search

Use the Float Menu → Real Estate:

**Filters**:
- Price range
- Property type
- Number of bedrooms
- Square footage
- Neighborhood

**Actions**:
- View on map
- Navigate to property
- Save favorites (if implemented)
- Compare properties

### Tips
- Use filters to reduce marker clutter
- Check multiple APIs for best data
- Property data may not be available for all buildings
- Right-click map near property to inspect area

## Space Exploration

### Launch Options

You can enter space systems in three ways:

1. **Earth launch**: Start on Earth and travel naturally.
2. **Moon launch**: Start directly on the moon.
3. **Space launch**: Start directly in space flight.

### Traveling to the Moon

#### How to Travel
1. **Look at the sky**: Night time is best
2. **Find the moon**: Large white sphere
3. **Click on it**: Left-click directly on the moon
4. **Watch the journey**: Automatic cinematic flight

#### Requirements
- Must be on Earth (not already on moon)
- Moon must be visible in sky
- Not in menu/paused

### Moon Environment

#### Features
- **Low Gravity**: Jump 6x higher than Earth
- **Gray Terrain**: Moon-like rocky surface
- **Starry Sky**: Clear view of stars
- **Apollo 11 Landing Site**: Historic location

#### Movement
- **Walking recommended**: Best way to explore
- **Jumping**: Press Space to jump very high
- **Running**: Hold Shift for faster movement
- **Drone mode**: Works normally

### Apollo 11 Landing Site

#### Finding It
- Located near center of landing area
- Look for American flag
- Flag is quite large and visible

#### Interaction
1. **Walk towards the flag**
2. **Click on the flag**: Left-click when close
3. **Information panel opens**: Mission details

#### Mission Information
- Launch date: July 16, 1969
- Landing date: July 20, 1969
- Astronauts: Neil Armstrong, Buzz Aldrin, Michael Collins
- Mission duration: 8 days, 3 hours
- Famous quote included
- Historical context

### Star Constellations

#### Viewing Stars
- **Night time**: Stars visible in sky
- **Better on moon**: Clearer view, no atmosphere
- **Look up**: Point camera towards sky

#### Interaction
1. **Click on a bright star**
2. **Constellation highlights**: Stars in the constellation glow
3. **Information panel**: Shows constellation details

#### Available Constellations
- Orion
- Ursa Major (Big Dipper)
- Ursa Minor (Little Dipper)
- Cassiopeia
- And many more!

### Space Flight Controls

When in space-flight mode:

- `Arrow Keys` - Steer rocket (yaw/pitch)
- `Space` - Thrust / boost
- `Shift` - Brake / decelerate
- `LAND ON ...` button - Land when near a valid body

### Solar System Objects

You can click objects in space to inspect details:

- Planets
- Named asteroids
- Spacecraft
- Galaxies (deep-sky catalog)

### Belts and Deep-Sky Layers

- **Main Asteroid Belt** between Mars and Jupiter
- **Kuiper Belt** beyond Neptune
- **Galaxies** are shown as distant background targets in real sky directions (RA/Dec placement)

### Returning to Earth

**Two Methods**:

1. **UI Buttons**:
   - Look for "Return to Earth" buttons
   - Click to teleport back

2. **Navigation**:
   - Press `N` key (Next City)
   - Teleports back to Earth

**Your Car**:
- Returns to same location you left it
- All progress saved

### Tips
- Visit moon at night for best visibility
- Low gravity jumping is fun!
- Try finding all visible constellations
- Take screenshots of Earth from the moon
- Experiment with drone mode on the moon

## Advanced Features

### Track Recording

#### Recording a Track
1. Press `R` to start recording
2. Drive your route
3. Press `R` again to stop
4. Track is saved

#### Features
- Records exact path taken
- Saves speed at each point
- Includes mode (driving/walking/drone)
- Can replay later

#### Uses
- Save favorite routes
- Share paths with others
- Remember scenic drives
- Document exploration

### Off-Road Mode

#### Activation
- Press and hold `Shift` while driving
- "OFF" indicator lights up
- Better handling on unpaved terrain

#### Benefits
- Faster on grass and dirt
- Reduced speed penalty
- Better traction
- Can cut across parks

#### When to Use
- Shortcuts through parks
- Exploring rural areas
- Time trials with off-road routes
- When roads are too slow

### HUD Information

#### Speed Indicator
- Shows current speed in MPH
- Updates in real-time
- Works in all modes

#### Speed Limit
- Shows current road's speed limit
- Updates as you change roads
- Not enforced (no penalties)

#### Street Names
- Shows current street name
- Updates as you move
- Helps with navigation

### Teleportation

#### Next City (N key)
- Instantly moves to next preset city
- Cycles through all available cities
- Useful for quick travel

#### Map Right-Click
- Teleport to exact coordinates
- Most precise method
- Works anywhere visible on map

### Float Menu

Located on right side of screen:

**Buttons**:
1. **🌍 Exploration**: 
   - POI browser
   - Navigation tools
   - Location search

2. **🏘️ Real Estate**:
   - Property browser
   - Filters and search
   - Market analysis

3. **🎮 Game Mode**:
   - Start challenges
   - View high scores
   - Mode selection

4. **🌿 Environment**:
   - Weather controls (if available)
   - Time of day
   - Map layers

### Pause Menu

Press `Esc` to pause:

**Options**:
- Resume
- Change Settings
- Restart
- Exit to Menu

**Settings Available**:
- Graphics quality
- Control sensitivity
- Audio volume (if implemented)
- API configuration

## Tips & Tricks

### General Tips

1. **Start with Free Roam**: Learn controls before trying timed modes
2. **Check Controls Tab**: Reference controls in main menu
3. **Use Map Frequently**: Press M often for orientation
4. **Try All Modes**: Each offers unique experience
5. **Explore at Night**: Different atmosphere and moon is visible

### Driving Tips

1. **Boost Management**: Don't waste boost on turns
2. **Drift Corners**: Handbrake helps tight turns
3. **Speed Limit**: Informational only, go faster if needed
4. **Off-Road**: Remember Shift for better grass/dirt handling
5. **Camera Angle**: Switch views (C) for better visibility

### Navigation Tips

1. **Minimap**: Always visible in corner
2. **Street Names**: Help confirm location
3. **Landmarks**: Note memorable buildings
4. **Map Zoom**: Zoom in for street-level detail
5. **Right-Click Teleport**: Saves time in Free Roam

### Challenge Tips

1. **Time Trial**: Use map to plan route before starting
2. **Checkpoints**: Get the closest ones first
3. **Drone Mode**: Great for hard-to-reach checkpoints
4. **Practice**: Learn city layout in Free Roam first
5. **Shortcuts**: Look for paths through parks

### Performance Tips

1. **Close Other Tabs**: Free up RAM
2. **Lower Graphics**: If experiencing lag
3. **Reduce Map Layers**: Toggle off unnecessary ones
4. **Limit Properties**: Use price filters
5. **Restart Browser**: If performance degrades

### Exploration Tips

1. **Walk Around**: Get out of car to see details
2. **Visit Rooftops**: Use drone mode
3. **Check Properties**: Interesting real estate data
4. **Look for Easter Eggs**: Hidden surprises
5. **Visit Different Times**: Day/night differences

### Moon Tips

1. **Jump High**: Low gravity is fun!
2. **Find the Flag**: Historic Apollo 11 site
3. **Look at Earth**: Beautiful view
4. **Try Drone Mode**: Fly on the moon
5. **Click Stars**: Learn constellations

## FAQ

### General Questions

**Q: Do I need an internet connection?**
A: Yes, for satellite imagery and real estate data.

**Q: Does it work on mobile?**
A: Yes, optimized for tablets and phones with touch controls.

**Q: Can I save my progress?**
A: Game state is not saved between sessions currently.

**Q: Is it multiplayer?**
A: Not yet, but planned for future updates.

**Q: Can I add custom cities?**
A: Yes, enter any GPS coordinates in Settings.

### Technical Questions

**Q: Why is loading slow?**
A: Depends on internet speed. Satellite images are large files.

**Q: The game is laggy, what do I do?**
A: Close other tabs, reduce graphics quality, use fewer map layers.

**Q: Can I run this offline?**
A: No, requires internet for map data.

**Q: What browsers are supported?**
A: Chrome, Firefox, Safari, Edge (latest versions recommended).

**Q: Can I modify the code?**
A: Yes. It is a no-build static site with `index.html`, `styles.css`, and modular files in `js/`. See [Technical Documentation](TECHNICAL_DOCS.md).

### Gameplay Questions

**Q: How do I win?**
A: Free Roam has no win condition. Timed modes score based on time.

**Q: Can I fly a plane?**
A: Drone mode is similar to flying.

**Q: Where is the Apollo 11 flag?**
A: On the moon, near the center of the landing area.

**Q: How do I get off the moon?**
A: Press N or click "Return to Earth" button.

**Q: Why can I click galaxies in space?**
A: Galaxies are selectable deep-sky objects with info panels for visual guidance and educational context.

**Q: Why can't I jump in driving mode?**
A: Cars can't jump. Switch to walking mode (F key).

### Real Estate Questions

**Q: Why aren't properties showing?**
A: Ensure Real Estate Mode is enabled and API keys are configured.

**Q: Do I need all three API keys?**
A: No, any one will work. Multiple APIs provide better coverage.

**Q: Why is property data missing?**
A: APIs may not have data for all properties or areas.

**Q: Is the property data accurate?**
A: Data is from third-party APIs. Always verify independently.

**Q: Can I buy properties through the app?**
A: No, this is for viewing data only.

### Controls Questions

**Q: Can I customize controls?**
A: Not in the UI currently. Can modify code directly.

**Q: Why isn't mouse look working?**
A: Only works in Walking and Drone modes. Use right-click and drag.

**Q: How do I change camera?**
A: Press C to cycle through views.

**Q: What does the V key do?**
A: Look behind you (hold key).

**Q: Can I use a gamepad?**
A: Not currently supported.

### Troubleshooting

**Q: Nothing happens when I click EXPLORE**
A: Check browser console for errors. May need to allow popups.

**Q: Properties aren't clickable**
A: Make sure Real Estate Mode is enabled in Settings.

**Q: Map won't open**
A: Press M key or click map button in float menu.

**Q: I'm stuck in a building**
A: Right-click map to teleport out, or press N for next city.

**Q: Car disappeared**
A: Press F twice (walk mode then back to drive).

## Keyboard Reference Card

Quick reference for all controls:

### Movement
| Key | Action |
|-----|--------|
| W/↑ | Forward/Gas |
| S/↓ | Back/Brake |
| A/← | Left/Turn Left |
| D/→ | Right/Turn Right |
| Space | Handbrake/Jump/Up |
| Shift | Run/Off-Road/Down |
| Ctrl | Boost/Down |

### Mode & View
| Key | Action |
|-----|--------|
| F | Toggle Walk/Drive |
| 6 | Toggle Drone |
| C | Cycle Camera |
| V | Look Back |

### Navigation
| Key | Action |
|-----|--------|
| M | Toggle Map |
| N | Next City |
| R | Record Track |
| Esc | Pause |

### Space Flight
| Key | Action |
|-----|--------|
| Arrow Keys | Rocket steering (yaw/pitch) |
| Space | Thrust / Boost |
| Shift | Brake / Decelerate |
| LAND ON button | Attempt landing when in range |

### Mouse
| Action | Function |
|--------|----------|
| Right Click + Drag | Camera Look |
| Click Moon | Travel to Moon |
| Click Star | View Constellation |
| Click Planet/Asteroid/Spacecraft/Galaxy | Open space inspector info |
| Right Click Map | Teleport |
| Left Click Map | View Info |

---

**Need More Help?** Check the [README](README.md) or [Technical Documentation](TECHNICAL_DOCS.md)

**Last Updated**: February 2026
