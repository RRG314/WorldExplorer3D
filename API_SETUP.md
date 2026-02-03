# API Setup Guide 🔑

This guide walks you through setting up API keys for World Explorer 3D's real estate features.

## Table of Contents
- [Overview](#overview)
- [Rentcast API](#rentcast-api)
- [Attom API](#attom-api)
- [Estated API](#estated-api)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Overview

World Explorer 3D can display real-time real estate data by integrating with three property data APIs:

| API | Primary Data | Coverage | Free Tier |
|-----|-------------|----------|-----------|
| **Rentcast** | Rental estimates, property values | USA | ✅ Yes |
| **Attom** | Property details, sales history | USA | ✅ Limited |
| **Estated** | Property values, owner info | USA | ✅ Yes |

**Note**: All APIs are optional. The game works perfectly without them—you just won't see real estate data.

## Why Multiple APIs?

Each API provides different data and has different coverage:
- **Rentcast**: Best for rental properties and market trends
- **Attom**: Most comprehensive property details and school data
- **Estated**: Good balance of data and ease of use

Using multiple APIs provides:
- Better data coverage (fallback if one fails)
- More complete property information
- Redundancy for reliability

## Rentcast API

### Sign Up

1. Visit [rentcast.io](https://www.rentcast.io)
2. Click "Get Started" or "Sign Up"
3. Create a free account
4. Verify your email address

### Get API Key

1. Log in to your Rentcast dashboard
2. Navigate to "API Keys" section
3. Click "Create New Key" or "Generate Key"
4. Copy your API key
5. **Important**: Keep this key private!

### Free Tier Limits
- 500 requests per month
- Rate limit: 10 requests per minute
- All basic property data included

### Pricing (if you need more)
- **Starter**: $49/month - 5,000 requests
- **Professional**: $149/month - 25,000 requests
- **Enterprise**: Custom pricing

### API Documentation
[https://developers.rentcast.io/docs](https://developers.rentcast.io/docs)

## Attom API

### Sign Up

1. Visit [attomdata.com](https://www.attomdata.com)
2. Click "Get Started" or "Developer Portal"
3. Register for a developer account
4. Complete the verification process

### Get API Key

1. Log in to the Attom Developer Portal
2. Go to "My Account" → "API Keys"
3. Request a new API key
4. Select the appropriate plan
5. Copy your API key once approved

### Free Tier Limits
- Limited trial period (typically 14-30 days)
- 500-1,000 requests during trial
- May require credit card for verification

### Pricing
- **Property Basic**: $199/month - 5,000 requests
- **Property Premium**: $499/month - 25,000 requests
- **Enterprise**: Custom pricing

**Note**: Attom is more expensive but provides the most comprehensive data.

### API Documentation
[https://api.gateway.attomdata.com/propertyapi/v1.0.0/](https://api.gateway.attomdata.com/propertyapi/v1.0.0/)

## Estated API

### Sign Up

1. Visit [estated.com](https://estated.com)
2. Click "Get API Access"
3. Fill out the registration form
4. Verify your email

### Get API Key

1. Log in to your Estated account
2. Navigate to "API" section
3. Your API key should be displayed
4. Copy the key
5. Store it securely

### Free Tier Limits
- 500 requests per month
- Rate limit: 5 requests per second
- Basic property data included

### Pricing
- **Developer**: $50/month - 5,000 requests
- **Startup**: $200/month - 25,000 requests
- **Business**: $500/month - 100,000 requests

### API Documentation
[https://estated.com/developers/docs](https://estated.com/developers/docs)

## Configuration

### In-App Configuration

1. **Launch World Explorer 3D**
   - Open the HTML file in your browser

2. **Open Settings Tab**
   - Click the "Settings" tab in the main menu

3. **Scroll to API Configuration**
   - Find the "🔑 API Configuration" section

4. **Enter Your API Keys**
   ```
   Rentcast API Key: [paste your key here]
   Attom API Key:    [paste your key here]
   Estated API Key:  [paste your key here]
   ```

5. **Save Configuration**
   - Click "Save API Keys" button
   - Keys are saved to browser localStorage
   - They persist across sessions

6. **Enable Real Estate Mode**
   - Check "Enable Real Estate Features" toggle
   - This must be enabled to see property data

### Configuration Verification

After saving, the app will:
- ✅ Store keys securely in localStorage
- ✅ Show confirmation message
- ✅ Keys persist until you clear browser data

### Manual Configuration (Advanced)

If you prefer to edit the code directly:

1. Open `world-explorer-complete.html` in a text editor
2. Find the initialization section (search for `apiConfig`)
3. Add your keys:

```javascript
const apiConfig = {
    rentcast: 'YOUR_RENTCAST_KEY_HERE',
    attom: 'YOUR_ATTOM_KEY_HERE',
    estated: 'YOUR_ESTATED_KEY_HERE'
};
```

4. Save the file
5. Reload in browser

**Warning**: Hard-coding keys in HTML is less secure. Anyone with access to the file can see them.

## Testing

### Test Real Estate Mode

1. **Start the Game**
   - Select a US city (e.g., Baltimore, New York)
   - Choose "Free Roam" mode
   - Ensure "Enable Real Estate Features" is checked
   - Click "EXPLORE"

2. **Look for Property Markers**
   - Green floating markers should appear on buildings
   - Each marker represents a property with data

3. **Click a Property**
   - Walk/drive near a property marker
   - Click it or press the interaction button
   - A panel should open with property details

4. **Check the Data**
   - If you see property information → Keys working! ✅
   - If you see "No data available" → Check configuration ❌

### Test Individual APIs

#### Test Rentcast
Look for:
- Estimated monthly rent
- Property value
- Market trends

#### Test Attom
Look for:
- Property details (bedrooms, bathrooms, square footage)
- Sale history
- Tax assessment
- School information

#### Test Estated
Look for:
- Property valuation
- Owner information
- Lot size
- Year built

### API Status Check

Check if APIs are responding:

1. Open browser console (F12 or Right Click → Inspect → Console)
2. Look for API responses
3. Successful calls show: `Property data loaded: [property details]`
4. Failed calls show: `API error: [error message]`

## Troubleshooting

### "Invalid API Key" Error

**Possible Causes**:
- Key was copied incorrectly (extra spaces, missing characters)
- Key has expired or been revoked
- API account is inactive

**Solutions**:
1. Re-copy the key from the provider dashboard
2. Verify the key is active in your account
3. Generate a new key if necessary
4. Check for extra spaces when pasting

### "API Limit Reached" Error

**Possible Causes**:
- You've exceeded your monthly request limit
- Rate limit exceeded (too many requests too fast)

**Solutions**:
1. Wait until next billing cycle
2. Upgrade to a higher tier
3. Reduce the number of properties displayed (use filters)
4. Use fewer APIs simultaneously

### No Properties Showing

**Possible Causes**:
- Real Estate Mode not enabled
- No API keys configured
- Location outside API coverage
- Network connection issues

**Solutions**:
1. Enable "Real Estate Features" in Settings
2. Verify API keys are saved
3. Try a major US city
4. Check internet connection
5. Check browser console for errors

### Properties Show "No Data Available"

**Possible Causes**:
- Property not in API database
- API returned empty response
- Location lacks coverage

**Solutions**:
1. Try different properties
2. Use multiple APIs (fallback)
3. Check API provider coverage maps
4. Some areas have limited data

### Slow Performance with Real Estate Mode

**Possible Causes**:
- Too many API calls
- Too many property markers
- Slow internet connection

**Solutions**:
1. Reduce visible property count (add price filters)
2. Close other browser tabs
3. Disable one or more APIs
4. Use a faster internet connection

### API Key Not Persisting

**Possible Causes**:
- Browser in private/incognito mode
- localStorage disabled
- Browser data cleared

**Solutions**:
1. Use normal browsing mode (not incognito)
2. Enable localStorage in browser settings
3. Re-enter keys after clearing data
4. Consider hard-coding keys (less secure)

## Security Best Practices

### Protecting Your API Keys

1. **Never Share Keys**
   - Don't post them publicly
   - Don't commit them to version control
   - Don't share the HTML file with keys embedded

2. **Use Environment Variables** (Advanced)
   - For production deployments
   - Keep keys on server-side
   - Use proxy endpoints

3. **Monitor Usage**
   - Check API dashboards regularly
   - Set up usage alerts
   - Watch for unusual activity

4. **Rotate Keys Regularly**
   - Generate new keys every 3-6 months
   - Revoke old keys after rotation
   - Update all instances

5. **Limit Key Permissions**
   - Only enable needed endpoints
   - Set IP restrictions if available
   - Use read-only access when possible

## API Comparison

| Feature | Rentcast | Attom | Estated |
|---------|----------|-------|---------|
| **Ease of Setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Free Tier** | Generous | Limited | Good |
| **Data Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Coverage** | USA only | USA only | USA only |
| **Response Speed** | Fast | Medium | Fast |
| **Documentation** | Excellent | Good | Good |
| **Cost** | Low | High | Medium |

## Recommendations

### For Beginners
Start with **Rentcast**:
- Easy to set up
- Good free tier
- Comprehensive documentation

### For Best Data
Use **Attom** if budget allows:
- Most detailed property information
- Best for serious applications
- Professional-grade data

### For Balance
Use **Estated**:
- Good data quality
- Reasonable pricing
- Easy integration

### For Maximum Coverage
Use **All Three**:
- Best data availability
- Automatic fallback
- Most comprehensive information

## Support

### API Provider Support

**Rentcast**: support@rentcast.io
**Attom**: [Support Portal](https://api.gateway.attomdata.com/support)
**Estated**: support@estated.com

### World Explorer Support

For integration issues with World Explorer:
- Check the [User Guide](USER_GUIDE.md)
- Review [Known Issues](README.md#known-issues)
- Open a GitHub issue

## Additional Resources

- [Rentcast Documentation](https://developers.rentcast.io/docs)
- [Attom API Reference](https://api.gateway.attomdata.com/propertyapi/v1.0.0/)
- [Estated Developer Docs](https://estated.com/developers/docs)
- [Google Maps API](https://developers.google.com/maps/documentation)

---

**Last Updated**: February 2026 | [Back to README](README.md)
