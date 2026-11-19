# Verification summary

## 1.8.1 lesson wording, meters and terminal hardware

**Following the markings.** A before-and-after check of all 80 examples found the same 509 placed fittings and 2,101 terminal positions and markings. All 2,471 activities retained their identifiers and expected checks. The inspector and the lesson now distinguish the steady-voltage strip driver from the steady-current driver used for the two downlights. The transformer calls its output terminals SEC 1 and SEC 2, matching the markings on the bench.

**What still reaches the screen.** An independent check loaded all 109 distance models. Across their normal views, all 371,635 visible terminal triangles retained their position, winding, normals, texture coordinates, vertex colours, material and shadow settings within floating-point tolerance. Eighty variants used fewer draw calls. Across one of each model the terminal draws fell from 1,591 to 805. Open, exploded and cutaway views retained the original 485,395 visible terminal triangles in each of those checks.

**Same camera on the same circuit.** The 80-piece plant went from 3,055 draws to 2,090 and submitted exactly 1,197,235 triangles in both images. Forty of 595,251 pixels changed in a same-frame comparison. The 30-piece bench went from 1,262 to 1,047 draws. Eight of 930,928 pixels changed. Its grouped bounds submitted 176 additional triangles at the edge of the camera or shadow view. The original individual meshes still receive hits from the mouse, wire tool and probes. Full-detail and selected fittings keep their individual render meshes.

**Performance on the Windows PC.** In two quiet runs for each build on a Ryzen 7 5700X and RTX 5070 Ti, desktop movement around the 80-piece plant averaged 53.0–53.1 fps in 1.8.0 and 59.2–61.9 fps with the new renderer. The 95th-percentile frame time fell from 24.1–24.5 ms to 20.3–21.6 ms. These results include frames slower than 60 fps. At a phone-sized touch viewport on the same PC the corresponding ranges were 53.6–56.4 and 60.2–68.6 fps. Shared-load runs had much wider variation. In one comparable 30-piece desktop pass the frame time at the 95th percentile fell from 6.8 to 5.8 ms. No physical iPhone timings are available.

**Picking and inspection.** In each of the normal, distance-only and disconnected browser runs, 1,980 physical rays and 220 terminal anchors matched across ten states. Checking the socket selection as the distance model gave way to full detail showed an outline movement of 0.00010 scene units, matching the small difference between the two authored boxes. Saved wire ends followed their fitting after a turn.

**Learner controls.** At 1280 × 800 and a 390 × 844 emulated touch screen, a fresh learner session distinguished the breaker’s two terminals marked N using “N · Supply” and “N · Load”. Using the equipment list, two T6 probes on Hall light L and N gave 240 V. Saving it showed “240 V” and “Hall light · L → Hall light · N” in both layouts. Selecting the 350 mA driver showed how it keeps current steady. Selecting Housing then showed what the case does. This check used the equipment list with 3D off. Separate 3D checks are described above. A physical iPhone and a session with a new learner or a qualified electrician remain outstanding.

**Electrical and offline checks.** All 352 source tests passed. The 80 working circuits and their 80 fault exercises passed, along with 1,382 electrical checks across 240 operating steps. Earlier and current versions agreed across 178 comparisons of simulation results and device states. TypeScript and the release builds passed. The changed source files retained the project’s existing ESLint findings. Windows Chrome and WebKit both reopened the downloaded lab offline, loaded a previously unopened PLC course, routed its wiring, and saved and reopened the 80-piece plant. A separate Windows Chrome session kept the 1.8.0 app and its partly completed stair job through a failed update. After retrying, 1.8.1 reopened offline at the second switch and the learner finished the job at 240 V.

**Windows upgrade.** The replacement installer, desktop shortcut and Start menu shortcut were checked on Windows 11. A disposable profile retained the draft, named build and progress from the published 1.8.0 Windows app at the same local address. The installed build ran all 80 circuits without external requests. A fresh test window reached its 3D view and two drawn frames in 1.74 s. Its aggregate working set was 434 MiB in that run. The graphics driver printed one shader compiler warning and linked the program successfully. The native second-launch, shutdown and window restoration checks passed.

