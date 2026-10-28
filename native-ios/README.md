# CLST Trucking AI — iOS wrapper source

This is a separate native iOS Xcode project that opens the existing CLST Trucking AI dashboard at https://clst-trucking.pages.dev/. It does not change the website, Worker, Gmail, ELD, ETA, RingCentral, or background refresh code.

## Build on a Mac
1. Open `CLSTTruckingiOS.xcodeproj` in Xcode.
2. Select the `CLSTTruckingiOS` target and set your Apple Developer Team under **Signing & Capabilities**.
3. Connect the iPhone, select it as the run destination, then press **Run**.
4. For distribution, use **Product → Archive** and distribute through TestFlight/App Store, or use an appropriately signed development/ad hoc build.

## Important limits
- An iOS app must be signed by Apple tooling before it can be installed. This source project is not an installable signed IPA by itself.
- The dashboard currently runs on the existing website. Gmail Google OAuth, phone permissions, and other external sign-in flows must be tested on a real device; embedded web views can be restricted by some identity providers.
- This wrapper intentionally adds no API keys, passwords, tokens, or secrets.
- The project is isolated under `native-ios/`; it does not alter the live dashboard.
