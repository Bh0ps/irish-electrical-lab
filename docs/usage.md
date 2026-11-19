# Irish Electrical Lab for Windows

An offline 3D study game for Irish domestic, commercial and industrial electrical arrangements. All **80 configurations** are available in **Learn** and **Sandbox**. Start with the hall light, try a short job in Oakfield house, or build a circuit of your own.

## Start and stop

Open **Irish Electrical Lab** from the Desktop or Start menu. Close its window or choose **File → Exit** to stop the app and private server. **More → Fullscreen**, the window menu **View → Fullscreen**, or **F11** changes fullscreen; normal window size is remembered.

Run `Irish-Electrical-Lab-1.20.0-Setup.exe` to install the lab or update an earlier copy. Setup includes the models, circuit simulator and cable router. After installation you can study offline. Reference links open in your browser.

On a phone, tap **Walk** or **Full screen** to open the room. Tap a direction for one step or hold to walk. Drag the room to look around. For one-handed use, turn on **Tools → One-thumb walking** and use the side arrows to steer. Choose **Go closer** to reach a fitting, or tap **Find** and search for its name or room. Tap **Zoom** in a close-up to read a small terminal marking. **Job** keeps your place while you take readings. **Put meter away** returns to the site. In the two-door bell job the hall chime gives a short caption and a sound for each new call. The two sounds are examples chosen for this lab. You can turn them off in Settings or Site tools. For installation and controls, follow the [Home Screen and touch controls guide](iphone.md).

Open **Chapters → Quick practice** to try a working circuit. Make a prediction, or choose **I’m not sure — let me try**. Use the switch, dial or Start button on the lesson card or on the equipment itself. Compare the readings before and after. **Back to lesson** opens the full course.

The app owns `127.0.0.1:4187`. A second launch focuses the existing window; a port conflict shows a startup error. Work lives in `%APPDATA%\Irish Electrical Lab`, outside installation files, and replacement installers preserve it.

## Try a kitchen repair

Open **Chapters → The heater stays cold**. Work the wall switch and take two readings on the virtual bench. Once you have found the fault, choose **Find repair on site**. Switch off the simulated supply and open the fitting. The back box stays on the wall while the plate comes forward. Look for the loose wire from the heater flex. Tap its terminal or choose **Reconnect flex** to use the printed markings. Restore the supply. Switch the heater off, check its watts, then switch it back on. Choose **Test the repair** once you’ve seen it draw power again. This room stays at 18 °C so you can also try the heater’s manual temperature setting.

## Read a fitting or a meter

