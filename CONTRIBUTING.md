# Contributing to World Explorer 3D 🤝

Thank you for your interest in contributing! This document provides guidelines for contributing to this **proprietary software project**.

## ⚠️ Important Notice

World Explorer 3D is **proprietary software**. All rights are reserved. By contributing to this project, you agree that:

1. **All contributions become the property of World Explorer 3D**
2. **You assign all rights, title, and interest** in your contributions to the copyright holder
3. **No compensation is guaranteed** unless explicitly agreed upon in writing
4. **Contributions may be used** in any way the copyright holder deems appropriate
5. **You will not redistribute** the software or any portion thereof

If you cannot agree to these terms, please do not contribute.

## Contributor Agreement

Before contributing, you must sign a **Contributor License Agreement (CLA)** that:
- Assigns all intellectual property rights to World Explorer 3D
- Confirms you have the right to contribute the work
- Grants perpetual, irrevocable rights to use your contributions

Contact sreid1118@gmail.com to receive the CLA.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Access](#getting-access)
- [Development Process](#development-process)
- [Contribution Types](#contribution-types)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Legal Requirements](#legal-requirements)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of:
- Experience level
- Background
- Identity
- Location

### Expected Behavior

- Be respectful and considerate
- Welcome newcomers and help them learn
- Accept constructive criticism gracefully
- Focus on what's best for the project
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment or discrimination of any kind
- Trolling or insulting comments
- Personal attacks
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## Getting Access

### Access Requirements

Access to the source code is restricted. To gain access:

1. **Contact the project maintainer** at sreid1118@gmail.com
2. **Sign the Non-Disclosure Agreement (NDA)**
3. **Sign the Contributor License Agreement (CLA)**
4. **Receive authorized access** to the development repository

### Prerequisites

Before requesting access, ensure you have:
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Text editor (VS Code, Sublime, Atom, etc.)
- Basic knowledge of:
  - HTML, CSS, JavaScript
  - Three.js (helpful but not required)
  - Git and GitHub

### Development Setup

1. **Fork the Repository**
   ```bash
   # Click "Fork" button on GitHub
   ```

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/world-explorer-3d.git
   cd world-explorer-3d
   ```

3. **Open the File**
   ```bash
   # Simply open world-explorer-complete.html in your browser
   # No build process needed!
   ```

4. **Make Changes**
   - Edit the HTML file in your text editor
   - Refresh browser to see changes
   - Use browser DevTools for debugging

### Project Structure

Since this is a single-file application:
- All code is in `world-explorer-complete.html`
- CSS is in the `<style>` section
- JavaScript is in the `<script>` section
- HTML structure is in the `<body>`

## Development Process

### Finding Issues

Look for issues labeled:
- `good first issue` - Great for newcomers
- `help wanted` - Need community assistance
- `bug` - Something isn't working
- `enhancement` - New feature requests
- `documentation` - Documentation improvements

### Creating Issues

Before creating an issue:
1. Search existing issues
2. Check if it's already in progress
3. Verify it's reproducible

When creating an issue, include:
- **Title**: Clear, concise description
- **Description**: Detailed explanation
- **Steps to Reproduce** (for bugs)
- **Expected Behavior**
- **Actual Behavior**
- **Browser/OS Information**
- **Screenshots** (if relevant)
- **Console Errors** (if any)

### Issue Labels

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `documentation` | Documentation needs update |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `question` | Further information requested |
| `wontfix` | This will not be worked on |
| `duplicate` | Already reported |

## Pull Request Process

### Before Submitting

1. **Check for existing PRs**: Don't duplicate work
2. **Test thoroughly**: Ensure everything works
3. **Update documentation**: If you changed features
4. **Follow code style**: Maintain consistency

### Submitting a Pull Request

1. **Create a Branch**
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/bug-description
   ```

2. **Make Your Changes**
   - Keep commits focused and atomic
   - Write clear commit messages
   - Test each change

3. **Commit Your Changes**
   ```bash
   git add world-explorer-complete.html
   git commit -m "Add feature: description of feature"
   ```

   Commit message format:
   ```
   Add/Fix/Update: Brief description (50 chars or less)
   
   More detailed explanation if needed. Wrap at 72 characters.
   
   - Bullet points are okay
   - Use present tense ("Add feature" not "Added feature")
   - Reference issues: Fixes #123
   ```

4. **Push to Your Fork**
   ```bash
   git push origin feature/my-new-feature
   ```

5. **Create Pull Request**
   - Go to GitHub
   - Click "New Pull Request"
   - Fill out the template
   - Request review

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
How did you test these changes?

## Screenshots
If applicable

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tested in multiple browsers
```

### Review Process

1. **Automated Checks**: May run in future (linting, etc.)
2. **Maintainer Review**: Code will be reviewed
3. **Feedback**: Address any comments
4. **Approval**: Once approved, will be merged
5. **Merge**: Maintainer will merge the PR

### After Merge

- Your contribution will be in the next release
- You'll be credited in release notes
- Delete your feature branch

## Coding Standards

### JavaScript Style

**Naming Conventions**:
```javascript
// Variables and functions: camelCase
const myVariable = 10;
function myFunction() {}

// Constants: UPPER_CASE
const MAX_SPEED = 35;
const DEFAULT_ZOOM = 15;

// Classes: PascalCase (if added)
class MyClass {}
```

**Code Organization**:
```javascript
// 1. Constants at top
const CONSTANT_VALUE = 100;

// 2. Configuration objects
const config = {
    setting1: value1,
    setting2: value2
};

// 3. State variables
let currentState = 'initial';

// 4. Functions
function myFunction() {
    // Implementation
}

// 5. Event handlers at bottom
document.getElementById('btn').addEventListener('click', handleClick);
```

**Comments**:
```javascript
// Good: Explain WHY, not WHAT
// Reduce speed when off-road to simulate difficult terrain
if (offRoadMode) {
    speed *= 0.7;
}

// Bad: Comment is obvious
// Set speed to 10
speed = 10;
```

**Functions**:
```javascript
// Keep functions focused and small
// Good
function calculateDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// Use meaningful names
function getUserPosition() { /* ... */ }  // Good
function gup() { /* ... */ }              // Bad
```

### CSS Style

**Organization**:
```css
/* 1. Reset/Base styles */
* { margin: 0; padding: 0; }

/* 2. Layout */
.container { display: flex; }

/* 3. Components */
.button { /* styles */ }

/* 4. Utilities */
.hidden { display: none; }

/* 5. Media queries at end */
@media (max-width: 768px) { /* ... */ }
```

**Naming**:
```css
/* Use kebab-case for class names */
.main-menu { }
.property-panel { }

/* Use meaningful names */
.btn-primary { }    /* Good */
.bp { }             /* Bad */
```

### HTML Style

```html
<!-- Use semantic HTML -->
<header>Header content</header>
<nav>Navigation</nav>
<main>Main content</main>
<footer>Footer content</footer>

<!-- Proper indentation -->
<div class="container">
    <div class="row">
        <div class="col">Content</div>
    </div>
</div>

<!-- Meaningful IDs and classes -->
<button id="startBtn" class="btn-primary">Start</button>
```

## Testing

### Manual Testing

Before submitting, test:

**Browsers**:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Devices**:
- [ ] Desktop
- [ ] Tablet
- [ ] Mobile phone

**Features**:
- [ ] All three game modes work
- [ ] All movement systems functional
- [ ] Camera controls work
- [ ] Map system functions
- [ ] API integration works (if modified)
- [ ] No console errors

**Performance**:
- [ ] Maintains 60 FPS on modern hardware
- [ ] No memory leaks
- [ ] Smooth animations

### Testing Checklist

```markdown
## Testing Checklist

### Basic Functionality
- [ ] Game loads without errors
- [ ] Can select and change cities
- [ ] All game modes start correctly
- [ ] Controls respond as expected

### Movement Systems
- [ ] Driving mode works
- [ ] Walking mode works
- [ ] Drone mode works
- [ ] Mode switching works
- [ ] Physics feel correct

### Graphics
- [ ] Terrain renders correctly
- [ ] Buildings appear
- [ ] Lighting looks good
- [ ] Camera follows player
- [ ] No visual glitches

### UI/UX
- [ ] Menus work
- [ ] HUD displays correctly
- [ ] Map opens and closes
- [ ] Buttons are clickable
- [ ] Text is readable

### API Integration
- [ ] Real estate data loads
- [ ] Properties display
- [ ] API errors handled gracefully
- [ ] Rate limiting respected

### Performance
- [ ] No lag or stuttering
- [ ] Memory usage stable
- [ ] CPU usage reasonable
- [ ] No console warnings
```

## Documentation

### When to Update Documentation

Update documentation when you:
- Add new features
- Change existing features
- Fix important bugs
- Modify APIs
- Change controls
- Update configuration

### Documentation Files

| File | When to Update |
|------|----------------|
| `README.md` | Major features, installation steps |
| `USER_GUIDE.md` | User-facing features, controls |
| `TECHNICAL_DOCS.md` | Code architecture, APIs |
| `API_SETUP.md` | API configuration changes |
| `CHANGELOG.md` | Every change |

### Writing Documentation

**Be Clear and Concise**:
```markdown
<!-- Good -->
Press `M` to open the map. Right-click to teleport.

<!-- Bad -->
The map functionality can be accessed via the M key, after which
the user may utilize the right-click mouse button functionality...
```

**Use Examples**:
```markdown
<!-- Good -->
To add a new city:
```javascript
const locations = {
    mycity: {
        name: 'My City',
        lat: 12.3456,
        lon: -78.9012
    }
};
```
<!-- Bad -->
Add cities in the locations object.
```

**Include Screenshots**:
- Show UI elements
- Demonstrate features
- Illustrate problems/solutions

## Community

### Communication Channels

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: General questions, ideas
- **Pull Requests**: Code contributions

### Getting Help

If you need help:
1. Check existing documentation
2. Search closed issues
3. Ask in GitHub Discussions
4. Create a new issue with `question` label

### Recognition

Contributors will be:
- Listed in release notes
- Credited in CHANGELOG
- Mentioned in documentation (if significant contribution)

## Types of Contributions

### Code Contributions

- Bug fixes
- New features
- Performance improvements
- Code refactoring
- Test additions

### Non-Code Contributions

- Documentation improvements
- Translations (future)
- Bug reports
- Feature suggestions
- Design improvements
- User support

### Example Contributions

**Good First Issues**:
- Fix typos in documentation
- Add new preset cities
- Improve UI styling
- Add new building colors
- Create additional map layers

**Intermediate Issues**:
- Implement new game modes
- Add weather effects
- Improve physics
- Add new controls
- Optimize performance

**Advanced Issues**:
- Multiplayer support
- VR/AR integration
- Advanced AI systems
- Complex rendering features
- Architecture refactoring

## Questions?

If you have questions about contributing:
1. Check this guide thoroughly
2. Search existing issues and discussions
3. Open a new discussion with your question
4. Tag it appropriately

## Legal Requirements

### Intellectual Property Assignment

By contributing to this project, you agree that:

1. **Full Ownership Transfer**: All contributions become the exclusive property of World Explorer 3D
2. **No Retained Rights**: You retain no rights to the contributed code or content
3. **Perpetual License**: The copyright holder may use contributions in perpetuity
4. **No Attribution Required**: The copyright holder is not required to provide attribution
5. **Commercial Use**: Contributions may be used in commercial products

### Required Documents

Before any contribution is accepted, you must sign:

1. **Contributor License Agreement (CLA)**
   - Assigns all IP rights
   - Confirms right to contribute
   - Indemnifies copyright holder

2. **Non-Disclosure Agreement (NDA)** (if accessing source)
   - Protects confidential information
   - Restricts disclosure
   - Defines confidentiality obligations

### Confidentiality

Contributors must:
- Treat all source code as confidential
- Not disclose any proprietary information
- Not share access credentials
- Not create unauthorized copies
- Not reverse engineer any components

### Warranties

Contributors warrant that:
- They own the contributed work
- Work does not infringe on third-party rights
- They have authority to assign rights
- Work is original and not copied
- No other agreements conflict with this contribution

## Contact for Contributions

To begin the contribution process:

**Email**: sreid1118@gmail.com  
**GitHub**: RRG314  
**Subject**: "Contribution Request - World Explorer 3D"

Include:
- Your name and contact information
- Brief description of proposed contribution
- Your experience and qualifications
- Why you want to contribute

You will receive:
- NDA for review and signature
- CLA for review and signature
- Access instructions (after agreements signed)
- Contribution guidelines specific to your role

## Thank You! 🙏

While this is proprietary software, we appreciate interest in improving World Explorer 3D. Contributors who sign agreements and provide valuable contributions may be acknowledged in release notes (at the discretion of the copyright holder).

---

**Last Updated**: February 2026 | [Back to README](README.md)

**IMPORTANT LEGAL NOTICE**: This is proprietary software. Unauthorized access, use, modification, or distribution is prohibited and may result in legal action.
