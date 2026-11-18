# Verification summary

## 1.4.0 coursebook and workbench

The curriculum audit covered all eight chapters, all 64 electrical scenarios and fault targets, 196 operating steps and 1,058 electrical checks. Every one of the 2,021 original six-stage activities retained its ID. A separate test checks each coursebook question, prepared build, chapter practical and the boundary between assisted and independent meter readings.

The production browser completed the ten Lighting courses in sequence with 3D disabled and keyboard-accessible controls. It traversed all 96 activities, retained 75 demonstrated achievements, added the 16 missing conductors, and selected 20 independent probe points. Each named next-lesson action led to its intended course. The two-way switching practical began unwired and passed all 28 final report checks. A new lesson resets the active probe to red so the next measurement can begin straight away.

In a disposable browser profile, keyboard input completed the first switch lesson and independently recorded 239.96 V. Quick practice accepted an unsure prediction and a subsequent observed change from 240 V to zero. On the dimmer bench, lamp power rose from 3.7 W at 25% to 48.6 W at 90%. Searching for a motor that stays on after Start led directly to the unwired practical. Separate profiles with desktop and phone-size viewports transferred a named build, circuit revision, study history and precise coursebook activity through two full backup restores.

With WebGL disabled, keyboard input through the equipment list completed a fault exercise and a fresh retest. An extra connection from RCBO outgoing neutral to the lamp’s protective earth produced a specific finding. The test selected that conductor, undid the edit, reset the tripped protection and retested. Ordinary practice accepted help without a score. The separately selected scored challenge recorded 85/100 after one hint. Browser layouts were exercised at 320 and 390 CSS pixels in portrait and 844 in landscape, including enlarged text.

The model review covered both detail levels and the service view of all 87 variants. Geometry checks exercise the actual access direction to enclosed terminals. The renderer’s clearance tests cover 931 course connections and the 228-wire integrated process plant. The 3D mouse test added all six one-way lighting conductors and all 18 shutter-control conductors, checking that each correct wire advanced exactly one activity. The editable sources were decompressed and checked for personal workstation paths.

**Windows GPU benchmark.** At 1440 × 900, headless Chromium used an NVIDIA RTX 5070 Ti through Direct3D 11. The 30-component bench routed 42 conductors in 116.5 ms. During real mouse camera movement the renderer issued 1,377 frames in 6.53 seconds (211 renderer frames/second, 95th-percentile interval 6.3 ms). These figures measure rendering, not monitor presentation. Over 3.01 seconds at rest there were zero renders or worker requests. Eight electrical edits had median worker calculation time of 4.2 ms and median round trip of 11.9 ms.

**Offline browser.** The installation pack contains 185 verified files (35.1 MiB). During a forced interruption the download offered Retry. With the origin server shut down and networking disabled, a cold launch loaded the previously unopened PLC lesson and all 35 wires. The 80-component process plant routed all 228 wires, saved, and reopened. On Windows Chromium at 390 × 844 with software WebGL, file selection through routing and two rendered frames took 7.8 seconds. The last solve took 900 ms. A single render sample read 7 fps. Physical phone and GPU timings can differ.

**Windows delivery.** The source suite passed 280 tests plus 46 independent authoring simulator tests. The x64 setup contains the offline production renderer, both workers, models, guides and notices. Upgrade retention was exercised with renderers extracted from the 1.3.0 and 1.4.0 installers at the desktop storage origin in a disposable Electron profile. The existing draft, named build and progress survived. The live Windows study profile was outside this test.

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
