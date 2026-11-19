# Original Blender equipment library

The complete offline library contains 115 equipment variants covering 80 component types. Each has an editable original `.blend` source under `models/`, an original geometry recipe under `recipes/`, and locally bundled full-detail and distance-detail GLB assets under `lab/public/models/`.

The two entrance buttons in the hall chime lesson are Friedland D814 Sesame pushes. Each has a 55 × 24 × 18 mm case, a spring-return cap and a clip-off cover over its wall fixings. Open **Back of the push** to see the unmarked screws. A hooked copper end appears under each screw that has a wire connected. The meter touches the steel shoulder next to the cross recess. The case dimensions and connections follow the maker's documents. The wire shape, small fixing dimensions and button travel are reconstructed for study. [Resideo product photograph](https://www.resideo.com/gb/en/products/security/doorbells/wired-doorbells/d814-sesame-doorbell-push-d814/) · [Friedland fitting sheet, figure 2](https://www.tlc-direct.co.uk/Technical/DataSheets/Friedland/P814.pdf)

Every variant receives a family-specific construction layer in `detail_library.py`, covering the original 29 authoring families and documented workshop forms. It models pressure-plate terminal cages, real apertures, helical fastener threads and washers, contact tips, trip mechanisms, bearings and cages, valve gears, process assemblies, electronic converter architectures and individually stranded cable cores. The [construction audit](MODEL-GAPS.md) identifies the earlier gaps and the requirements for each family. The [primary reference map](reference-map.json) records manufacturer material consulted for representative architecture and the explicit conceptual assumptions.

The one-way switch, rose and B22 holder, industrial cabinet, machinery applications and sensor variants retain their distinct original housings. Full source `.blend` files are saved before runtime batching, keeping individual threads, washers, screw heads, gear teeth, semiconductor leads and clamp parts editable. GLB export combines static details within a selectable assembly/material owner, preserving independent electrical terminals, functional controls and animation nodes. These are original generic training forms, rather than manufacturer CAD or dimensional service drawings.

The 1.5 workshop equipment includes an original two-row Gamma-style enclosure, a four-way TP&N enclosure, extra-low-voltage controls and fittings, and four hand instruments. Each inventory entry maps to primary sources in `reference-map.json`. The two enclosures use the published external proportions. Their outgoing branches, combs, neutral bars and earth bars are separate circuit objects. The installed device positions determine the blanking plates and printed circuit schedule. The dead front and hinged door move independently. The PCB internals, spare distribution carriers, cable entries and mounting clearances are representative training geometry. The model library uses original geometry and studio renders throughout.

The original BG 851-01 fused connection unit uses BG’s front, side and rear photographs and NXSWFCUIL-H diagram. The visible IN and LOAD markings correspond to the circuit’s stable terminals. The edge of the rocker is a mechanical position indicator. The separate captive carrier contains a 25.4 × 6.3 mm BS 1362 ceramic cartridge with the circuit’s supported ampere marking. Screw-seat offsets, internal guides and withdrawal travel are study dimensions. The open lower knockout in this example takes a round flex through the sheath grip.