## 1.8.0 house practical and phone controls

**Find the lighting breaker.** The released 1.7 job gave the breaker number away and offered only one handle on the job card. In the new job, opening the socket breaker left the lamp at 240 V and the socket at 0 V. Closing it restored both readings to 239.8 V. Opening the lighting breaker put the lamp at 0 V while the socket retained its supply. The simulator also accepted the other breaker when the two outgoing feeds were exchanged in a separate test.

In desktop and phone-sized Chrome and WebKit on Windows, a learner's wrong choice survived a reload. Returning the handle to its starting position took them back to the same check. Finishing the three jobs led to the existing unscored fault exercise. Searching the chapter index for “breaker” found both the short job and the related lessons.

**Walking the stairs.** Both flights, the turning landing, the first-floor landing and the two switch locations share the same plan in the room and the drawing. A keyboard walk reached eye heights of 1.56 m at the foot, 3.03 m on the turn and 4.50 m upstairs. Pressing the lower rocker put the light out. Pressing the upper one brought it back on. Both rockers could also be reached and tapped at a 390 × 844 touch viewport. The upstairs door is scenery. The [site authoring notes](../authoring/site/README.md) document the dwelling references and the limits of the modeled route.

![The lower flight, the view from the upper landing and the switch beside the upstairs door](images/oakfield-stair.jpg)

