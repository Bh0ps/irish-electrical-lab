# Irish Electrical Lab for Windows

The installed app contains its own Electron runtime, the production 3D workbench, both calculation workers and local assets. Study and building work offline. External source links open in your normal browser when internet access is available.

## Install and use

Run `release/Irish-Electrical-Lab-1.2.1-Setup.exe` from the `lab` directory. Installation is for your Windows account and creates **Irish Electrical Lab** shortcuts on the Desktop and Start menu. Start with either shortcut. Close the app window to stop the application and its private local server. Use **More → Fullscreen**, the window menu **View → Fullscreen**, or **F11** to switch fullscreen.

This is a locally built, unsigned installer, so Windows may identify its publisher as unknown. The installer does not require administrator privileges.

The app uses the fixed local origin `http://127.0.0.1:4187`. It serves only bundled app files and cannot be accessed from other computers. A second launch focuses the existing window. If another program uses port 4187, the app shows an explicit error and leaves saved work intact.

## Keep or transfer saved work

Builds and progress live in `%APPDATA%\Irish Electrical Lab`, outside the installation directory. Replacement installers preserve this profile. Uninstalling also retains it unless you manually remove it.

Use **My builds → Export full backup** to save your draft, named builds and progress to one versioned JSON file. Use **My builds → Restore backup** in the Windows app and select that file in the native Windows dialog. The earlier browser edition calls this menu **Study backup**. Restoration validates every circuit and the progress before replacing the three records in one IndexedDB transaction. Invalid files leave your current work unchanged. **Export circuit** and **Import circuit** transfer individual builds.

**Learn** keeps the current instruction visible while you inspect, connect or measure. Its six stages are Look, Predict, Build, Try, Measure and Fix. **Sandbox** gives the workbench more room for your own circuits. The labelled tools are Select, Add equipment, Connect and Measure. Choose a setup through **Learn → Courses**; all 64 are available immediately. **More → Wiring hints** turns the optional connection guidance on or off. Hints allow deliberate mistakes so you can investigate them with **Test circuit**.

In **1.2.1**, placing the correct new wire for the current guided Build step checks it and advances exactly one step automatically. **Check connection** remains the fallback for a revisited connection or a build reopened after reload. Merely changing stages, loading an example or using Undo/Redo does not award new demonstrations. Fresh guided builds isolate the external supply and every represented PV/battery source. The first Try step in configurations **47 and 48** tells you which local source to enable manually using **Operate** before checking the operating state.

For a new wire in an attached lesson, the exact terminal pair supplies its default identification in either click order. This recognises control wires beginning at line terminals and switched line paths beginning at control contacts. If you choose **Conductor identification** manually, your choice takes priority for that pending wire. Incorrect connections and identities remain possible; existing wires are not silently relabelled.

With **Select** active, click a 3D wire and press **Backspace** to remove it. **Undo** restores its connections and bends. Backspace still edits text normally when a text field has focus.

Select a dimmer housing to open **Dimmer level**. Drag its range to vary the equivalent series resistance, then read the actual voltage drop and current beside it. Each connected lamp changes its visible brightness from its own calculated emitting power. Clicking the knob switches the dimmer on or off while keeping the chosen level. This teaching model represents dimming through a series resistance; real electronic dimmer waveform control and heating are outside it.

Use **View → Free camera** for smooth keyboard movement: click the bench, then W/A/S/D move, Q/E lower and raise, and Shift increases speed. Right-drag looks, middle-drag pans and scrolling moves smoothly. Left clicks still operate and wire equipment. Typing, modal dialogs and equipment drags pause camera movement. Switch back to Orbit without changing the current pose; Fit and Rear terminals work in both modes.

The workbench View menu selects Workshop, Domestic utility room, Industrial training bay or Evening courtyard. The modelled environments, local PBR textures, reflections and shader effects are bundled offline. Camera mode, speed, scenery and quality live in a separate display-preference record; circuits and full study backups keep their existing formats. Choose automatic, high or economy through **More → Graphics and supply settings → Graphics quality**. Lamp surfaces and bounded dynamic-light slots follow the actual simulated emitting power.

Before replacing edited work, the app offers **Save and continue**, **Discard and continue** and **Cancel**. Saving creates a named local snapshot; routine autosave also keeps the current draft.

