# Milestone animations

| File | Used for | Source |
|---|---|---|
| `success.json` | Card or receipt saved, request approved | Made for Credentis by `generate.py` |
| `payment.json` | Payment completed | Made for Credentis by `generate.py` |
| `celebration.json` | Organisation setup finished | Made for Credentis by `generate.py` |
| `welcome.json` | Account created | Made for Credentis by `generate.py` |
| `completion.json` | Request or job completed | Made for Credentis by `generate.py` |
| `empty.json` | Inbox empty ("All caught up"), loops | Made for Credentis by `generate.py` |
| `onboarding_receive.json` | Example receipt arriving in a wallet | Made for Credentis by `generate.py` |
| `onboarding_share.json` | Reviewing details before approving a request | Made for Credentis by `generate.py` |

All files use the Credentis palette (blue `#2188ca`, green `#1fb87e`) and are under 15 KB.
Compositions are 1080x1080 at 60 fps, with vector paths only: no embedded raster images,
external fonts or CDN assets. SVG rendering stays sharp at high device-pixel ratios;
the larger export artboard is not a substitute for detailed vector artwork.

## Replacing an animation

1. Build or edit it in LottieFiles Creator (the `lottiefiles-creator` MCP server in `.vscode/mcp.json` lets the coding agent do this), or download one from lottiefiles.com under the Lottie Simple License.
2. Export as **Lottie JSON** with the same file name and drop it here. Keep it short (≤ 2 s, except `empty.json`) and small (≤ 60 KB).
3. If it came from lottiefiles.com, record the URL and author in the table above.

Both apps play these with `lottie-web`'s light SVG player. Under reduced motion they show a still icon instead.

## Guided wallet journey

The mobile Create account flow and portal registration use the same interactive example.
It demonstrates keeping an incoming sample receipt and reusing it for a purchase return.
The requester, purpose and shared record are explicit; the demo does not promise selective
field disclosure. It never issues a credential or sends information; every example is labelled.
Both screens replace feedback in place and keep navigation in a bottom row. Mobile uses a
compact brand row and height-responsive artwork, targeting no scrolling at standard text
size on 360x640 and larger portrait screens. Shorter screens, landscape and enlarged text
can scroll so content and controls remain accessible. Account forms can scroll with a keyboard.
Skip intro goes directly to account creation without submitting anything.

The guide now composes its receipt, wallet and request as one interactive HTML/SVG scene
in `WalletOnboarding.tsx`, rather than playing an icon above a separate demo card.
CSS transitions move the actual sample receipt into its wallet after the user taps Save.
Approving the sample changes the request's appearance without adding another panel.
Reduced motion retains the same detailed scene and immediate state changes; it does not
replace the artwork with a generic icon. The original onboarding Lottie JSON files remain
available but are no longer used by the guide. Other milestone players are unchanged.

The [BC Digital Trust Showcase](https://digital.gov.bc.ca/digital-trust/showcase/demo)
informed the scenario-first approach: introduce a relatable situation, show a sample card,
explain what happens next and let the person try a decision. No BC artwork or code is copied.
These original vectors are generated locally; they are not LottieFiles library downloads
or Creator exports. Regenerate with `python3 credo-ui/shared/lottie/generate.py`.

Design references: [Apple onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding),
[purposeful motion](https://developer.apple.com/design/human-interface-guidelines/motion),
and [Nielsen Norman Group onboarding research](https://www.nngroup.com/articles/mobile-app-onboarding/).

WhatsApp headers use an 800x418 vector artboard rendered at 1600x836 (2x), with reserved
space between text and artwork. Regenerate with `node scripts/whatsapp-banners.js`.
The app login and portal header use a scalable pillar/network brand mark rather than
enlarging a padded raster logo. Animation fallbacks reserve the same space as the SVG player.

## Release implementation notes

- The light SVG player replaces the planned dotLottie WASM player so Android does not need to fetch a player binary from a CDN.
- These are original generated animations, not downloaded LottieFiles assets. Creator replacements are optional; opening Creator must be followed by enabling its MCP connection.
- Wallet registration has a short Next/Back guide; organisation setup reuses the same progress component within its existing question flow.
- Offer reviews show the sender, description and save destination. Claims are not previewed because the inbox API does not supply them; the preview must not imply that a signature has already been verified.
- Milestone dialogs use Mantine's focus trapping, Escape handling and focus restoration. Reduced-motion preferences disable the animated player and entry effect.
