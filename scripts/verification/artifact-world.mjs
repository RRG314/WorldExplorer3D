// Respect the selected immutable artifact. A package script must never silently
// replace it with dist while the release recorder attributes results elsewhere.
import {artifactIdentity} from './artifact-identity.mjs';
process.env.WE3D_VERIFY_ROOT ||= 'dist';
if(!artifactIdentity(process.cwd(),process.env.WE3D_VERIFY_ROOT))throw Error('Selected world artifact is missing or changed');
await import('./world.mjs');