On the Oakfield board the numbered breakers show **I** for on and **O** for off. The wider shared RCCB has a separate **T** test button. In this model, its upper window shows red when the contacts are closed and green when they are open. The separate lower window turns yellow after a residual-current trip. The two outgoing breakers and their shared feed are the arrangement chosen for this lesson. [Hager NBN116A breaker](https://hager.com/ie/catalogue/products/nbn116a-mcb-1p-10ka-15ka-b-16a-1m) · [Hager CDA240U RCCB](https://hager.com/ie/catalogue/products/cda240u-rccb-2p-40a-30ma-a)

Choose **Show terminals** to see the marks on a fitting. In the one-way lighting lesson the breaker has two terminals marked **N**. **Supply** identifies the incoming neutral and **Load** identifies the outgoing neutral. On the stair switches, look for **COM**, **L1** and **L2** on the back.

In a lesson asking for volts, choose the fitting. Pick the marked point for the red probe, then the one for black. You can also touch the points on the 3D fitting. Choose **Record reading**. If you picked the wrong pair, the lesson names the two points you measured and lets you try again. Open **Meter controls** to change instruments or use the fork.

Open **Saved readings** in either meter to see what you recorded. A fork reading shows the number on the tester. For a voltage reading it also shows the earth reference you used. A reading from before a circuit edit is marked **Earlier reading**. Expand **Where it was measured** to see the saved points.

## Check both doorbell buttons

Open **Chapters → Jobs at Oakfield house → Check both doorbell buttons**. The two buttons ring the same chime. One tap holds a button down in the lab, and a second tap lets go. Open the chime’s front panel to reach the five screws. You can also choose a screw by its marking from the probe list.

Leave one probe on **=/~**. With the other on **C1**, compare the reading with the front button pressed and released. Then move that probe to **8/12V** to check whether the chime still has its supply. **C2** is the back door in this circuit. **V** is for another way of connecting the buttons and is spare here. The bench reports which input is active. The sensing voltage on V and the length of the chime sound depend on the electronics. [Grothe CROMA 100A installation sheet, page 5](https://www.grothe.de/media/a8/32/9a/1669388291/iba_croma100a_43170-mv003000_2021-08-10.pdf)

## Find equipment on a job

In **Site**, use **Go to** to find a fitting. In Oakfield house you can also choose a room, such as the sitting room or bedroom. While walking, drag to look around and use WASD, the arrow keys or the direction pad to move through doors. At the stairs you can press either rocker as you walk past. **Finish walk** returns you to the usual site controls. **Inspect** opens the fitting on the workbench. You can also operate it from **Equipment list**. In the two-entrance doorbell lessons, choose **Go to → Back entrance** to visit the garden door. Choose **Cables**, then **Show on plan**, to follow a wire back into the house.

In **Drawing**, choose **Job drawing** for the intended connections and **My wiring** for the current build. Select an equipment tag on the location plan or a pin on the terminal sheet. Select a conductor to see both ends and whether the current build matches it. **Find** travels to the selected end. The dashed site overlay indicates which endpoints are connected. Its route is illustrative. On applicable jobs, the sheet selector also offers a board schedule or a ladder tracing the control path to a load. Drawing selections are for inspection only.

In full screen, choose **Find → Room map**. The arrow shows where you’re standing and facing. In a close-up a dot marks the fitting in view. Tap a room on the plan, or choose it under **Room on map**. **Go to** puts you in that room. Under **Fittings here**, choose an item to see it up close. [See the Oakfield room map](images/oakfield-room-map.png).

## Try a house job

In **Try both stair switches**, turn the light off downstairs. Read the volts at L1 and L2 and choose which wire still has the feed. Upstairs, work out which wire the landing switch is using. Flip it and watch the lamp. The two wires between the switches are called *strappers*. The last display may say **No reading** when an unused wire has no connection to the supply. That’s different from measuring 0 V.

Use **Downstairs** and **Landing** to go straight to either rocker. The lesson brings the next switch into view while you’re following along. If you walk or turn the camera yourself, you can choose when to change floors.

Open **Chapters → Jobs at Oakfield house**, or search for a job by name. In the cupboard job, shut the door, watch the strip go dark, then open the door again. Use the fitting in the room or its named control. Both operate the same circuit.

Open **Find the lighting breaker** to try the consumer unit, the board in the utility cupboard. There are two numbered breakers. Try one and look at the hall lamp and kitchen socket readings. If the socket loses power while the lamp stays on, put that breaker back on and try the other. Use the levers in the 3D room or the labelled controls beside the readings.

The last check uses the shared switch marked **RCCB**. Turn its lever off. Both loads stop drawing current, so both read **0 A**. Put the lever back on and check their voltage again. The separate **T** button tests the trip. If you use it, reset the lever before carrying on. All these checks take place on the simulated board.

Already finished the earlier lighting-only job? **Continue learning** opens your saved place. Choose **Try the socket and shared switch** to do the extra checks. **Next job** opens another unfinished house job.

In **Meter the worktop lights**, turn off the left light and leave the right one lit. Open **Measure**, choose a strip and touch its two copper pads with the red and black probes. You can also pick the same points by name. Record each reading, then put the lights the other way round. If you move a probe to the wrong strip, you can move it again without starting over.

In **One worktop stays dark**, both switches are on. Put the red probe on the right strip’s + pad and black on its − pad. Record the reading. Leave black there and move red to the wire leaving the right switch. On the new rocker, that’s tab **1**. Record it and compare the two readings. If you prefer, choose the same points by name in **Equipment list**. After the repair, choose **Test the repair** to try both lights. **Continue learning** brings you back if you close halfway through.

In **Check the bathroom fan timer**, switch the bathroom light off. Watch the fan keep running, then stop five seconds later. Try the fan isolator with the light on. The light has a separate feed and stays lit. Choose **Go to → Outside fan grille** to see where the air leaves the house.

In **Check both doorbell buttons**, hold the front button and read the name on the chime. Let go, then try the back door. You can use the buttons in the house or the named controls in the job sheet. **Measure** and **Find conductor** keep your place. Choose **Back to job** when you’re done.

**Continue learning** takes you back to the last check with the controls where you left them. In the chapter index, a lesson shows **Completed** after its practical steps and final explanation have been checked. You can still choose **I’m not sure** on a prediction.

## Connect two terminals

Choose **Connect**, then pick the first terminal on the fitting or open **Choose terminal by name**. The **From** line shows your choice. Pick the other end to finish the wire. The wire marking and cable type are just below the two ends. Use **Cancel connection** to clear the first end, or **Undo** to take out a wire you just finished.

## Extra-low voltage

In **Chapters → Extra-low voltage**, start with a cupboard strip, then try independent zones, a long feed, dimming, bell circuits and control interfaces. The last practical combines a 12 V AC entrance call with a 24 V DC courtesy lamp. Follow the device markings for that circuit. A floating secondary has a defined voltage between its two terminals and may have no resolved reading to earth.

In **Connect → Cable**, choose the suggested construction or select another sample. Bell pair, two-core LED cable and multi-core strip cable give their cores distinct identifiers. Select conductors individually to connect, remove or restore them.

## Test equipment and tools

In **Measure**, choose the fork tester to use its dial, leads and open fork. Select one core for AC current, compare two test points with the voltage probes, or choose a reference for a FieldSense reading. Reverse the probes on an isolated DC output to see the sign change. HOLD freezes the display. Release it to record a fresh reading. Resistance and continuity require the simulated sources off. The model distinguishes open, out-of-range and unresolved measurements. Instrument bandwidth, contact and waveform assumptions are described with the reading.

The optional workshop exercises use a specific connector, ferrule or terminal sample. Choose a setting on the stripper, crimper or torque driver and see its effect on the sample. Use the linked product documentation to check that sample's value.

In Sandbox you can place a domestic or three-phase distribution board, fit its working example, open the door and lift the front shield. Select a device to see its rail and position. Fitting equipment to a rail is a mechanical action. Make its electrical connections in **Connect**.

## Learn a course

Choose **Start learning**, then **Turn the light off** on the first bench. Turn it back on and see the contact inside the wall switch. **Continue learning** restores your coursebook step and working circuit. **Chapters** lets you browse all nine chapters, search by a trade name or everyday phrase, or try a chapter practical directly. The early examples work immediately. Later lessons leave individual connections for you to complete. A chapter practical begins with an isolated, unwired bench.

If a trade word is new to you, open **Help → What do these words mean?** The definitions follow the current step. The six-stage exercises remain available in course details. **Help** starts with a clue. A worked meter example shows the two points and the voltage between them. For a probe-placement exercise, choose both points yourself in 3D or through **Equipment list** and record the reading. A predicted result, an observed result and a demonstrated measurement are tracked separately. Ordinary fault practice allows hints. Choose the scored challenge in the test panel if you want a score.

A guided Build begins with equipment laid out, wires removed and every represented external, PV or battery source isolated. Adding the correct wire for the displayed step checks its endpoints and conductor identification, records that demonstration and moves to the next step automatically. A wrong connection remains on the bench for investigation and does not advance the instruction. **Check connection** remains available when revisiting an existing connection or continuing after reload. Stage navigation, Undo/Redo and previously drawn wires do not automatically award new demonstrations.

Try operates controls; Measure records readings; Fix investigates, diagnoses, repairs and retests. In configurations **47 and 48**, the first Try instruction names the PV or battery source to enable manually with **Operate**, as well as enabling the external supply. You can jump stages or skip steps; navigation alone does not demonstrate them. Reading, demonstrated activities, tested builds and repaired faults are recorded separately.

## Build in Sandbox

Choose **Sandbox**, then **My builds → New circuit** or **Start from example**.

- **Add equipment:** search or choose a category, then click the bench. A snapped ghost shows size and occupied space. Placement returns to Select.
- **Select:** click a rocker, lever or button to operate it; drag the housing to move it. Selected equipment offers Rotate, Duplicate, Delete and **Operate**.
- **Connect:** choose two terminals on the device or in the named list. Expand **Cable** to see the cut ends of the usual cables for the lesson. Choose **More cable types** for the full set. A shared sheath holds individual cores. Select the core you want to connect, inspect or remove. Undo restores that edit. The context describes source and hovered destination. For an attached lesson, the exact terminal pair sets the default conductor identification in either click order, including control wires fed from a line terminal. A manual identification choice takes priority for that pending wire, allowing deliberate mistakes. Existing wires keep their identification. Escape or **Cancel connection** cancels the pending wire.
- **Measure:** click terminals for probes, or a conductor for current.

In the default **Orbit camera**, drag the background to orbit, scroll to zoom and right- or middle-drag to pan. **View** also offers **Free camera**: click the bench for keyboard focus, use **W/A/S/D** to move, **Q/E** to lower or raise and **Shift** for faster movement. Right-drag looks, middle-drag pans and scrolling moves forward or backward smoothly. Camera movement settles when released; typing, modal dialogs and equipment dragging suspend it. Left-click still operates equipment, selects wires and connects terminals.

**View** contains camera angles, **Focus selected**, **Remove cover**, **Exploded view** and **Cutaway view**. Switching camera modes preserves your position and direction. Choose **Workshop**, **Domestic utility room**, **Industrial training bay** or **Evening courtyard** to change the surrounding geometry, materials and lighting. Camera mode, speed, scenery and graphics quality are remembered separately from circuits and study progress. The View controls preserve terminal positions and connections.

One context appears at a time. Expand **Parts, terminals and settings** for deeper inspection, ratings, coordinates, resistance and wire bends; close the tools drawer for more bench space.

For a dimmer, select its housing and drag **Dimmer level** in the main controls. Its knob rotates and the actual connected lamp dims continuously. Click the knob or **Switch dimmer on** / **Switch dimmer off** to operate its push switch. The level control shows series resistance, voltage drop and current; one mouse drag is one Undo action. Zero opens the simulated dimmer. A bypassed lamp stays bright and an interrupted lamp stays dark.

Wrong connections remain allowed. **More → Wiring hints** shows one non-blocking finding without correcting the circuit. Unfinished lesson connections are distinguished from deviations. Colour does not change endpoints; spatial crossings do not create junctions. Routing reports paths needing attention.

**More** contains learning depth, graphics, supply settings, path tracing and help. Wiring hints and learning depth are remembered separately from study data. Path filters follow actual line, neutral, protective and control connections, including PE carrying no current.

## Test and measure

**Test circuit** stays above the bench, with visible testing feedback and a dated report retained after reload and in full backups. The first finding offers a next check and **Show on bench**; expand **All checks** for every result. Connection matching, operation and protective findings remain separate. Tests preserve controls and wires, recognise valid stopped states and mark older reports when the circuit changes.

Choose voltage, current or resistance in Measure, or change mode with the virtual meter dial. **Record reading** saves the meter value and the points you measured. Resistance requires represented sources isolated. **OL** means an established open circuit; unresolved readings show dashes and an explanation. **Hold button for a measurement** maintains a momentary command until released.

An extra PE-to-neutral-out connection is detected with the switch off; residual-current interruption follows actual imbalance when a load operates. A lit lamp alone does not prove correct wiring.

With **Select** active, click a 3D wire and press **Backspace** to remove only that wire. Backspace does not delete equipment or act while typing in a field or using a dialog. **Undo** restores the exact conductor and its connections; deletion marks the previous test for retesting.

Use Undo/Redo or Ctrl+Z / Ctrl+Shift+Z to recover edits. **Reset trips** preserves controls; a persistent defect can trip again. Fault practice reveals hints progressively and requires distinct, up-to-date measurements, an accepted diagnosis, repair and a passing retest.

## Save, replace and migrate

Drafts, progress and the last test autosave. **My builds → Save build** keeps a named snapshot. Your saved builds appear below it. Open **Files and backups** to import or export a circuit or back up your study progress. Limits remain **80 components, 300 wires, 512 solver unknowns** and **256 named builds**.

Replacing changed work offers **Save and continue**, **Discard and continue**, or **Cancel**. Discard replaces the working circuit; named snapshots remain available. For a backup restore, Save and continue also keeps the current circuit as a named snapshot in the restored build collection.

**Export full backup** includes the draft, named builds, progress, activities, measurements and last report. **Restore backup** validates before atomically restoring records; invalid files preserve current data. Export a full backup from the earlier browser version and restore it here to migrate. Browser data remains available. Older browser launchers still serve `127.0.0.1:4173` when a suitable Node runtime is available.

## Models and educational limits

Use **Show terminals** to turn the workbench to the wiring side. On the updated switches, lamp holder, rose, socket and fused connection unit, select a detail or look under **Recognise this fitting** to find out what it does. On the double socket, for example, the pressed metal strap joins the two earth terminals. On the ceiling rose, the permanent loop terminals stay separate from the switched feed to the lamp. The shaver lesson shows the transformer separately on the bench so you can measure its input and output.

There are 115 original equipment variants. The manufacturer references in the inspector show which devices informed each fitting. For photograph-based reconstructions, published dimensions establish the outer size and fixing centres. Small mouldings and internal parts are interpretations. Editable assemblies and the original source references are in `authoring/blender`. Ratings and electrical behaviour are defined separately in `lab/lib/components.ts` and `lab/lib/simulation.ts`.

The environments use locally generated albedo, roughness and normal textures with local reflections. Contact shading, restrained emitter bloom and antialiasing run while frames are needed; **More → Graphics and supply settings → Graphics quality** selects automatic, high or economy settings. Each lamp's dynamic light follows its actual emitting power. Available dynamic-light slots are bounded for performance; all lamps retain their own power-driven surface brightness. Optical output is an illustrative proxy, not a lighting-design calculation.

Domestic lessons start at **240 V**, with **230 V nominal** available. Industrial lessons use **400 V line-to-line**, calculate phase-to-neutral consistently, and run at 50 Hz. The worker uses complex RMS modified nodal analysis and educational state machines with documented assumptions.

The dimmer uses a declared educational series resistance: `R = referenceOhms × (1/level − 1) + 0.001 Ω`, with zero or a switched-off control opening the path. The default reference is **960 Ω**, equivalent to a 60 W resistive load at 240 V. Actual connections and load impedance determine voltage, current and power. Lamp brightness follows its solved emitting power relative to its rating, including separate normal and battery modes for emergency lights. Real electronic dimmers control waveforms; equivalent resistor loss is not a prediction of their hardware heating or lamp compatibility.

This steady-state model does not establish manufacturer trip timing, transients, cable-design approval or installation certification. Restricted work belongs with Safe Electric registered contractors. References remain available in courses.

## Development and evidence

From `lab`, install dependencies, then run `npm run dev`, `npm run build`, `npm run desktop:pack` or `npm run desktop:installer`. See `lab/desktop/README.md` for packaging and profile details. The installed app needs no development dependencies.

Source checks cover the engine, all courses, hints/reports, storage, backups, routing, workers and models. Launch the packaged executable with **`--verify-guided-build`** for a focused app-owned native check of automatic progression, control-wire identification, deliberate mistakes, Undo/Redo, navigation and reload. It restores all original study records and window settings after the exercise. App-owned Electron diagnostics also cover installed interaction and desktop behaviour. See [the curated verification summary](verification.md) for release checks and scope. Raw local reports and learner recovery files remain in the ignored `verification` directory and are not published to Git.
