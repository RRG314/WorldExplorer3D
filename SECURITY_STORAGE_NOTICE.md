# Security and Storage Notice

This project includes a client-side persistent memory feature (pin/flower notes).

## How Memory Data Is Stored

- Storage location: browser `localStorage`
- Storage key: `worldExplorer3D.memories.v1`
- Storage scope: current browser profile on current device
- Sync behavior: no automatic cross-device/cloud sync
- Encryption: not encrypted at rest

## Data Limits

- Message length: `200` characters
- Max markers per location: `300`
- Max markers total: `1500`
- Max serialized payload: about `1500KB`

## User Controls

- Remove one marker: click marker in world, then `Remove Marker`
- Remove all markers: open memory composer and click `Delete All` (with confirmation)
- Full reset alternative: clear browser site data for this origin

## Security Baseline (Current)

- User-generated memory text is rendered as plain text (not HTML)
- Dynamic map/property/historic strings are escaped before HTML template insertion
- Placement is blocked if storage round-trip checks fail
- Marker data is treated as untrusted content

## Recommended Deployment Headers

Set these at the web server/CDN:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`

## Boilerplate Disclaimer Text

Use this in UI/help/privacy copy:

> Memory notes are saved locally in this browser and are not encrypted.  
> Notes are not automatically synced to other devices.  
> Anyone with access to this browser profile may be able to view saved notes.  
> Do not store passwords, API keys, or sensitive personal information in memory notes.
