# Contributing

Use the [development guide](docs/development.md) to set up a Windows checkout, run the browser app, package Electron and regenerate models. The [verification summary](docs/verification.md) records the scope of previous checks; rerun the checks relevant to your change.

## Propose a change

For a bug, describe the configuration or saved circuit, the action taken, expected behaviour and actual result. Include the app version, Windows version and relevant screenshots or test findings. Use a minimal circuit JSON when possible, and remove personal study data before sharing it.

For a substantial new feature, explain the intended learning outcome and user interaction before expanding the equipment or simulation architecture. Keep a pull request focused on one coherent problem. Its description should explain the resulting behaviour and list the checks you actually ran, including any limitations.

## Preserve the learning contracts

Equipment definitions, stable terminal IDs and the actual connected graph link models to simulation and lesson assessment. Preserve versioned circuit and backup formats, or provide explicit validation and migration for a format change. Invalid imports must leave existing work intact.

Incorrect wiring remains an intentional learning tool. A visual label, chosen wire identity or predicted lesson answer must not force the simulated load to operate. Operating behaviour must follow the real terminal connections and control state. Keep operation, protective-path findings and exercise objectives separate; stopped states and unresolved measurements need accurate feedback.

Guided steps should award demonstrated competence once. Stage navigation, settings changes, reload, Undo/Redo and loading an example must not replay an award. Measurement evidence must retain its terminals or branch, circuit revision and operating state. Diagnosis alone does not complete a repair; remove the defect and pass the retest.

For model changes, preserve the authoritative rear layout in `lab/lib/terminal-layout.ts`, independently selectable terminals and parts, and full/detail-distance variants. Inspection may move covers and mechanisms, but must preserve electrical anchors and connections. Include the original recipe and `.blend` source alongside regenerated GLBs and thumbnails. Review front, rear and inspection renders rather than relying on mesh counts alone.

Document educational assumptions beside new electrical behaviour. Use current Irish terminology and primary public references for lesson content. Identify specialist, equipment-dependent and existing arrangements appropriately. The simulator is a study tool; it must not claim installation approval or manufacturer-specific certification.

## Validate and review

Run the source suite, type check, changed-module lint and production build described in the development guide. Add a meaningful regression case when fixing an electrical, evidence, progression or storage defect. Avoid tests that merely duplicate the implementation. Check the whole catalog for changes shared by multiple configurations.

Changes to assets or workers need the offline and emitted-worker audits after building. UI, camera, picking, performance and packaging changes also need inspection in the real Windows app. Report measured results with their hardware and workload; distinguish them from estimates and prior-release observations.

Preserve existing study profiles during native verification. Export a full backup first, close other app instances, follow the desktop guide and keep interrupted-run recovery files. Keep raw `verification/` output, installers, downloaded tools, caches and learner data out of the pull request.

Contributions are distributed under the repository's [MIT licence](LICENSE). Include provenance and an appropriate licence for new assets or dependencies, and preserve existing third-party notices. The equipment library uses original generic training models; manufacturer references are explanatory sources, not copied CAD or installation drawings.
