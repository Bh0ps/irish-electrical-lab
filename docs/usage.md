# Irish Electrical Lab for Windows

An offline 3D study game for Irish domestic, commercial and industrial electrical arrangements. All **64 configurations** remain available. Version **1.2.1** checks each newly added guided connection automatically and corrects conductor identification for control circuits. Smooth free-camera movement, four modelled environments, local lighting and shader effects, detailed Blender equipment, illustrated menus and working dimmer resistance remain available in the **Learn** and **Sandbox** workspaces.

## Start and stop

Open **Irish Electrical Lab** from the Desktop or Start menu. Close its window or choose **File → Exit** to stop the app and private server. **More → Fullscreen**, the window menu **View → Fullscreen**, or **F11** changes fullscreen; normal window size is remembered.

Installer: `lab/release/Irish-Electrical-Lab-1.2.1-Setup.exe`. It bundles Electron, both workers and assets; the installed app needs no separate Node.js or internet connection. Optional references open in your browser.

The app owns `127.0.0.1:4187`. A second launch focuses the existing window; a port conflict shows a startup error. Work lives in `%APPDATA%\Irish Electrical Lab`, outside installation files, and replacement installers preserve it.

## Learn a course

Choose **Learn → Courses** and select or search a configuration. Six stages organise every course: **Look → Predict → Build → Try → Measure → Fix**. One activity and its next action appear at a time. **Show me where** focuses equipment. **More detail** contains all steps, notes, apprentice explanations and references.

A guided Build begins with equipment laid out, wires removed and every represented external, PV or battery source isolated. Adding the correct wire for the displayed step checks its endpoints and conductor identification, records that demonstration and moves to the next step automatically. A wrong connection remains on the bench for investigation and does not advance the instruction. **Check connection** remains available when revisiting an existing connection or continuing after reload. Stage navigation, Undo/Redo and previously drawn wires do not automatically award new demonstrations.

Try operates controls; Measure records readings; Fix investigates, diagnoses, repairs and retests. In configurations **47 and 48**, the first Try instruction names the PV or battery source to enable manually with **Operate**, as well as enabling the external supply. You can jump stages or skip steps; navigation alone does not demonstrate them. Reading, demonstrated activities, tested builds and repaired faults are recorded separately.

## Build in Sandbox

Choose **Sandbox**, then **My builds → New circuit** or **Start from example**.

- **Add equipment:** search or choose a category, then click the bench. A snapped ghost shows size and occupied space. Placement returns to Select.
- **Select:** click a rocker, lever or button to operate it; drag the housing to move it. Selected equipment offers Rotate, Duplicate, Delete and **Operate / toggle control**.
- **Connect:** click two rear terminals. The context describes source and hovered destination. For an attached lesson, the exact terminal pair sets the default conductor identification in either click order, including control wires fed from a line terminal. A manual identification choice takes priority for that pending wire, allowing deliberate mistakes. Existing wires keep their identification. Escape or **Cancel connection** cancels the pending wire.
- **Measure:** click terminals for probes, or a conductor for current.

In the default **Orbit camera**, drag the background to orbit, scroll to zoom and right- or middle-drag to pan. **View** also offers **Free camera**: click the bench for keyboard focus, use **W/A/S/D** to move, **Q/E** to lower or raise and **Shift** for faster movement. Right-drag looks, middle-drag pans and scrolling moves forward or backward smoothly. Camera movement settles when released; typing, modal dialogs and equipment dragging suspend it. Left-click still operates equipment, selects wires and connects terminals.

**View** contains camera angles, **Focus selected**, **Remove cover**, **Exploded view** and **Cutaway view**. Switching camera modes preserves your position and direction. Choose **Workshop**, **Domestic utility room**, **Industrial training bay** or **Evening courtyard** to change the surrounding geometry, materials and lighting. Camera mode, speed, scenery and graphics quality are remembered separately from circuits and study progress. The View controls preserve terminal positions and connections.

One context appears at a time. Expand **Parts, terminals and settings** for deeper inspection, ratings, coordinates, resistance and wire bends; close the tools drawer for more bench space.

For a dimmer, select its housing and drag **Dimmer level** in the main controls. Its knob rotates and the actual connected lamp dims continuously. Click the knob or **Switch dimmer on** / **Switch dimmer off** to operate its push switch. The level control shows series resistance, voltage drop and current; one mouse drag is one Undo action. Zero opens the simulated dimmer. A bypassed lamp stays bright and an interrupted lamp stays dark.

Wrong connections remain allowed. **More → Wiring hints** shows one non-blocking finding without correcting the circuit. Unfinished lesson connections are distinguished from deviations. Colour does not change endpoints; spatial crossings do not create junctions. Routing reports paths needing attention.

**More** contains learning depth, graphics, supply settings, path tracing and help. Wiring hints and learning depth are remembered separately from study data. Path filters follow actual line, neutral, protective and control connections, including PE carrying no current.

## Test and measure

