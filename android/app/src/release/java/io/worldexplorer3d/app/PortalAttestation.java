package io.worldexplorer3d.app;

import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

/** Release builds have only the actual Play Integrity provider. */
final class PortalAttestation {
    static void install(FirebaseAppCheck check) { check.installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance()); }
}
