# Development guide

Irish Electrical Lab is a local React, TypeScript and Three.js application with a Windows Electron shell. The browser and desktop editions share the workbench, electrical engine, lesson data and assets. The shipping renderer and engine live in `lab/`; the original Blender authoring files live in `authoring/blender/`.

## Set up a Windows checkout

Install Git and a 64-bit Node.js version satisfying `lab/package.json`: **Node 22.13.0 or newer**. Windows 11 x64 is the supported desktop packaging target. Initial dependency installation needs internet access. A hardware-accelerated graphics driver is needed for the 3D workbench.

Clone this repository, then open PowerShell in the checkout root:

```powershell
git clone https://github.com/Bh0ps/irish-electrical-lab.git
Set-Location irish-electrical-lab/lab
npm ci
```

Use the committed `package-lock.json` with `npm ci` for a reproducible dependency tree. Ordinary development needs neither Blender nor Python. Models, thumbnails and textures are included under `lab/public/`; the app does not download them at runtime. Typography uses system fonts. No account, API key, `.env` file, database service or Codex installation is required. A clean checkout automatically uses the portable execution profile.

If PowerShell blocks the `npm.ps1` shim, use `npm.cmd` in place of `npm` in these commands. No execution-policy change is needed.

## Run in a browser

From `lab/`:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173/`. Stop the development server with **Ctrl+C** in its terminal. The development command uses the local Vinext/Vite toolchain for the React application.

To check the exported production application:

```powershell
npm run build
npm start
```

The build creates `lab/dist/client/`, including the simulation and routing workers. `npm start` serves those files at `http://127.0.0.1:4173/`; stop it with **Ctrl+C**. Development at port 5173, production preview at port 4173 and the desktop app at port 4187 have separate browser storage origins. Export a full study backup to transfer saved work between them.

## Run and package the Windows app

From `lab/`, prepare Electron's bundled runtime and build the renderer:

```powershell
node node_modules/electron/install.js
npm run build
npm run desktop
```

The explicit Electron install command also handles installations where npm skipped Electron's download script. It needs internet access if the runtime is not already present. `npm run desktop` opens the local Electron shell against the production files; renderer changes require another `npm run build` and a shell restart.

The development shell uses the same app identity, private port and study profile as an installed copy. Close the installed app first and export a full study backup before testing storage changes. Closing the window stops its private server.

Create an unpacked application for testing, then an installer:

```powershell
npm run desktop:pack
npm run desktop:installer
```

`desktop:pack` writes `lab/release/win-unpacked/Irish Electrical Lab.exe`. `desktop:installer` writes a versioned `Irish-Electrical-Lab-<version>-Setup.exe` under `lab/release/`. The release version comes from `lab/desktop/app/package.json`. These commands generate their QA fixture inputs and third-party licence notices, bundle the current `dist/client/`, both workers and local assets, and package Electron through Electron Builder. Build the renderer again before packaging after source or asset changes.

The NSIS installer targets the current Windows user and creates Desktop and Start menu shortcuts. The installed application includes its own runtime and needs no separate Node installation. Generated installers, unpacked runtime copies and downloaded tools are excluded from Git; create them locally or obtain them from a published release. Locally built installers are unsigned unless a separate signing process is configured.

See the [desktop guide](../lab/desktop/README.md) for native verification modes, installation details and backup controls.

## Check a change

Run these commands from `lab/`. The source suite covers actual connections, operating and protection findings, lesson evidence and progression, saved data, terminal layouts, model assets, camera interaction and desktop contracts:

```powershell
node --import tsx --test scripts/*.test.ts scripts/*.test.tsx scripts/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
node scripts/offline-audit.mjs
node scripts/simulation-worker-audit.mjs
```

The last two checks require the completed production build. The offline audit checks bundled asset references and worker URLs; the worker audit exercises the emitted calculation-worker protocol. Neither is a substitute for inspecting the real 3D application.

For electrical, curriculum or routing changes, also run the relevant whole-catalog audits:

```powershell
node --import tsx scripts/catalog-audit.ts
node --import tsx scripts/lesson-simulation-audit.ts
node --import tsx scripts/teaching-audit.ts
node --import tsx scripts/lesson-stage-audit.ts
node --import tsx scripts/routing-audit.ts
```

