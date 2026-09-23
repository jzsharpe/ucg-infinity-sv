# UCG WAG Open SV Sheets

A web app for planning UCG WAG Open Scoring routines. Coaches and athletes sign in with Google, add athletes, enter each athlete's vault and bars/beam/floor skills, and get live start values. They can export a filled-in **UCG WAG Open Start Value Worksheet** as a PDF.

**Live site:** https://jzsharpe.github.io/ucg-sv-sheets/

## Scoring rules

These follow the original *WAG Open Scoring Routine Planning and SV Calculator* spreadsheet and the SV worksheet:

| Part | Rule |
| --- | --- |
| Execution | 10.0 |
| Difficulty | A=0.1, B=0.3, C=0.5, D=0.7, E=0.9. Up to 8 skills count. |
| Element group bonus | +0.3 for each condensed element group (I–IV) with a B or higher skill, max +1.2 |
| Event bonus (UCG) | +0.3 when performed. Bars: minimum of 2 bar changes. Beam: acro series with 2 connected flight elements on beam. Floor: acro pass with at least 2 connected saltos (direct or indirect). |
| Short routine | −1.0 for each skill under 6 |
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

## Logo

`assets/logo.png` is the UCG logo that appears at the top of each PDF page. `assets/logo-mark.png` (the starburst) is used as the site icon. Replace either file to change them.
