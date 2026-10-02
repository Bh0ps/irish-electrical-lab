# Irish Electrical Lab

An offline 3D electrical study game for Irish domestic, commercial and industrial
arrangements. Explore detailed equipment, build your own circuits, operate the
controls and investigate faults through actual simulated connections.

The main application is a Windows desktop app. A browser development version is
also included. The original source, lesson data and editable Blender models are
open source under the [MIT license](LICENSE).

## What you can do

- Study **64 configurations** through **Look → Predict → Build → Try → Measure → Fix**.
- Inspect **87 equipment variants**, including rear terminals, removable covers,
  cutaways and exploded assemblies.
- Build freely with up to **80 components and 300 wires**, with individual terminal
  connections, undo/redo, selectable wires and editable equipment parameters.
- Operate switches, timers, contactors, dimmers and motors. Correct guided wires
  advance automatically; deliberate wiring mistakes remain possible.
- Measure voltage, current and resistance, distinguish protective findings from
  operating behaviour, and diagnose faults with progressively revealed hints.
- Save named builds, export circuits and migrate study progress through validated
  full backups. After installation, study and building work offline.
- Navigate with orbit controls or a **WASD free camera** in four training environments.

## Use the Windows app

Download the setup executable from [Releases](https://github.com/Bh0ps/irish-electrical-lab/releases).
Install it for your Windows account, then open **Irish Electrical Lab** from the
Desktop or Start menu. Windows 11 x64 is the tested platform. The installer
bundles its runtime; a separate Node.js installation is not required for normal use.

Close the window to stop the app. Saved work lives in your application profile,
outside installation files, and replacement installers preserve it. The app owns
the local address `127.0.0.1:4187`; a port conflict produces a startup error.

See the [usage guide](docs/usage.md) for courses, camera controls, wiring, testing,
saving and backup migration, and the [release guide](docs/releases.md) for checksums
and replacement installations.

## Run from source

Install **Node.js 22.13 or newer**, npm and Git. In PowerShell:

```powershell
git clone https://github.com/Bh0ps/irish-electrical-lab.git
cd irish-electrical-lab/lab
npm run install:ci
npm run dev
```

Open `http://127.0.0.1:5173` for browser development. Stop the development server
with **Ctrl+C**. The first dependency installation requires internet access.

To build the Windows installer from the same directory:

```powershell
npm run build
npm run desktop:installer
```

The executable is generated in `lab/release`; build outputs and downloaded tools
are excluded from Git. Included model assets mean Blender is optional for
running and packaging the app.

See [development instructions](docs/development.md), the
[desktop guide](lab/desktop/README.md) and [contribution guide](CONTRIBUTING.md)
for tests, packaging, architecture and model authoring.

## A complex Sandbox example

[The integrated process plant](lab/examples/industrial-plant/README.md) is an
original build independent of the courses: **80 equipment instances, 228 wires**
and eight equipment zones. It combines isolated control power, a manually reset
safety permission, conveyor holding contacts, a reversing mixer, duty/standby
pumps, a VFD, staged heating, dimmed lighting and yard services.

Import its [circuit JSON](lab/examples/industrial-plant/industrial-plant.circuit.json)
through **Sandbox → My builds → Import circuit**, then choose **View → Fit**.
The example guide explains its controls and records its source-solver checks.

## Educational scope

Domestic courses default to the requested **240 V study setting**, with a **230 V
nominal preset**. Industrial courses use **400 V between phases** and calculate
phase-to-neutral voltage consistently at 50 Hz. Ireland's nominal supply is
230/400 V. Public Irish guidance and equipment references are available within
each course.

The worker uses complex RMS modified nodal analysis and documented educational
state machines. Converters, VFD output and machinery safety functions include
labelled abstractions. The dimmer uses a declared series-resistance teaching
model; its power loss does not predict real electronic dimmer heating.

This steady-state simulation does not establish manufacturer-specific trip
timing, transient accuracy, cable-design approval or installation certification.
Restricted electrical work belongs with Safe Electric registered contractors.

## Project contents and verification

| Path | Contents |
| --- | --- |
| `lab/components`, `lab/lib` | React interface, 3D interaction, lessons and electrical engine |
| `lab/desktop` | Isolated Electron shell, local server and Windows packaging |
| `lab/public/models` | Bundled detailed and distance models, thumbnails and model inventory |
| `authoring/blender` | Editable original Blender assemblies and reproducible authoring pipeline |
| `lab/examples` | Importable original Sandbox examples and their validation |
| `lab/scripts` | Source tests, audits and build tooling |

The [curated verification record](docs/verification.md) separates measured release
checks from their limits. Private learner profiles, full study backups, raw local
recovery evidence, dependency directories and generated installers are not
published in the source repository.

Third-party software retains its own licenses; see
[third-party notices](THIRD_PARTY_NOTICES.md). Report reproducible bugs or propose
improvements through GitHub issues and pull requests, following
[CONTRIBUTING.md](CONTRIBUTING.md). Keep private study data out of public issues.
