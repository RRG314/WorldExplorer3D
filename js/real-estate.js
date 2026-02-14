import { ctx as appCtx } from "./shared-context.js?v=52"; // ============================================================================
// real-estate.js - Property API and real estate data system
// ============================================================================

// ==================== REAL ESTATE SYSTEM ====================

// Real Estate API Configuration
const apiConfig = {
  rentcast: null, // User can provide their API key
  attom: null, // ATTOM Data Solutions
  estated: null // Estated API (1000 free requests/month)
};

// Demo/Mock Property Data for when no API key is provided
const generateDemoProperties = (centerLat, centerLon, count = 20) => {
  const properties = [];
  const propertyTypes = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Apartment'];

  for (let i = 0; i < count; i++) {
    // Random offset within ~1km radius
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lonOffset = (Math.random() - 0.5) * 0.01;
    const lat = centerLat + latOffset;
    const lon = centerLon + lonOffset;
    const worldPos = appCtx.geoToWorld(lat, lon);

    const priceType = Math.random() > 0.6 ? 'sale' : 'rent';
    const basePrice = priceType === 'sale' ?
    200000 + Math.random() * 800000 :
    1000 + Math.random() * 3000;

    const beds = Math.floor(1 + Math.random() * 5);
    const baths = Math.floor(1 + Math.random() * 3);
    const sqft = Math.floor(800 + Math.random() * 2500);

    properties.push({
      id: `demo-${i}`,
      address: `${Math.floor(100 + Math.random() * 9900)} Demo Street`,
      city: 'Demo City',
      state: 'XX',
      zipCode: '00000',
      lat,
      lon,
      x: worldPos.x,
      z: worldPos.z,
      price: Math.floor(basePrice),
      priceType,
      beds,
      baths,
      sqft,
      yearBuilt: Math.floor(1950 + Math.random() * 73),
      daysOnMarket: Math.floor(Math.random() * 180),
      propertyType: propertyTypes[Math.floor(Math.random() * propertyTypes.length)],
      pricePerSqft: Math.floor(basePrice / sqft),
      photos: [],
      primaryPhoto: null,
      sourceUrl: null,
      isDemo: true,
      source: 'demo'
    });
  }

  return properties;
};