## Build from source

From the `lab` directory, with Node 22.13 or newer:

```powershell
npm install
node node_modules/electron/install.js
npm run build
npm run desktop:pack
npm run desktop:installer
```

The explicit Electron install step is needed if npm's install-script approval policy has skipped its runtime download. `desktop:pack` produces `release/win-unpacked/Irish Electrical Lab.exe`; `desktop:installer` produces the per-user x64 NSIS setup executable. Runtime dependencies for the shell are only Electron and Node builtins; the React renderer and equipment assets are already bundled.

Run `npm run desktop:test` for backup validation, atomic restore and shell security tests. Launch the packaged executable with `--verify-desktop` for the internal diagnostic run. It tests all 64 circuits through the actual packaged workers, checks renderer isolation and WebGL, captures the app, and exits. Reports are saved under `%APPDATA%\Irish Electrical Lab\verification`. It does not control the existing browser version.

Add `--verify-ui` to check the six stages, persistent instructions, evidence gates, the complete guided build and operating sequence, actual 3D placement and terminal clicks, incorrect connections, native wire selection/Backspace/Undo, diagnosis/repair/retest, persistence, native backup file IO, unsaved-work choices, 1000/1280/1440-pixel window widths and the 30-component workload. Idle and terminal-hover checks count real simulation-worker requests. The run saves a temporary diagnostic starting profile so previous achievements cannot bypass evidence gates, then restores all original records and window settings. Reports and screenshots include `desktop-1.1-ui-report.json` and `desktop-1.1-*.png`.

Add `--verify-gallery` to capture every model variant in front, rear, cover-open, exploded and cutaway views, then every configuration with its loaded Blender geometry. These checks run inside the application's own Electron window; they preserve existing study records. `scripts/desktop-ui-contact-sheets.py` assembles the UI captures into local review sheets. `scripts/desktop-contact-sheets.py` assembles the model/configuration gallery captures.

Add `--verify-dimmer` for the focused native dimmer check. It uses real Windows pointer gestures on the range, knob operation, grouped Undo/Redo, fresh delivered worker results, native captures of the same lamp surface, bypass/disconnection and two independently supplied lamp instances. It also checks idle requests, reload and exact restoration of every original IndexedDB record, including display preferences, and the window. Results are saved as `desktop-dimmer-report.json` and `desktop-dimmer-*.png`.

Add `--verify-guided-build` for the focused 1.2.1 native course check. It builds one-way lighting and shutter-control circuits by clicking the live projected 3D terminals, without pressing Check or Next after correct additions. It verifies each added wire's endpoints and identification, one successor instruction and one competence award; deliberate wrong endpoints and manual identities; Undo/Redo, stage navigation and reload. Reports and screenshots include `desktop-guided-build-report.json` and `desktop-guided-build-*.png` under the profile's `verification` folder. The run unloads the React app before restoring every original IndexedDB key, compares the full saved-record digest, restores the native window state and exits.

Add `--verify-graphics` to check native free-camera input, smooth presets, modal and typing guards, equipment/wire/probe interaction, loaded menu thumbnails, all four environments and window widths. A fixed-camera dimmer comparison records low, high and zero emitting power alongside separate lamp-surface and ray-confirmed work-mat pixel samples. The performance workload uses 30 objects in six complete training cells, checks all 42 routes, and records actual render intervals, idle frames, memory and matched solver/routing timings. Reports and captures go to `verification/graphics` under the app profile. The run restores every saved IndexedDB key and the original window state.

The lifecycle diagnostic is a two-process check: run `--verify-lifecycle`, wait for exit, then `--verify-lifecycle-check`. It verifies one application instance, fullscreen and persisted window dimensions, then restores the previous bounds. Upgrade retention verification seeds temporary draft/build/progress records with `--verify-retention-seed`; after installing the replacement installer, `--verify-retention-check` compares the records and restores the originals. Use these flags only when intentionally running the app's verification workflow.

The shell enforces `contextIsolation`, sandboxing and disabled renderer Node integration. Its preload exposes only JSON import/export dialogs, approved HTTPS reference links and fullscreen. Renderer navigation, subframes, permissions and arbitrary external windows are blocked.
