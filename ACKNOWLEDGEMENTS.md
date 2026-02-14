# Acknowledgements 🙏

World Explorer 3D acknowledges and thanks the following third-party projects, services, and individuals that made this software possible.

---

## Third-Party Software Components

### Three.js - 3D Graphics Library

**Version**: r128  
**License**: MIT License  
**Copyright**: © 2010-2023 three.js authors  
**Website**: https://threejs.org/  
**Repository**: https://github.com/mrdoob/three.js/

**What We Use It For**: 
- 3D scene rendering
- WebGL abstraction layer
- Geometry and mesh creation
- Material system
- Camera controls
- Lighting system

**License Text**:
```
MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Special Thanks To**:
- Mr.doob (Ricardo Cabello) - Creator and lead maintainer
- Three.js community and contributors
- WebGL working group

---

## Cloud Services & APIs

### OpenStreetMap

**Copyright**: © OpenStreetMap contributors  
**License**: Open Database License (ODbL) 1.0  
**Website**: https://www.openstreetmap.org/  
**Copyright**: https://www.openstreetmap.org/copyright

**What We Use It For**:
- Base map tiles and imagery
- Geographic features and boundaries
- Road and street data
- Points of interest (POI) data
- Building footprints
- Natural features

**Attribution**: © OpenStreetMap contributors

**License Summary**:
OpenStreetMap® is open data, licensed under the Open Data Commons Open Database 
License (ODbL) by the OpenStreetMap Foundation (OSMF).

You are free to copy, distribute, transmit and adapt the data, as long as you 
credit OpenStreetMap and its contributors. If you alter or build upon the data, 
you may distribute the result only under the same license.

**Important Notes**:
- Attribution required in all implementations: "© OpenStreetMap contributors"
- Data is community-contributed and continuously updated
- Free to use for commercial applications with attribution
- Derivative data must be shared under ODbL if distributed
- Using data in proprietary software (as done here) is permitted

**Community**:
OpenStreetMap is built by a community of mappers that contribute and maintain 
data about roads, trails, cafés, railway stations, and much more, all over the world.

### Rentcast API

**Copyright**: © Rentcast  
**Website**: https://www.rentcast.io  
**Documentation**: https://developers.rentcast.io/docs

**What We Use It For**:
- Property rental estimates
- Property value estimates
- Rental market data
- Comparative market analysis

**Important Notes**:
- Requires API key
- Subject to Rentcast Terms of Service
- Free tier available with limitations
- Data accuracy not guaranteed by World Explorer 3D

### Attom Data Solutions API

**Copyright**: © Attom Data Solutions  
**Website**: https://www.attomdata.com  
**Documentation**: https://api.gateway.attomdata.com/propertyapi/v1.0.0/

**What We Use It For**:
- Detailed property information
- Property sales history
- Tax assessment data
- School information
- Neighborhood data

**Important Notes**:
- Requires API key
- Subject to Attom Terms of Service
- Trial period available
- Premium service with various tiers

### Estated API

**Copyright**: © Estated  
**Website**: https://estated.com  
**Documentation**: https://estated.com/developers/docs

**What We Use It For**:
- Property valuations
- Owner information
- Property characteristics
- Market values

**Important Notes**:
- Requires API key
- Subject to Estated Terms of Service
- Free tier available
- Data updated regularly

---

## Fonts & Typography

All fonts used under the SIL Open Font License (OFL), Version 1.1

### Inter Font Family

**Copyright**: © 2020 The Inter Project Authors  
**License**: SIL Open Font License 1.1  
**Designer**: Rasmus Andersson  
**Website**: https://rsms.me/inter/  
**Repository**: https://github.com/rsms/inter

**Weights Used**: 400, 500, 600, 700

**What We Use It For**:
- Primary UI text
- Body copy
- Labels and descriptions

### Poppins Font Family

**Copyright**: © 2020 Indian Type Foundry  
**License**: SIL Open Font License 1.1  
**Designers**: Indian Type Foundry, Jonny Pinhorn  
**Website**: https://fonts.google.com/specimen/Poppins

**Weights Used**: 400, 500, 600, 700

**What We Use It For**:
- Headings and titles
- Menu items
- Button text

### Orbitron Font Family

**Copyright**: © 2018 The Orbitron Project Authors  
**License**: SIL Open Font License 1.1  
**Designer**: Matt McInerney  
**Website**: https://fonts.google.com/specimen/Orbitron

**Weights Used**: 500, 700, 900

**What We Use It For**:
- Futuristic UI elements
- HUD displays
- Technical readouts
- Map interface

### Righteous Font

**Copyright**: © 2011 The Righteous Project Authors  
**License**: SIL Open Font License 1.1  
**Designer**: Astigmatic  
**Website**: https://fonts.google.com/specimen/Righteous

**Weights Used**: 400

**What We Use It For**:
- Logo and branding
- Special titles
- Emphasis text

**Font Service**: Google Fonts  
**Website**: https://fonts.google.com/

---

## Data Sources

### Geographic & Cartographic Data

**OpenStreetMap**
- Copyright: © OpenStreetMap contributors
- License: Open Database License (ODbL) 1.0
- Website: https://www.openstreetmap.org/
- Used for: Map tiles, roads, POIs, building data, geographic features

**Natural Earth Data**
- Public domain
- Website: https://www.naturalearthdata.com/
- Used for: Country boundaries, coastlines, natural features

### Astronomical Data

**NASA**
- Public domain materials
- Apollo 11 mission information
- Historical photographs and data
- Website: https://www.nasa.gov/

**International Astronomical Union (IAU)**
- Constellation information
- Star naming conventions
- Public domain astronomical data
- Website: https://www.iau.org/

**Hipparcos Star Catalog** (conceptual use)
- ESA public data
- Star positions and magnitudes
- Website: https://www.cosmos.esa.int/web/hipparcos

---

## First-Party Research Algorithms

World Explorer 3D also includes original deterministic algorithm work by Steven Reid.
These are first-party research components used in the engine (not external third-party dependencies).

### Recursive Division Tree (RDT)

- Reid, S. (2025). *Recursive Division Tree: A Log-Log Algorithm for Integer Depth*. Zenodo.
- DOI: https://doi.org/10.5281/zenodo.18012166
- Used for: deterministic complexity indexing and adaptive runtime behavior

### RGE-256 / RGE256ctr PRNG

- Reid, S. (2025). *RGE-256: A New ARX-Based Pseudorandom Number Generator With Structured Entropy and Empirical Validation*. Zenodo.
- DOI: https://doi.org/10.5281/zenodo.17982804
- Core repository: https://github.com/RRG314/rge256
- Demo application: https://github.com/RRG314/RGE-256-app
- Used for: deterministic seeded pseudo-random generation in procedural systems

---

## Development Tools & Standards

### Web Standards

**World Wide Web Consortium (W3C)**
- HTML5 specification
- CSS3 specification
- Web APIs
- Website: https://www.w3.org/

**Khronos Group**
- WebGL specification
- OpenGL standards
- Website: https://www.khronos.org/

### JavaScript Standards

**ECMAScript (ECMA International)**
- JavaScript language specification
- ES6+ features
- Website: https://www.ecma-international.org/

### Documentation Format

**Markdown**
- CommonMark specification
- GitHub Flavored Markdown
- Website: https://commonmark.org/

---

## Inspiration & References

### Software & Games

**Google Earth**
- By Google LLC
- Inspiration for terrain rendering and exploration
- Pioneer in satellite imagery visualization

**Microsoft Flight Simulator**
- By Microsoft Corporation
- Inspiration for realistic world recreation
- Reference for physics and camera systems

**Grand Theft Auto Series**
- By Rockstar Games
- Inspiration for open-world exploration
- Reference for vehicle physics

**Minecraft**
- By Mojang Studios (Microsoft)
- Inspiration for block-based world building
- Reference for procedural generation

### Academic & Technical References

**Real-Time Rendering**
- By Tomas Akenine-Möller, Eric Haines, Naty Hoffman
- Reference for graphics techniques

**Game Engine Architecture**
- By Jason Gregory
- Reference for system design

**3D Math Primer for Graphics and Game Development**
- By Fletcher Dunn, Ian Parberry
- Reference for mathematical implementations

---

## Community & Support

### Stack Overflow
- Community Q&A for technical problems
- Three.js and WebGL assistance
- Website: https://stackoverflow.com/

### Three.js Community
- Discourse forum
- GitHub discussions
- Community examples and tutorials

### WebGL Community
- IRC channels
- Reddit communities
- Online tutorials and resources

---

## Special Thanks

### Beta Testers
- Early users who provided valuable feedback
- Bug reporters who helped improve stability
- Feature requesters who shaped development

### Documentation Reviewers
- Technical accuracy verification
- Clarity and completeness feedback
- Grammatical corrections

### Educators & Mentors
- Computer graphics professors
- Game development educators
- Open-source community mentors

---

## Legal Notices

### Attribution Requirements

When using World Explorer 3D, the following attributions are **REQUIRED**:

**In-Application Credits**:
```
World Explorer 3D © 2026. All Rights Reserved.
Powered by Three.js (MIT License)
Map data © OpenStreetMap contributors
```

**For Public Demonstrations**:
```
World Explorer 3D - Proprietary Software
© 2026 All Rights Reserved