The PLX050E Series C panel heater follows Glen Dimplex’s [specification and photographs](https://www.dimplex.co.uk/sites/g/files/emiian551/files/2024-03/PLXE%20Series%20C%20Spec%20Sheet%20-%20Issue%203.pdf) and [bracket and six-key control drawings](https://product-portal.gdhv.com/sites/default/files/2022-12/PLXE%20-%20Series%20C%20Long%20Manual%20-%20Issue%204.pdf). The 450 × 430 × 108 mm case, Class I construction, 500 W rating and 116 × 310 mm bracket-hole pitch come from the maker. The formed front, rolled louvres, mounting tabs and finned element are original study meshes. The upper LCD shows the manual target while its controller has power. The bench shows the free cores of a shortened flex. In the installed room a continuous flex runs from the [lower right](https://support.dimplex.co.uk/what-side-of-the-heater-does-the-flex-come-out-on-panel-heater?journey=consumer) to the wall unit. The exact gland offsets, shape of the pressings and hidden element layout are interpretations of the product family. The exposed strands in the bench model are virtual connection points.


The one- and two-way rockers use the rear photographs of BG 811/812. The intermediate follows the four-entry BG 813 cassette, with the simulator IDs A/B on the two L1 entries and C/D on L2. The split gang exercise uses the mirrored cassettes of the 842 as its physical reference. The open BG 661 rose has separate neutral, permanent-line and switched-line strips and a common earth clamp. The angled lamp fitting follows S. Lilley's earthed brass 3015E mounting dimensions. Its B22d A55 lamp uses Radium’s published 55 × 97 mm envelope. The hollow brass back, bayonet slots, divided ceramic insert and separate earth lug follow the maker’s section and catalogue photographs. The rear service view uses the lab’s existing wire entries. Clamp positions, the earth link and the internal spring assembly illustrate their functions. These assembly details, sources and two detail levels are available offline.

On the stairs, the BG 812-01 face is 86 mm square with two capped fixings 60.3 mm apart. The manufacturer's drawing gives a total depth of 23.3 mm. Behind the plate, the wire enters a rectangular opening and the terminal screw is reached from the end of the grey case. The Workbench shows the copper in the clamp when a wire is connected. Meter leads touch the corresponding recessed screw. Rear markings read **COM**, **L2** and **L1**. A cutaway shows the common contact moving between the two strappers. The concealed contact shape, edge radii and stripped core are reconstructed for study. [BG product photographs and drawing](https://www.bgelectrical.uk/uk/wiring-devices/800-series/20a-16ax-light-switches/812-01)

On the single 811 and 812 plates, three visible screws hold the grey switch case together. One sits in a curved recess at the bottom. The conductor screws are reached through separate openings at the ends. On the 661 rose, look below the open cable entry for a second piece marked REMOVE. That knockout is still attached on the sample. The Hager WMPS12 is a reference for the wall plate size. The BG photographs supply the rear layout for these switches. [BG 811](https://www.bgelectrical.uk/uk/wiring-devices/800-series/20a-16ax-light-switches/811-01) · [BG 812](https://www.bgelectrical.uk/uk/wiring-devices/800-series/20a-16ax-light-switches/812-01) · [BG 661](https://www.bgelectrical.uk/uk/wiring-devices/ceiling-accessories/ceiling-roses/661-01)

The domestic radial and ring practicals use a double unswitched socket. Its 146.5 × 86 mm plate, 25.9 mm overall depth and 120.6 mm fixing centres follow the BG 824 drawing. The rear photograph supplies the stepped grey housing, cross ties in its central slot, white inserts above the four conductor entries and folded strip joining the two earths to the fixing bushes. Each cable enters from the rear. Its clamp screw is visible from above. The four shuttered front openings sit clear of the plate ribs. Small radii, hidden contacts and clamp depths are reconstructed. Both exported detail levels use the same wire anchors and faceplate surface. [BG 824 photographs, specifications and drawing](https://www.bgelectrical.uk/uk/wiring-devices/800-series/13a-sockets/824-01)

Stable `terminalId` extras identify each electrical connection exactly once. Revision 3 gives each terminal a physical access direction, marking and attachment form. Wall accessories retain rear contacts. DIN protection has upper and lower banks, motor winding boards have threaded studs and cable lugs, plug faces carry their mating pins, and the zone-valve flex ends at a separate connector row. The layout comes from `lab/lib/terminal-layout.ts`. GLB `partId` and animation extras preserve selectable housings, covers, contacts, coils, rotors and mechanisms. Cover-open, exploded and cutaway presentations move cloned scene geometry while retaining the connection positions.

`service_details.py` builds the physical identification, glands and mounting details. The operating face of each residual device identifies its T button. The circuit energises a model test resistor while the button is pressed. A separate runtime insert prints the rating selected in that circuit. The reference map records the representative assumptions on access, mounting and electrical behaviour.

Enclosed banks carry a `serviceChamber` flag. Removing the lid exposes its screws, wire entries and markings. The switch and socket retain accessible connections on their backs. Ray-picking tests follow the direction used by **Show terminals** to check physical access in both detail levels.

Distance GLBs simplify mesh detail and omit microscopic engraved terminal lettering. Selected equipment always requests the full GLB. Engraved lettering returns with close inspection. While the full model loads, the bench keeps the installed distance model visible if it is available. If both files fail to load, the bench offers Retry and the equipment list. The list operates the same components and terminals.

Rebuild from the workspace root with Node, Python and Blender 4.5 LTS available on your PATH. Downloaded portable tools under `tools/` are excluded from Git; install Blender separately when cloning the repository. Original `.blend` sources and exported GLBs are included, so ordinary app use does not require Blender.

```powershell
Push-Location lab
node --import tsx scripts/export-model-recipes.tsx
Pop-Location
blender --background --python authoring/blender/build_models.py --
```

The Blender script supports `--first`, `--only <key,key2>`, `--render-first`, `--render-library`, `--render-only` and `--thumbnails`. The recipe exporter supports `--only <key1,key2>` to update specific model recipes while preserving the complete inventory. Full offline inspection renders and 192 px transparent studio thumbnails:

```powershell
blender --background --python authoring/blender/build_models.py -- --render-only --render-library --thumbnails
blender --background --python authoring/blender/build_models.py -- --render-only --render-access
python authoring/blender/contact_sheets.py
```

Run the asset contract tests from `lab/`:

```powershell
node --import tsx --test scripts/blender-assets.test.ts scripts/model-detail.test.ts scripts/lamp-brightness.test.tsx
```

The tests parse every full and distance GLB through Three.js, verify exactly-once terminal identities and real world coordinates, exercise inspection modes, prove cached assets remain unchanged, check distinct architectures and selectable construction geometry, and operate switches, contactors, valves and rotors. They also verify per-lamp solved-power brightness and the newly exposed bulb filament. `verification/model-detail/construction-audit.json` records actual mesh evidence; `verification/blender/asset-audit.json` records triangle counts. Eight views per variant show the front, rear and both inspection directions, so the back of a circuit board cannot conceal its component side in the review. Each gallery icon is a local file under `lab/public/models/thumbnails/`, referenced by `thumbnailUrl` in the manifest. Native GPU performance and picking are measured separately by the installed-app harness.

Blender renders can embed local filenames in PNG text metadata. Every thumbnail and inspection render now passes through `png_metadata.py` immediately after export. This portable Python standard-library helper removes only `tEXt`, `zTXt` and `iTXt` chunks, validates chunk CRCs, and preserves every image, transparency, colour-profile and other retained chunk byte-for-byte. It does not decode or re-encode pixels. Invalid PNG files are rejected before writing.

The exporter clears the file browser's saved directory in each Blender workspace before saving a source model. Before distributing sources, run `python authoring/blender/check_source_privacy.py` with Python 3.14 or newer. It decompresses the original model files and checks for user-profile paths inside them.

Check source assets and run the sanitizer regressions from the workspace root:

```powershell
python authoring/blender/png_metadata.py --check lab/public/models/thumbnails lab/desktop/assets/icon.png
python -m unittest discover -s authoring/blender -p test_png_metadata.py
```

To sanitize previously exported PNGs, omit `--check`; optional `--audit <file.json>` records before/after IDAT, critical-chunk and retained-chunk hashes without copying removed metadata values into the report.


### Three-pole fan isolator

The course 36 wall isolator follows the BG 815-01. Its 86 × 86 mm plate has two capped fixings at 60.3 mm centres, a broad tilting rocker and the printed ON and OFF positions. The rear cassette has six staggered wire openings and separate screwdriver access. Three contact arms illustrate the shared action. The manufacturer's drawing gives an overall depth of 22.2 mm. Minor moulding sizes and internal contact arms are reconstructed for study. [BG product photographs, drawing and instructions](https://www.bgelectrical.uk/uk/wiring-devices/800-series/10a-3-pole-fan-isolators/815-01)

The upper row takes the supply in the maker's timer fan example. Its markings, read from left to right behind the plate, are **L1** for the light switch's signal, **L2** for permanent line and **N** for neutral. Each lower terminal feeds the fan through its own contact. Both rows use the same moulded markings. Stored documents keep the original terminal identities. Sandbox search accepts “fan isolator” to place this fitting directly.

### Cabinet light rocker

The two black switches in course 66 follow Switch Components RG1-1A-DC-1-B. Each one controls a single LED strip on the driver's 24 V DC output. The maker rates the switch for 10 A at 28 V DC and 16 A at 12 V DC. Its 31.5 × 18.5 mm bezel clips into a 27.6 × 13 mm opening in a 0.75–3 mm thick panel. The quoted cutout applies to that range of panel thicknesses. [Product photos](https://www.switchcomp.com/switches/rocker-switch/RG1-1A-DC-1-B) · [Manufacturer drawing, revision B](https://www.switchcomp.com/switches-docs/rocker-switch/RG1-1A-DC-1-B.pdf)

Inspect the back to see the two 6.35 × 0.8 mm blades. Their centres are 9.3 mm apart. In this circuit, blade **2** receives positive from the driver and **1** feeds the strip. The moulding also has a number 3 at an empty position. Connecting a wire fits a separate push-on connector over its blade. Removing the wire exposes the blade again. A probe touches the exposed metal beside the base of either blade. The mating connectors and the cutaway contact mechanism are representative study geometry. Earlier saved circuits keep their original switch and wiring.

### Domestic breaker handles and flags

The one-pole branch breakers in the two-row Gamma enclosure follow the Hager NBN116A exterior. The shared two-pole residual-current device follows the CDA240U. Raising a handle exposes I underneath, and lowering it exposes O above. The CDA has separate contact and trip windows. The upper-left one reports contact position. The lower-right one shows yellow after the simulated differential trip and remains grey on manual switch-off. The window colours come from the mechanical flags. The internal latch and paddle travel are reconstructed for teaching. The fitted circuits and label values follow the learner's circuit document. [NBN116A photograph and dimensions](https://hager.com/ie/catalogue/products/nbn116a-mcb-1p-10ka-15ka-b-16a-1m) · [CDA240U photograph and dimensions](https://hager.com/ie/catalogue/products/cda240u-rccb-2p-40a-30ma-a) · [Hager operating indications](https://assets.hager.com/step-content/P/HA_79103069/Document/std.lang.all/Technical%20Specifications%20SG.pdf)

## Cable samples

Run `blender --background --python authoring/blender/cable_samples.py` from the project root to rebuild the six original material-picker images. The cross-sections live in `lab/lib/cable-profiles.json`. They show what to recognise at a cut end. The bench enlarges the thin wires so a learner can select them.

- The flat cable has a grey sheath with a full-size insulated earth in the middle. The 1.5 mm² solid-core example uses a 1.365 mm copper diameter and 0.7 mm insulation. Its modelled width and height fall within the maker’s tolerance. The brown single shows the same type of solid conductor. [Carkit Irish flat cable data sheet](https://www.cesco.ie/sites/admin/plugins/elfinder/files/cesco2/pdfs/N05VVH4-U%20N05VVH4-R%20-%20T%26E.pdf)
- The white flex follows the three-core H05VV-F sample. It has an 8.1 mm nominal outside diameter, stranded copper and 0.7 mm core insulation. The visible strand count is simplified for the small picture. [Eland 318-Y data sheet](https://www.elandcables.com/media/524f1w5d/318y-h05vv-f-en-50525-2-11-flexible-cable-datasheet.pdf)
- The red and white bell pair follows the unjacketed solid twisted bell wire in the maker’s picture. [Cerrowire bell wire data sheet](https://images.thdstatic.com/catalog/pdfImages/13/131e874e-eba2-4fbc-aabd-341e71d4fb3c.pdf)
- The red and black LED pair follows the joined figure-of-eight profile and stranded construction of a low-voltage LED lead. The four-wire ribbon uses a documented yellow, white, red and black sequence. The LED exercise assigns the functions at the terminal markings. The spacing and stripped lengths in both pictures are illustrative. [Lampfix LED pair](https://www.lampfix.co.uk/shop/01648-2-core-0-36mm-fig-8-red-black-low-voltage-flex-13099/document/150) · [Seeed four-wire colour order](https://wiki.seeedstudio.com/How_To_Choose_The_Right_Cable/)
