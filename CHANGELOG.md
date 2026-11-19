# Changelog

## 1.8.1 — At the workbench

- The 80 lessons use practical fitting names and shorter instructions. The notes on a 350 mA driver describe what happens to its current. The door contact and float switch each have their own explanation.
- Both bench meters show saved readings with their measuring points. The help explains what zero volts and OL can tell you, and when the bench has no reading.
- Large builds draw the fixed hardware on distant terminals in fewer passes. Each screw and wire opening keeps its shape and material. Selecting a terminal, connecting a wire and placing a probe still use the original model.

## 1.8.0 — On the landing

- Find the lighting breaker by trying the two handles and reading the lamp and socket voltages. A wrong choice can be put back, even after closing the app. House jobs now appear in search and lead on to the next unfinished job.
- Walk from the lower stair switch to the upper landing. The house drawing, steps and switch positions follow the same return stair.
- The terminal picker stays within reach above the phone keyboard. A cancelled touch during a two-finger gesture leaves the wire selection alone.
- The twin socket has deeper screw wells, a shaped rear body and a folded earth strip based on the BG 824 rear view.

## 1.7.0 — Follow the wire

- Three short jobs in Oakfield house let you try the cupboard door, both stair switches and the lighting breaker. Each check follows the voltage at the fitting. Closing the app keeps your place.
- The switch backs have the recessed case screw and stepped moulding seen on the BG fittings. The ceiling rose now has a separate cable opening and knockout. These features also appear in Economy graphics.
- The shop, plant, workshop and factory have walk-in work areas matched to their lessons, including a receiving bay, pump gallery and packing line.
- Oakfield now has a furnished sitting room, bedroom, back hall and study. The socket circuits run between their installed fittings. Follow a selected wire on site or look up its two marked terminals on the drawing.
- A busy routing worker can finish large builds while reporting its progress. The separate check for a stalled worker still recovers the wire display.
- Connect shows the two ends of the wire first. The named picker works alongside the 3D terminals. The chapter index shows which lessons you’ve completed through practical work.

- The opening exercise keeps the wall switch and lamp together. Use the rocker on the wall or the labelled control. Open the switch to see the metal contacts move.
- Wiring steps show the wire marking and the two terminals once. A wrong connection identifies both ends and gives you an Undo action.
- Operating tests give the reading, its unit or the actual contact position. Fault feedback names the two fittings. Explanations use the markings on the equipment.
- The distribution boards have recessed breaker handles, separate screw access and wire entries. The fork tester has working dial positions, HOLD, a backlight and a rear view.
- The cable picker shows cut ends so you can see the difference between solid wire and flex. Bell and LED wire choices work in either connection order.

## 1.6.0 — A closer look at the fitting

- Rewrote the coursebook, predictions, fault clues and worked answers across 80 lessons. Meter tasks name the fitting and terminal at each probe. Help explains trade words in the step where they appear.
- Rebuilt the backs of the wall switches, lamp holder, ceiling rose, double socket and fused connection unit from manufacturer photographs and drawings. The double socket has a fixed earth link between its two earth entries. The ceiling rose has a separate permanent loop. The shaver lesson now uses a two-pin isolated outlet with its own model and measuring points.
- Simplified My builds and the test report. An empty circuit now asks for equipment, an unwired circuit offers Connect, and an old empty-bench pass cannot reappear on reload.
- Updated room finishes, equipment mounting and graphics recovery. The same course, wiring and meter work in the equipment list when 3D is unavailable.

## 1.5.0 — Follow the installation

- Study 80 configurations in nine chapters. The extra-low-voltage chapter includes LED strips and drivers, two-entrance calls, three-wire proximity sensing, valve control and a mixed AC/DC practical.
- Walk between installed devices or choose them by name. Trace the intended circuit and actual wiring on drawings with equipment tags and terminal markings.
- Open distribution boards and inspect the individual devices on their rails. Choose bell and lighting cables and work with each core.
- Compare probe and fork readings with a T6-600-style tester. Try stripping, crimping and tightening a documented termination sample.

## 1.4.0 — Electrical coursebook

- Open the first lesson with a working switch and lamp. Eight searchable chapters lead from working examples through partial builds to complete practicals.
- Restore a bookmarked lesson and its circuit after visiting Sandbox, closing the lab or transferring a full backup.
- Choose equipment, terminals, probes and conductors by name. Learn from a worked reading and practise placing the probes independently.
- Choose a single conductor, flat twin and earth, or round flex. Shared sheaths contain individually connected cores.
- Inspect equipment through its device-specific access positions and markings.

## 1.3.0 — iPhone and Quick practice

- Add an iPhone Home Screen app with a compact 3D workbench, touch camera and
  controls, searchable terminals, and a download for offline use.
- Compare live simulator readings in six short Quick practice experiments.
  Existing courses retain their stages, checks and progress.
- Use full study backups to move drafts, builds and progress between devices.

## 1.2.1 — public source release

- Correct guided connections automatically verify and advance one activity.
- Control-wire identification follows the required terminal pair in either
  click order, while explicit learner choices remain available for fault study.
- Retain all 64 courses, detailed original models, simplified Learn/Sandbox
  workspaces, WASD free camera, individual wire deletion and power-driven dimming.
- Publish the original 80-component, 228-wire integrated process plant example,
  its operating guide and reproducible verification.
- Include source and Blender assemblies under MIT, retained third-party notices,
  fresh-clone development instructions and contribution guidance.
- Make installer test-fixture generation independent of private local evidence;
  remove machine-specific launcher paths and textual PNG metadata.

Source and installed-app verification are summarised in `docs/verification.md`.
The educational model limits and privacy guidance still apply.

## Earlier development

The preceding local releases established the offline Electron desktop shell,
full backups, six-stage courses, cleaner sandbox, detailed equipment library,
scene graphics and free-camera navigation. This repository starts with the
complete working project; the earlier local working sessions are not represented
as separate Git commits.