// Property API Layer
const PropertyAPI = {
  // Main fetch function - tries all available APIs
  async fetchProperties(lat, lon, radius = 1) {
    let properties = [];

    // Try Estated first (highest free tier - 1000/month)
    if (apiConfig.estated && !properties.length) {
      // Debug log removed
      properties = await this.fetchEstated(lat, lon, radius);
    }

    // Try ATTOM next
    if (apiConfig.attom && !properties.length) {
      // Debug log removed
      properties = await this.fetchATTOM(lat, lon, radius);
    }

    // Try RentCast as fallback
    if (apiConfig.rentcast && !properties.length) {
      // Debug log removed
      properties = await this.fetchRentCast(lat, lon, radius);
    }

    // Fall back to demo if no APIs configured or all failed
    if (!properties.length) {
      // Debug log removed
      properties = generateDemoProperties(lat, lon);
    }

    return properties;
  },

  // Estated API - 1000 free requests/month
  async fetchEstated(lat, lon, radius = 1) {
    if (!apiConfig.estated) return [];
    const results = [];

    try {
      // Estated uses a bounding box approach
      const radiusDegrees = radius / 69; // Approx miles to degrees
      const response = await fetch(
        `https://apis.estated.com/v4/property?lat=${lat}&lon=${lon}`,
        {
          headers: {
            'Authorization': `Bearer ${apiConfig.estated}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          results.push(...this.normalizeEstated([data.data]));
        }
      }

      // Try to get nearby properties
      const nearbyResponse = await fetch(
        `https://apis.estated.com/v4/property/search?lat=${lat}&lon=${lon}&radius=${radius}`,
        {
          headers: {
            'Authorization': `Bearer ${apiConfig.estated}`
          }
        }
      );

      if (nearbyResponse.ok) {
        const nearbyData = await nearbyResponse.json();
        if (nearbyData.data && Array.isArray(nearbyData.data)) {
          results.push(...this.normalizeEstated(nearbyData.data));
        }
      }
    } catch (e) {
      console.error('Estated API error:', e);
    }

    return results;
  },

  // ATTOM API
  async fetchATTOM(lat, lon, radius = 1) {
    if (!apiConfig.attom) return [];
    const results = [];

    try {
      // ATTOM property search by location
      const response = await fetch(
        `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/snapshot?latitude=${lat}&longitude=${lon}&radius=${radius}`,
        {
          headers: {
            'apikey': apiConfig.attom,
            'Accept': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.property && Array.isArray(data.property)) {
          results.push(...this.normalizeATTOM(data.property));
        }
      }
    } catch (e) {
      console.error('ATTOM API error:', e);
    }

    return results;
  },

  // RentCast API (existing)
  async fetchRentCast(lat, lon, radius = 1) {
    if (!apiConfig.rentcast) return [];
    const results = [];

    try {
      const saleRes = await fetch(
        `https://api.rentcast.io/v1/listings/sale?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=50`,
        { headers: { 'X-Api-Key': apiConfig.rentcast } }
      );
      if (saleRes.ok) {
        const data = await saleRes.json();
        if (Array.isArray(data)) results.push(...this.normalizeRentCast(data, 'sale'));
      }
    } catch (e) {
      console.error('RentCast sale fetch error:', e);
    }

    try {
      const rentRes = await fetch(
        `https://api.rentcast.io/v1/listings/rental/long-term?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=50`,
        { headers: { 'X-Api-Key': apiConfig.rentcast } }
      );
      if (rentRes.ok) {
        const data = await rentRes.json();
        if (Array.isArray(data)) results.push(...this.normalizeRentCast(data, 'rent'));
      }
    } catch (e) {
      console.error('RentCast rental fetch error:', e);
    }

    return results;
  },

  // Normalize Estated data
  normalizeEstated(data) {
    return data.map((p, i) => {
      const lat = p.address?.lat || p.parcel?.lat || 0;
      const lon = p.address?.lon || p.parcel?.lon || 0;
      const worldPos = appCtx.geoToWorld(lat, lon);

      return {
        id: p.parcel?.apn || `estated-${i}`,
        address: p.address?.formatted_street_address || 'Unknown',
        city: p.address?.city || '',
        state: p.address?.state || '',
        zipCode: p.address?.zip_code || '',
        lat,
        lon,
        x: worldPos.x,
        z: worldPos.z,
        price: p.valuation?.value || p.market_assessments?.[0]?.market_value || 0,
        priceType: 'sale',
        beds: p.structure?.beds_count || 0,
        baths: p.structure?.baths || 0,
        sqft: p.structure?.total_area_sq_ft || 0,
        yearBuilt: p.structure?.year_built || 0,
        daysOnMarket: 0,
        propertyType: p.structure?.style || 'Unknown',
        pricePerSqft: p.structure?.total_area_sq_ft ? Math.round((p.valuation?.value || 0) / p.structure.total_area_sq_ft) : 0,
        photos: [],
        primaryPhoto: null,
        sourceUrl: null,
        isDemo: false,
        source: 'estated'
      };
    });
  },

  // Normalize ATTOM data
  normalizeATTOM(data) {
    return data.map((p, i) => {
      const lat = p.location?.latitude || 0;
      const lon = p.location?.longitude || 0;
      const worldPos = appCtx.geoToWorld(lat, lon);

      const assessment = p.assessment?.assessed || {};
      const building = p.building || {};
      const address = p.address || {};

      return {
        id: p.identifier?.attomId || `attom-${i}`,
        address: `${address.line1 || ''} ${address.line2 || ''}`.trim() || 'Unknown',
        city: address.locality || '',
        state: address.countrySubd || '',
        zipCode: address.postal1 || '',
        lat,
        lon,
        x: worldPos.x,
        z: worldPos.z,
        price: assessment.assdTtlValue || p.market?.mktTtlValue || 0,
        priceType: 'sale',
        beds: building.rooms?.beds || 0,
        baths: building.rooms?.bathsFull || 0,
        sqft: building.size?.grossSize || 0,
        yearBuilt: building.summary?.yearBuilt || 0,
        daysOnMarket: 0,
        propertyType: building.construction?.constructionType || 'Unknown',
        pricePerSqft: building.size?.grossSize ? Math.round((assessment.assdTtlValue || 0) / building.size.grossSize) : 0,
        photos: [],
        primaryPhoto: null,
        sourceUrl: null,
        isDemo: false,
        source: 'attom'
      };
    });
  },

  // Normalize RentCast data (existing)
  normalizeRentCast(data, priceType) {
    return data.map((p, i) => {
      const worldPos = appCtx.geoToWorld(p.latitude || 0, p.longitude || 0);
      return {
        id: p.id || `rc-${priceType}-${i}`,
        address: p.formattedAddress || p.addressLine1 || 'Unknown',
        city: p.city || '',
        state: p.state || '',
        zipCode: p.zipCode || '',
        lat: p.latitude || 0,
        lon: p.longitude || 0,
        x: worldPos.x,
        z: worldPos.z,
        price: p.price || 0,
        priceType,
        beds: p.bedrooms || 0,
        baths: p.bathrooms || 0,
        sqft: p.squareFootage || 0,
        yearBuilt: p.yearBuilt || 0,
        daysOnMarket: p.daysOnMarket || 0,
        propertyType: p.propertyType || 'Unknown',
        pricePerSqft: p.squareFootage ? Math.round(p.price / p.squareFootage) : 0,
        photos: p.photos || p.photoUrls || p.images || [],
        primaryPhoto: p.primaryPhoto || p.photos?.[0] || null,
        sourceUrl: p.listingUrl || p.url || null,
        isDemo: false,
        source: 'rentcast'
      };
    });
  }
};

Object.assign(appCtx, { apiConfig, PropertyAPI, generateDemoProperties });

export { apiConfig, generateDemoProperties, PropertyAPI };