# UCG Infinity SV Sheets

A web app for planning UCG Infinity routines. Coaches and athletes sign in with Google, add athletes, enter each athlete's vault and bars/beam/floor skills, and get live start values. They can export a filled-in **UCG Infinity Start Value Worksheet** as a PDF.

**Live site:** https://jzsharpe.github.io/ucg-infinity-sv/

## Scoring rules

These follow the original *WAG Open Scoring Routine Planning and SV Calculator* spreadsheet and the SV worksheet:

| Part | Rule |
| --- | --- |
| Execution | 10.0 |
| Difficulty | A=0.1, B=0.3, C=0.5, D=0.7, E=0.9. Athletes list the whole routine in order (drag to reorder); the 8 highest-value skills count, and ties go to the skill listed first. Counting skills are highlighted; other skills are shaded gray and flagged "Not in Top 8". |
| Repeats | Each skill counts once. A later skill with the same name (ignoring case, spaces and punctuation, so "Clear hip" = "Clearhip") is shaded gray, flagged "Repeat of Skill X", and doesn't count. |
| Element group bonus | +0.3 for each condensed element group (I–IV) with a B or higher skill, max +1.2 |
| Apparatus bonus (UCG) | +0.3 when performed. Bars: minimum of 2 bar changes. Beam: acro series with 2 connected flight elements on beam. Floor: acro pass with at least 2 connected saltos (direct or indirect). |
| Short routine | −1.0 for each counting skill under 6 |
| Non-counting EG credit | A non-counting skill can still earn the +0.3 for a condensed group the counting skills miss. It's flagged with its group, e.g. "EG III Credit Only", adds no difficulty, and appears on the PDF as an extra "EG" row under skill 8. |
| Vault | D score from the vault reference table + 10.0 |

The rules are in [`js/scoring.js`](js/scoring.js) and the vault table is in [`js/vaults.js`](js/vaults.js).

## One-time setup: Google sign-in (Firebase)

Until Firebase is set up, the site runs in **local mode**: there's no sign-in, and athletes are saved only in the current browser. To turn on Google sign-in and cloud saving:

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics isn't needed).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, then save.
3. **Authentication → Settings → Authorized domains → Add domain**: `jzsharpe.github.io`
4. **Build → Firestore Database → Create database** (production mode, any location).
5. **Firestore → Rules**: paste the contents of [`firestore.rules`](firestore.rules), then **Publish**.
6. **Project settings (gear icon) → General → Your apps → Web (`</>`)**: register an app (Hosting isn't needed) and copy the `firebaseConfig` values.
7. Paste those values into [`js/firebase-config.js`](js/firebase-config.js), then commit and push.

The Firebase web config is safe to publish. The security rules only let each signed-in user read and write their own athletes.

## Develop locally

```bash
npm start      # serves on http://localhost:8080
npm test       # scoring tests (Node 20+)
```

There's no build step. GitHub Pages serves the files as they are.

## Design

The look follows the UCG Design System (2026 identity): navy / blue green / light blue palette, condensed all-caps display type, 20px cards, pill inputs, and the official logo files in `assets/` (`ucg-primary.svg`, `ucg-mark.svg`). Brand tokens are at the top of `css/styles.css`.

Fonts: the brand faces are Greed Condensed and Suisse Intl, which are licensed and not included in this public repo. The site uses the design system's approved fallbacks, Saira Condensed (Google Fonts) and Arial/Helvetica. If you have a web license that allows it, add the `.woff2` files and `@font-face` rules and the stacks pick them up automatically.

`assets/logo.png` is the lockup drawn at the top of each PDF page. The site icon is `assets/favicon.svg` (white mark on a dark blue green circle), with PNG copies for older browsers and phone home screens.