Reports are generated in the ignored root `verification/` directory. For desktop or backup changes, `npm run desktop:test` runs the focused shell and atomic-backup checks. Run ESLint on the modules you changed, for example:

```powershell
node node_modules/eslint/bin/eslint.js components/lab/Lab.tsx lib/build-hints.ts
```

`npm run lint` is available for the wider checkout. Avoid committing generated output while reviewing lint findings. The [verification summary](verification.md) distinguishes source checks, packaged-worker checks and native Windows evidence.

For a native smoke check, close every running copy of the app, then launch the unpacked executable:

```powershell
& '.\release\win-unpacked\Irish Electrical Lab.exe' --verify-desktop
```

Reports are written under `%APPDATA%\Irish Electrical Lab\verification`. Read the desktop guide before using extended `--verify-*` modes: they deliberately exercise and temporarily replace study records, then restore the original profile. Keep a full study backup and preserve any recovery files if a diagnostic is interrupted. Install/uninstall, shortcut, real picking, window, GPU and upgrade-retention checks require the actual Windows application; successful source tests alone do not prove them.

## Regenerate original models

Install **Blender 4.5 LTS** separately and make its `blender` command available in PowerShell. Python with Pillow is needed only to assemble contact sheets, not to construct assets inside Blender. The included `.blend` files and GLBs already support normal development and app use.

From the checkout root, export the typed procedural recipes and rebuild the original Blender library:

```powershell
Push-Location lab
node --import tsx scripts/export-model-recipes.tsx
Pop-Location
blender --background --python authoring/blender/build_models.py --
```

The exporter writes `authoring/blender/recipes/`; Blender writes editable source files to `authoring/blender/models/` and full/detail-distance assets to `lab/public/models/`. It preserves the terminal and part metadata used by the electrical graph, picking and animations.

For a focused change, pass the same inventory key to both stages. For example, the following updates the one-way switch:

```powershell
Push-Location lab
node --import tsx scripts/export-model-recipes.tsx --only switch:single-rocker
Pop-Location
blender --background --python authoring/blender/build_models.py -- --only switch_single-rocker
```

Recipe keys replace punctuation with underscores for Blender. Check `authoring/blender/recipes/inventory.json` for the original `galleryKey` and corresponding file `key`.

Generate offline review views and menu thumbnails, then assemble contact sheets:

```powershell
blender --background --python authoring/blender/build_models.py -- --render-only --render-library --thumbnails
py -m pip install Pillow
py authoring/blender/contact_sheets.py
```

Review the generated images under `verification/blender/`. From `lab/`, run the model contracts and rebuild the application so its exported assets match the new originals:

```powershell
node --import tsx --test scripts/blender-assets.test.ts scripts/model-detail.test.ts scripts/lamp-brightness.test.tsx
npm run build
```

The [Blender guide](../authoring/blender/README.md) describes construction families, additional render options, editable sources and the reference map. Full geometry is used when equipment is selected; distance assets omit microscopic detail. Changes must preserve physical rear terminals, stable terminal IDs, selectable parts, animation metadata and fixed electrical topology through cover-open, exploded and cutaway views.

## Storage and scope

Circuit documents and lesson progress use IndexedDB. Desktop data lives in `%APPDATA%\Irish Electrical Lab`, outside installation files; replacing the installer preserves it. The renderer has no Node access. Native file dialogs, approved external-reference actions and fullscreen go through the narrow isolated preload bridge. Keep the stable private origin `http://127.0.0.1:4187` and application identity when making compatible updates.

The electrical engine is an educational steady-state complex RMS model. Domestic lessons offer a 240 V study setting and a 230 V nominal preset; industrial examples use 400 V line-to-line at 50 Hz. Source, conductor and device parameters are documented teaching assumptions. Converter and machinery safety blocks are explicit abstractions. The app does not perform cable-design approval, manufacturer-specific trip certification, transient analysis or installation certification. Keep electrical operation, protective-path findings and lesson objectives separate, and represent unresolved readings honestly.

Do not commit learner backups, browser profiles, profile recovery files, installed app directories or raw local verification reports. Public verification belongs in the curated summary, with its measured platform and any limitations recorded.