Built with:
• Three.js (MIT License) - 3D graphics
• OpenStreetMap (ODbL) - Map data
• Rentcast, Attom, Estated - Real estate data
```

### Third-Party Terms

Users of World Explorer 3D must comply with all applicable third-party terms of service, including but not limited to:
- OpenStreetMap Open Database License (ODbL)
- Real Estate API Terms of Service
- Font licenses (OFL)
- Three.js MIT License terms

### Data Accuracy Disclaimer

Real estate data is provided by third-party APIs. World Explorer 3D:
- Does not guarantee accuracy of property information
- Is not responsible for outdated or incorrect data
- Recommends independent verification for any decisions
- Provides data "as is" from API providers

### Map Data

Map data is provided by OpenStreetMap contributors and is:
- Licensed under the Open Database License (ODbL)
- Community-contributed and continuously updated
- Requires attribution: "© OpenStreetMap contributors"
- Free to use with proper attribution

---

## Contribution Acknowledgments

While World Explorer 3D is proprietary software, we acknowledge concepts and techniques learned from:

- Open-source Three.js examples and documentation
- WebGL tutorials and educational resources
- Stack Overflow community answers
- Academic papers on computer graphics
- Game development communities

No code was directly copied from these sources, but they provided valuable learning and reference materials.

---

## Updates & Maintenance

This acknowledgements file is maintained to ensure proper credit is given to all third-party components and contributors. 

**Last Updated**: February 2, 2026  
**Version**: 1.0.0

If you believe your work should be acknowledged and is not listed, please contact:
sreid1118@gmail.com

---

## Closing Statement

World Explorer 3D would not be possible without the incredible work of:
- Three.js team and contributors
- OpenStreetMap community and contributors
- Font designers and foundries
- Data providers
- The broader web development community

Thank you all for your contributions to the technologies and standards that make modern web applications possible.

---

**World Explorer 3D**  
Proprietary Software - All Rights Reserved  
© 2026

For licensing inquiries: sreid1118@gmail.com