**Rear of the twin socket.** Full and distance models were checked against the BG 824 rear photograph and dimension drawing. Four conductor entries, their separate screw wells, the open centre and the folded earth connections are visible. The picking check reached each screw from above and all four saved wire ends stayed in place. The smaller moulded ratings are visible in full detail. The comparison uses the same camera and light on the workbench in both versions. [BG 824 product page](https://www.bgelectrical.uk/uk/wiring-devices/800-series/13a-sockets/824-01)

![Same workshop view of the rear of the released and revised twin socket](images/socket-back.jpg)

**Using a phone keyboard.** With a 390 × 844 touch viewport and only 345 px visible above the keyboard, the terminal search and all four luminaire choices were reachable. The first Enter focused a match and the second chose it. Wiring the lamp to the outgoing terminal added one wire. Undo restored the six original wires. Independent probes measured 239.96 V across the lamp and the selected conductor measured 0.25 A. A cancelled touch, including the loss of one contact during a multi-finger gesture, left wire selection alone. If the routing worker was unavailable, all six fallback wires could still be picked individually.

At 200% text on an 844 × 390 landscape viewport, both breaker names and voltage values reached 30 px. Enter restored the same handle with no further Tab presses. The next instruction took keyboard focus. The completion controls wrapped within the 312 px content column.

**Installed and offline builds.** The Windows installer replaced 1.7.0 on this PC. The Desktop and Start menu shortcuts opened the per-user executable. A disposable profile retained its draft, named build and progress through the upgrade. The installed runtime exercised all 80 circuits, made zero external requests and logged one warning from the linked antialiasing shader. A fresh-profile launch using the installed renderer reached the site canvas and two frames in 1.58 seconds. The matching Electron runtime used 429 MiB across its processes 1.3 seconds later.

Windows Chromium and WebKit downloaded the 41.4 MiB offline pack after an interrupted download. With the web server stopped, both opened a previously unvisited PLC lesson and reopened a saved 80-piece plant with all 228 wires. Neither browser made a request to the origin while offline.

A separate Windows Chrome run downloaded the published 1.7.0 pack and paused the stair job after the lower switch. A failed 1.8.0 socket download left the old pack usable. On retry, the new pack waited for the open tab to close. With the server then stopped and the browser offline, the job reopened at the upper switch. Pressing it gave 240 V and completed the job. The socket file in that offline session matched the new model's checksum.

**Workbench speed on this PC.** Two desktop camera runs at 1440 × 900 on the RTX 5070 Ti averaged 158 and 176 frames/s for 30 fittings and 42 wires. The corresponding runs with 80 fittings and 228 wires averaged 35 and 52 frames/s. The larger plant still falls below the 60 frames/s target. In the second run its wire paths took 2.29 seconds to calculate after import. A supply change took a median 168 ms to show a fresh result, compared with 16 ms on the smaller bench. Neither scene sent simulation or routing requests during the idle check.

**Regression coverage.** All 347 source tests passed. All 80 example circuits and their 80 faults ran through the electrical audit. The teaching audit checked 1,382 electrical results across 240 operating steps. All 2,471 activities kept their identifiers and stage mappings. Phone measurements above used Windows browser emulation. A physical iPhone session, first-time learner observation and a qualified electrician’s assessment of the installation examples are outstanding.

## 1.7.0 fittings, wiring and house jobs

**Courses and fault finding.** All 340 source tests passed. All 80 working circuits and their 80 set faults were exercised. The teaching audit checked 240 operating steps and 1,382 electrical results across the supply settings. The six-stage index retained all 2,471 exercises. In a full one-way build, each correct wire advanced the instruction. A seventh wire from outgoing neutral to earth failed the protective check. Undoing that wire and retesting passed. Independent probe placement at the lamp gave 240 V. Opening the switch dropped the reading across the lamp to zero.

**Learning and controls.** The three house jobs ran in phone-sized and desktop Chrome and WebKit on Windows. The stair job reopened at the second switch with the first switch still in its previous position. At the board the lamp lost power while the socket kept its supply. A named terminal, the first end of a wire and an actual meter reading were exercised through the UI. Keyboard, mouse and touch runs covered the first build. The short landscape layout was also tested at 200% text.

**Fittings and sites.** Fronts, backs and picking were checked on the BG wall switches and ceiling rose, the five protection devices and the fork tester. A selected terminal stayed with its conductor when a fitting was inspected. All 1,110 conductors in the 80 reference circuits passed the routing check. An installed socket circuit was followed through Oakfield in the plan and in the rooms. The floor plan and visible fittings use the same positions. The plans are original examples. The equipment sources in the authoring directory distinguish photographed features, published dimensions and simplified internals.

The two-way switch now shows the lower screw tucked into its moulded recess. On the rose, the open cable entry and the unopened knockout are separate features.

![Before and after. The improved switch has a recessed lower fixing, and the ceiling rose has a separate knockout marked REMOVE.](images/switch-and-rose.jpg)

**Meter and lesson wording.** The doorbell lesson uses the tester’s V setting for both AC readings. The high-water exercise describes the two lights actually wired on that bench. Its fault leaves the warning light dark. The proximity-sensor question asks whether the indicator lights when metal approaches. Trade names printed on equipment are retained beside a plain explanation.

**Rendering on this PC.** The benchmark moved the camera in desktop Chrome on Windows 11 with a Ryzen 7 5700X and GeForce RTX 5070 Ti. The smaller bench had 30 fittings and 42 wires. The process plant had 80 fittings and 228 wires. Every model and wire picking target was present in both sizes. Camera movement and a 2.4-second idle check sent no worker requests. Machinery continued to animate in the running plant.

| View and circuit | Mean frames/s while moving | 95th-percentile frame | Route worker round trip | Median supply click to new result |
| --- | ---: | ---: | ---: | ---: |
| 1440 × 900 desktop, 30 fittings | 149 | 9.1 ms | 205 ms | 16 ms |
| 1440 × 900 desktop, 80 fittings | 45 | 27.7 ms | 2,534 ms | 303 ms |
| 390 × 844 touch emulation, 30 fittings | 220 | 6.0 ms | 177 ms | 14 ms |
| 390 × 844 touch emulation, 80 fittings | 51 | 24.7 ms | 2,159 ms | 306 ms |

These headless browser measurements use the PC GPU. The large plant falls below 60 frames per second during camera movement. Inspected fittings keep their detail when Auto reduces the drawing resolution.

**Wire routing under load.** The actual worker routed all 228 plant wires in 12.38 seconds with scheduling delays deliberately injected. The app kept it running as it reported progress through the search. A separate stalled worker repeating the same checkpoint was stopped after 8.03 seconds. Recovery restored all 42 selectable wires in that test.

**Offline and saved work.** Windows Chromium and WebKit each downloaded the complete pack after an interrupted download. Closing the static server, reopening the app, opening a previously unvisited PLC lesson and importing the large plant exercised both workers offline. The saved plant reopened with all 228 connections and zero requests to the origin. The release pack is about 41.5 MiB. A separate failed-update test retained the preceding working cache.

**Windows replacement.** The per-user installer replaced 1.6.0 with 1.7.0 on this PC. The Desktop and Start menu shortcuts both pointed to the installed executable. An upgrade check on a disposable profile retained the draft, named build and progress at the existing origin. The installed lifecycle check covered a second launch, shutdown and remembered window size after restart. Verification runs use their own profile in the temporary directory.

The final installation matched all 375 packaged web assets. Its worker returned results for all 80 circuits with zero remote requests. The graphics driver reported one warning for a successfully linked antialiasing shader. In a separate single launch with a fresh temporary profile, the installed renderer reached the site canvas and drew two frames in 1.72 seconds. The matching Electron runtime used 482 MiB of working memory across its processes 1.3 seconds later.

**What still needs people.** These are software and browser observations. A physical iPhone test, a session with a first-time learner and a qualified electrician’s review of the installations are still outstanding.

## 1.6.0 coursebook and fittings

**Course checks.** All 317 source tests passed. The catalog check covered 80 courses and 109 equipment variants. The simulation audit ran each working example and its fault. The teaching audit covered 2,471 activities, 240 operating steps and 1,382 electrical checks across the supply presets. All 1,110 example wires found routes with clearance.

**Learning through the interface.** An automated learner used the real buttons, keyboard, equipment list, workers and local saves to complete all ten lighting courses. The run covered 96 activities, including 16 wire placements and 20 independently placed probe endpoints. The two-way switching practical passed its 28 checks. Returning to the opening course restored the step and the open switch. The EV fault exercise required readings at the controller and charger, an accepted diagnosis, a repair and a fresh test. An ordinary fault exercise and a scored one with a hint both completed.

**Fittings.** The wall switches, rose, lamp holder, socket, fused outlet and isolated shaver fitting were checked against manufacturer photographs and drawings. Full and reduced assets were checked for selection and terminal alignment. Picking the back of the switch and choosing the same detail by keyboard displayed the correct explanation. Inspections and electrical tests included the permanent loop, the double socket's two earth entries and the shaver output's isolation. Rendered geometry is an original reconstruction. Several small dimensions and concealed mechanisms are inferred from the available views.

**Windows.** The replacement installer updated the existing 1.5.0 installation. Both shortcuts point at 1.6.0. All 362 installed web files, the executable and the application shell matched the production build. An upgrade rehearsal held the app origin constant and verified that the draft, named build and progress survived in a disposable profile. On this PC a fresh Electron profile reached the installed Site canvas plus two frames in 1.52 seconds and used 463 MiB across processes at the sample point.

**Rendering.** In desktop Chrome on the RTX 5070 Ti, a 30-component, 42-wire bench at 1440 × 900 had a median frame interval of 4.5 ms during mouse camera movement and a 95th percentile of 6.5 ms. During a three-second idle check it issued zero renders and zero worker requests. Eight electrical edits took a median of 4.25 ms for the calculation and 11.5 ms round trip.

**Mobile and offline.** Touch-emulated Chromium at 390 × 844 and 844 × 390 exercised the production app. A forced graphics interruption restored the lesson and switch position. The offline download recovered from an interrupted file and verified all 237 application, equipment and scene files (42.8 MiB). With its server stopped, the app opened a previously unvisited PLC lesson, routed and solved the 80-piece, 228-wire plant, saved the draft and reopened it. It made zero requests to the origin. A backup also travelled from a desktop-sized profile to a phone-sized profile and back, retaining the circuit, switch position, named build, learning history and place in the lesson.

**Field checks still outstanding.** No independent learner, apprentice or qualified electrician participated in these tests. Physical iPhone Safari, Home Screen installation, the iOS Files picker, and comparison with an actual meter still need hands-on checks.

## 1.5.0 installation lab

**Lessons and equipment.** All 80 examples passed their operating sequences and authored fault checks. The teaching audit exercised 2,471 activities, 240 operating steps and 1,382 electrical checks. The 68 single-phase examples were checked at 230 and 240 V, and the 12 three-phase examples at 400 V between phases. The source suite passed 302 tests, with another 46 passing in the independent authoring simulator.

**On the bench.** Keyboard controls took the two-push doorbell lesson through its guided stages, including separate front and rear calls and a 12 V AC measurement. In the tunable-white lighting lesson, moving the control through its range gave warm/cool branch powers of 12/0, 6/6 and 0/12 W. The isolated supply measured 24 V DC. A broken warm branch gave OL on the isolated resistance test. A measured diagnosis, repair and fresh 30-of-30 retest completed the exercise. Site interaction tests clicked the actual wall switch and cupboard door, checked the resulting circuit states and confirmed that a camera drag over a control left it alone.

**Model and drawing review.** The library covers 108 original Blender variants with full and reduced exports, including 21 additions. All 80 site views were rendered and reviewed. The Gamma and Invicta assemblies were checked with doors open and closed, fronts removed and devices mounted. Detaching the board bond produced the expected protective finding. Clearance checks covered 1,110 conductors across the course examples. The diagrams and named controls retain the same component and terminal identifiers as the circuit.

**Windows.** A 30-component, 42-wire bench at 1440 × 900 on an RTX 5070 Ti rendered 1,505 frames during 6.53 seconds of mouse camera movement. The 95th-percentile frame interval was 5.6 ms. Over three seconds idle it issued zero renders or worker requests. Eight electrical edits took a median of 4.75 ms in the worker and 13.25 ms round trip. The packaged site reached its canvas plus two frames in 1.82 seconds in a fresh Electron profile. The combined process working set sampled shortly afterwards was 451 MiB. These are single-machine renderer and process measurements.

**Upgrade and offline use.** The 1.5.0 installer replaced the 1.2.1 installation on the test PC. Desktop and Start menu shortcuts both pointed to 1.5.0. All 351 installed web assets, the executable and the application shell matched the build hashes. Separate upgrade rehearsals at the desktop storage origin retained the draft, named build and progress from 1.2.1 and 1.4.0 in disposable profiles. A study backup also made a round trip across three browser profiles using desktop and phone-sized layouts.

In touch-emulated Chromium, the 37.8 MiB offline pack recovered from an interrupted download and verified all 227 files. With the server stopped and the browser offline, a cold launch loaded a previously unopened PLC course with 35 conductors. The Sandbox then imported, solved, saved and reopened the 80-component, 228-wire plant. The successful run recorded zero requests to the origin and zero renderer errors.

**Field validation.** Phone interaction used Chromium touch emulation. Physical iPhone Safari, Home Screen and Files behaviour, comparison with a calibrated tester, and observation by a qualified electrician or first-time learner still need in-person checks. Manufacturer sources document the equipment references. The simulation describes its steady-state and instrument assumptions in the app.

## 1.4.0 coursebook and workbench

The curriculum audit covered all eight chapters, all 64 electrical scenarios and fault targets, 196 operating steps and 1,058 electrical checks. Every one of the 2,021 original six-stage activities retained its ID. A separate test checks each coursebook question, prepared build, chapter practical and the boundary between assisted and independent meter readings.

The production browser completed the ten Lighting courses in sequence with 3D disabled and keyboard-accessible controls. It traversed all 96 activities, retained 75 demonstrated achievements, added the 16 missing conductors, and selected 20 independent probe points. Each named next-lesson action led to its intended course. The two-way switching practical began unwired and passed all 28 final report checks. A new lesson resets the active probe to red so the next measurement can begin straight away.

In a disposable browser profile, keyboard input completed the first switch lesson and independently recorded 239.96 V. Quick practice accepted an unsure prediction and a subsequent observed change from 240 V to zero. On the dimmer bench, lamp power rose from 3.7 W at 25% to 48.6 W at 90%. Searching for a motor that stays on after Start led directly to the unwired practical. Separate profiles with desktop and phone-size viewports transferred a named build, circuit revision, study history and precise coursebook activity through two full backup restores.

With WebGL disabled, keyboard input through the equipment list completed a fault exercise and a fresh retest. An extra connection from RCBO outgoing neutral to the lamp’s protective earth produced a specific finding. The test selected that conductor, undid the edit, reset the tripped protection and retested. Ordinary practice accepted help without a score. The separately selected scored challenge recorded 85/100 after one hint. Browser layouts were exercised at 320 and 390 CSS pixels in portrait and 844 in landscape, including enlarged text.

The model review covered both detail levels and the service view of all 87 variants. Geometry checks exercise the actual access direction to enclosed terminals. The renderer’s clearance tests cover 931 course connections and the 228-wire integrated process plant. The 3D mouse test added all six one-way lighting conductors and all 18 shutter-control conductors, checking that each correct wire advanced exactly one activity. The editable sources were decompressed and checked for personal workstation paths.

**Windows GPU benchmark.** At 1440 × 900, headless Chromium used an NVIDIA RTX 5070 Ti through Direct3D 11. The 30-component bench routed 42 conductors in 116.5 ms. During real mouse camera movement the renderer issued 1,377 frames in 6.53 seconds (211 renderer frames/second, 95th-percentile interval 6.3 ms). These figures measure rendering, not monitor presentation. Over 3.01 seconds at rest there were zero renders or worker requests. Eight electrical edits had median worker calculation time of 4.2 ms and median round trip of 11.9 ms.

**Offline browser.** The installation pack contains 185 verified files (35.1 MiB). During a forced interruption the download offered Retry. With the origin server shut down and networking disabled, a cold launch loaded the previously unopened PLC lesson and all 35 wires. The 80-component process plant routed all 228 wires, saved, and reopened. On Windows Chromium at 390 × 844 with software WebGL, file selection through routing and two rendered frames took 6.7–7.8 seconds across two runs. The last solves took 786–900 ms. The two render samples read 6 and 7 fps. Physical phone and GPU timings can differ.

**Windows delivery.** The source suite passed 280 tests plus 46 independent authoring simulator tests. The Windows x64 release uses Electron 44.9.1, which includes the [upstream certificate-trust fix](https://github.com/advisories/GHSA-jr5w-w6x2-84p9). The setup contains the offline production renderer, both workers, models, guides and notices. Upgrade retention was exercised with renderers extracted from the 1.3.0 and 1.4.0 installers at the desktop storage origin in a disposable Electron profile. The existing draft, named build and progress survived. The live Windows study profile was outside this test.

**Human and device observations.** These are automated electrical and interaction results. No first-time learner, apprentice or qualified electrician participated in this verification. Physical iPhone Safari, Home Screen installation, Files transfer and physical-device performance still require direct observation.

## 1.3.0 iPhone and Quick practice

- Type checking, 263 source tests and the catalog, operating scenario and teaching audits passed across all 64 courses. The audits cover 2,021 existing activities. The experiment tests use actual simulation results, including the timer run-on and holding contact sequences.
- The web artifact audit served the project subpath, verified all 87 equipment variants and exercised both emitted workers. It verified all 185 offline files, download retry, and keeping an earlier offline copy when an update fails.
- Chromium touch emulation at 320 and 390 pixels in portrait and 844 pixels in landscape passed without horizontal page overflow. The browser reopened the app offline, loaded an equipment model that had not been opened, completed the live one-way experiment (240 V to 0 V), and advanced guided wiring after a correct named-terminal connection.
- The Windows x64 installer builds with 287 bundled web assets and both workers. The renderers extracted from the 1.2.1 and 1.3.0 installers were exercised at the desktop origin in a disposable Electron profile. The draft, named build and progress were retained. This test did not run an in-place NSIS installation on the learner's profile.
- Safari, Home Screen installation, Files dialogs, and performance on a physical iPhone require device testing. Chromium checks do not measure phone performance.

## 1.2.1 Windows release

The installed Windows release is **1.2.1**. This curated summary contains no learner profiles or raw database recovery files. Raw local evidence remains outside Git in the workspace's ignored `verification` directory.

The guided wiring repair passes **249 source tests**, type checking, targeted changed-module lint and the production build. Source cases cover all 64 courses and their 931 connection steps, both endpoint orders, correct control-wire identification, deliberate identification overrides, duplicates and stale additions.

The final installed app passes **120 focused native checks**. Actual mouse input completes the six lighting and eighteen shutter-control connections without manual Check/Next. Each correct addition credits exactly one activity; wrong endpoints and explicit wrong identities do not advance. Settings renders, stage navigation, Undo/Redo and reload do not replay awards. Every original profile key and native window state is restored exactly after these tests.

All **64 configurations** converge through the actual packaged calculation and routing workers: **931 routed paths**, zero routing issues, console errors or remote requests. The installer matches all 287 bundled web assets and the desktop shell. Actual replacement installation retains saved work, Desktop and Start menu shortcuts, and the stable local origin. The server stops when the app closes.

The previous graphics release also passed its original Blender asset and native gallery audits for **87 equipment variants**. Those gallery and frame-rate observations were not repeated for this focused repair. Source files and original models are included; generated installers, runtime copies, downloaded Blender and private recovery artifacts are excluded from Git.

Run the source tests from `lab` with Node and installed dependencies:

```powershell
node --import tsx --test scripts/*.test.ts scripts/*.test.tsx scripts/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

The app-owned `--verify-guided-build` and `--verify-desktop` diagnostics check the actual Windows application. Read the desktop guide before deliberately running profile-restoring verification modes.

## Public release preparation

The complete source suite was rerun for publication: **249 tests passed**, with
type checking and changed-script lint. Packaging now generates its QA fixtures
from the source instead of depending on an ignored local file. The regenerated
catalog routing audit passes **931 of 931 paths**. The production build, offline
asset audit and actual emitted calculation-worker audit pass after asset cleanup.

All **88 source PNGs** were audited. Text metadata was removed from 87 thumbnails;
all image-data, critical and retained-chunk hashes remained identical. The icon
was already clean. Blender exports now perform the same sanitization, with five
regression checks. Profile records, raw recovery evidence, downloaded tools and
generated runtime directories remain excluded from the public repository.

The original process-plant example has **80 components, 228 wires, 32 passing
source checks**, zero route-clearance issues and a maximum of **340 solver
unknowns** across its checked scenarios. Native Windows file-dialog import and
named-build saving succeeded. Its actual in-app electrical test passed with no
reported protective defect; course operating objectives correctly remain
unassigned for this free build. The source operating checks are distinct from
that native electrical report.

Native mouse operation also reset the process safety permission and pulsed the
conveyor START control. After the momentary button released, the selected
contactor still reported **Operating**, with **23.9 V across its coil**. This
demonstrates the actual custom holding path in the installed app.

The public installer was rebuilt from the reviewed source and sanitized assets.
Its unpacked resources contain **303 files**; all **287 web assets** match the
production build. Project/dependency notices, the usage guide and the demo JSON
match their source copies. No current-user name/profile-path marker was found
in those resources, and the desktop shell archive contains neither learner
profiles nor a runtime `node_modules` tree. The compiled setup executable is
**130,546,212 bytes**; its checksum is supplied with the release download.

The public-source index audit covers **736 files**, with zero credential,
current-user name/path or excluded-artifact findings. These checks describe the
publication set, not raw private verification files. Existing native release
behaviour and this session's demo interactions were inspected in the installed
application; replacement installation was not repeated for attribution-only
packaging changes.