**Test circuit** stays above the bench, with visible testing feedback and a dated report retained after reload and in full backups. The first finding offers a next check and **Show on bench**; expand **All checks** for every result. Connection matching, operation and protective findings remain separate. Tests preserve controls and wires, recognise valid stopped states and mark older reports when the circuit changes.

Choose voltage, current or resistance in Measure, or change mode with the virtual meter dial. **Record reading** in a lesson, or **Record this measurement** in the tools context, saves actual evidence. Probe clicks alone earn no credit. Resistance requires represented sources isolated. **OL** means an established open circuit; unresolved readings show dashes and an explanation. **Hold button for a measurement** maintains a momentary command until released.

An extra PE-to-neutral-out connection is detected with the switch off; residual-current interruption follows actual imbalance when a load operates. A lit lamp alone does not prove correct wiring.

With **Select** active, click a 3D wire and press **Backspace** to remove only that wire. Backspace does not delete equipment or act while typing in a field or using a dialog. **Undo** restores the exact conductor and its connections; deletion marks the previous test for retesting.

Use Undo/Redo or Ctrl+Z / Ctrl+Shift+Z to recover edits. **Reset trips** preserves controls; a persistent defect can trip again. Fault practice reveals hints progressively and requires distinct, up-to-date measurements, an accepted diagnosis, repair and a passing retest.

## Save, replace and migrate

Drafts, progress and the last test autosave. **My builds → Save build** keeps a named snapshot. The menu also contains **Saved builds**, **Import circuit** and **Export circuit**, using existing JSON formats and Windows file dialogs. Limits remain **80 components, 300 wires, 512 solver unknowns** and **256 named builds**.

Replacing changed work offers **Save and continue**, **Discard and continue**, or **Cancel**. Discard replaces the working circuit; named snapshots remain available. For a backup restore, Save and continue also keeps the current circuit as a named snapshot in the restored build collection.

**Export full backup** includes the draft, named builds, progress, activities, measurements and last report. **Restore backup** validates before atomically restoring records; invalid files preserve current data. Export a full backup from the earlier browser version and restore it here to migrate. Browser data remains available. Older browser launchers still serve `127.0.0.1:4173` when a suitable Node runtime is available.

## Models and educational limits

Equipment ratings, terminal definitions and teaching-model notes are in `lab/lib/components.ts`, rendering code in `lab/lib/Equipment.tsx`, editable Blender assemblies and pipeline in `authoring/blender`, and runtime assets in `lab/public/models`. All **87 equipment variants** have detailed original construction: rear pressure-plate clamps, threaded fixings and washers, appropriate contacts, thermal elements, windings, circuit boards and process mechanisms. Editable Blender sources retain individual construction objects; static decorative geometry is combined by part and material for the app. Full and distance models share stable terminals and selectable functional parts. Real model thumbnails identify equipment in menus. These are representative study models, with conceptual internals labelled; the authoring guide records their architectural references and assumptions.

The environments use locally generated albedo, roughness and normal textures with local reflections. Contact shading, restrained emitter bloom and antialiasing run while frames are needed; **More → Graphics and supply settings → Graphics quality** selects automatic, high or economy settings. Each lamp's dynamic light follows its actual emitting power. Available dynamic-light slots are bounded for performance; all lamps retain their own power-driven surface brightness. Optical output is an illustrative proxy, not a lighting-design calculation.

Domestic lessons start at **240 V**, with **230 V nominal** available. Industrial lessons use **400 V line-to-line**, calculate phase-to-neutral consistently, and run at 50 Hz. The worker uses complex RMS modified nodal analysis and educational state machines with documented assumptions.

The dimmer uses a declared educational series resistance: `R = referenceOhms × (1/level − 1) + 0.001 Ω`, with zero or a switched-off control opening the path. The default reference is **960 Ω**, equivalent to a 60 W resistive load at 240 V. Actual connections and load impedance determine voltage, current and power. Lamp brightness follows its solved emitting power relative to its rating, including separate normal and battery modes for emergency lights. Real electronic dimmers control waveforms; equivalent resistor loss is not a prediction of their hardware heating or lamp compatibility.

This steady-state model does not establish manufacturer trip timing, transients, cable-design approval or installation certification. Restricted work belongs with Safe Electric registered contractors. References remain available in courses.

## Development and evidence

From `lab`, install dependencies, then run `npm run dev`, `npm run build`, `npm run desktop:pack` or `npm run desktop:installer`. See `lab/desktop/README.md` for packaging and profile details. The installed app needs no development dependencies.

Source checks cover the engine, all courses, hints/reports, storage, backups, routing, workers and models. Launch the packaged executable with **`--verify-guided-build`** for a focused app-owned native check of automatic progression, control-wire identification, deliberate mistakes, Undo/Redo, navigation and reload. It restores all original study records and window settings after the exercise. App-owned Electron diagnostics also cover installed interaction and desktop behaviour. See [the curated verification summary](verification.md) for release checks and scope. Raw local reports and learner recovery files remain in the ignored `verification` directory and are not published to Git.
