# Irish Electrical Lab

An offline 3D electrical study game for Irish domestic, commercial and industrial
arrangements. Explore detailed equipment, build your own circuits, operate the
controls and use a meter to find out why a lamp, socket or motor has stopped working.

The lab runs as a Windows desktop app and an iPhone Home Screen app. The original
source, lesson data and editable Blender models are
open source under the [MIT license](LICENSE).

## What you can do

- Start with **One switch, one light**. Follow nine chapters covering 80 configurations, or jump straight to a chapter practical. If you’re unsure of an answer, choose **Help** for something to check on that circuit. The full exercises are under lesson details.
- Open **Chapters → Jobs at Oakfield house → Find the lighting breaker**. Watch the hall lamp and kitchen socket as you try the two breakers. Then try the shared switch and check that both circuits come back on.
- On a phone, the house repairs open in the room with the next action in reach. Hold the arrows to walk, drag to look around or use **Find → Room map** to choose a fitting. In **The back doorbell is quiet**, compare the back button with the hall chime, find the loose wire and ring both doors to check your repair.
- Try six **Quick practice** experiments with a prediction, a real control action,
  and a comparison of live simulated readings.
- Walk through domestic, shop and industrial installations. Select a device by its drawing reference, follow a wire between terminals, or open it on the workbench.
- Explore working extra-low-voltage systems including LED strips, bell pushes, DC sensors and isolated relay interfaces. Practise using a fork tester or preparing a connector in optional tool exercises.
- Inspect **115 original equipment variants**, including removable board fronts, individually mounted protective devices and separately connected cable cores.
- Build freely with up to **80 components and 300 wires**, with individual terminal
  connections, undo/redo, selectable wires and editable equipment parameters.
- Operate switches, timers, contactors, dimmers and motors. Correct guided wires
  advance automatically; deliberate wiring mistakes remain possible.
- See the meter beside the fitting in full screen. Touch a point with **Red** or **Black**, or use **Points** to choose by name. **Record** saves the reading.
- Save named builds, export circuits and migrate study progress through validated
  full backups. After installation, study and building work offline.
- Try **Check the bathroom fan timer** to work the bathroom light and fan. Turn the light off, watch the five-second timer, then see what the fan isolator switches off.
- Try **One worktop stays dark**. Both switches are on, but only the left strip lights. Follow the missing feed with the meter, then open the right switch and put the loose connector back on its blade.
- In **The heater stays cold**, use the training bench to find where the heater loses its feed. In the kitchen, you can also turn the simulated supply off and try the meter on the screws of the fitted wall switch. [See the meter at the switch](docs/images/wall-switch-meter.png).
- In **Try both stair switches**, work the light from both floors. Turn the light off downstairs, read the markings on the back of the switch and see which of the two wires still has power. Go to the landing and use the other switch to light the stairs again.
- Try **Meter the worktop lights** at Oakfield house. Put the probes on the LED tape and compare a dark worktop with a lit one.
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

## Use the iPhone app

Open the [web app](https://bh0ps.github.io/irish-electrical-lab/) in Safari and
choose **Share → Add to Home Screen**. Once opened from the Home Screen, choose
**More → Download for offline use**. The [iPhone guide](docs/iphone.md) covers
touch controls, offline use and moving a full study backup from Windows. Tap **Full screen** beside a job title to walk around, get close to a fitting and make a repair.

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
through **Sandbox → My builds → Files and backups → Import circuit**, then choose **View → Fit**.
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
