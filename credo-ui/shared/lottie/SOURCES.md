# Milestone animations

| File | Used for | Source |
|---|---|---|
| `success.json` | Card or receipt saved, request approved | Made for Credentis by `generate.py` |
| `payment.json` | Payment completed | Made for Credentis by `generate.py` |
| `celebration.json` | Organisation setup finished | Made for Credentis by `generate.py` |
| `welcome.json` | Account created | Made for Credentis by `generate.py` |
| `completion.json` | Request or job completed | Made for Credentis by `generate.py` |
| `empty.json` | Inbox empty ("All caught up"), loops | Made for Credentis by `generate.py` |

All files use the Credentis palette (blue `#2188ca`, green `#1fb87e`) and are under 15 KB.

## Replacing an animation

1. Build or edit it in LottieFiles Creator (the `lottiefiles-creator` MCP server in `.vscode/mcp.json` lets the coding agent do this), or download one from lottiefiles.com under the Lottie Simple License.
2. Export as **Lottie JSON** with the same file name and drop it here. Keep it short (≤ 2 s, except `empty.json`) and small (≤ 60 KB).
3. If it came from lottiefiles.com, record the URL and author in the table above.

Both apps play these with `lottie-web`'s light SVG player. Under reduced motion they show a still icon instead.

## Release implementation notes

- The light SVG player replaces the planned dotLottie WASM player so Android does not need to fetch a player binary from a CDN.
- These are original generated animations, not downloaded LottieFiles assets. Creator replacements are optional; opening Creator must be followed by enabling its MCP connection.
- Wallet registration has a short Next/Back guide; organisation setup reuses the same progress component within its existing question flow.
- Offer reviews show the sender, description and save destination. Claims are not previewed because the inbox API does not supply them; the preview must not imply that a signature has already been verified.
- Milestone dialogs use Mantine's focus trapping, Escape handling and focus restoration. Reduced-motion preferences disable the animated player and entry effect.
