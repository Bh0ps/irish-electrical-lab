# Original Blender equipment library

The complete offline library contains 109 equipment variants covering 80 component types. Each has an editable original `.blend` source under `models/`, an original geometry recipe under `recipes/`, and locally bundled full-detail and distance-detail GLB assets under `lab/public/models/`.

Every variant receives a family-specific construction layer in `detail_library.py`, covering the original 29 authoring families and documented workshop forms. It models pressure-plate terminal cages, real apertures, helical fastener threads and washers, contact tips, trip mechanisms, bearings and cages, valve gears, process assemblies, electronic converter architectures and individually stranded cable cores. The [construction audit](MODEL-GAPS.md) identifies the earlier gaps and the requirements for each family. The [primary reference map](reference-map.json) records manufacturer material consulted for representative architecture and the explicit conceptual assumptions.

The one-way switch, rose and B22 holder, industrial cabinet, machinery applications and sensor variants retain their distinct original housings. Full source `.blend` files are saved before runtime batching, keeping individual threads, washers, screw heads, gear teeth, semiconductor leads and clamp parts editable. GLB export combines static details within a selectable assembly/material owner, preserving independent electrical terminals, functional controls and animation nodes. These are original generic training forms, rather than manufacturer CAD or dimensional service drawings.

The 1.5 workshop equipment includes an original two-row Gamma-style enclosure, a four-way TP&N enclosure, extra-low-voltage controls and fittings, and four hand instruments. Each of the 108 inventory entries maps to primary sources in `reference-map.json`. The two enclosures use the published external proportions. Their outgoing branches, combs, neutral bars and earth bars are separate circuit objects. The installed device positions determine the blanking plates and printed circuit schedule. The dead front and hinged door move independently. The PCB internals, spare distribution carriers, cable entries and mounting clearances are representative training geometry. The model library uses original geometry and studio renders throughout.

The one- and two-way rockers use the rear photographs of BG 811/812. The intermediate follows the four-entry BG 813 cassette, with the simulator IDs A/B on the two L1 entries and C/D on L2. The split gang exercise uses the mirrored cassettes of the 842 as its physical reference. The open BG 661 rose has separate neutral, permanent-line and switched-line strips and a common earth clamp. The angled lamp fitting follows S. Lilley's earthed brass 3015E mounting dimensions. Its B22d A55 lamp uses Radium’s published 55 × 97 mm envelope. The internal springs and captive clamps illustrate their function. These assembly details, sources and two detail levels are available offline.

On the single 811 and 812 plates, three visible screws hold the grey switch case together. One sits in a curved recess at the bottom. The conductor screws are reached through separate openings at the ends. On the 661 rose, look below the open cable entry for a second piece marked REMOVE. That knockout is still attached on the sample. The Hager WMPS12 is a reference for the wall plate size. The BG photographs supply the rear layout for these switches. [BG 811](https://www.bgelectrical.uk/uk/wiring-devices/800-series/20a-16ax-light-switches/811-01) · [BG 812](https://www.bgelectrical.uk/uk/wiring-devices/800-series/20a-16ax-light-switches/812-01) · [BG 661](https://www.bgelectrical.uk/uk/wiring-devices/ceiling-accessories/ceiling-roses/661-01)

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

The tests parse every full and distance GLB through Three.js, verify exactly-once terminal identities and real world coordinates, exercise inspection modes, prove cached assets remain unchanged, check distinct architectures and selectable construction geometry, and operate switches, contactors, valves and rotors. They also verify per-lamp solved-power brightness and the newly exposed bulb filament. `verification/model-detail/construction-audit.json` records actual mesh evidence; `verification/blender/asset-audit.json` records triangle counts. Eight views per variant show the front, rear and both inspection directions, so the back of a circuit board cannot conceal its component side in the review. The 109 icons are local files under `lab/public/models/thumbnails/`, referenced by `thumbnailUrl` in the manifest. Native GPU performance and picking are measured separately by the installed-app harness.

Blender renders can embed local filenames in PNG text metadata. Every thumbnail and inspection render now passes through `png_metadata.py` immediately after export. This portable Python standard-library helper removes only `tEXt`, `zTXt` and `iTXt` chunks, validates chunk CRCs, and preserves every image, transparency, colour-profile and other retained chunk byte-for-byte. It does not decode or re-encode pixels. Invalid PNG files are rejected before writing.

The exporter clears the file browser's saved directory in each Blender workspace before saving a source model. Before distributing sources, run `python authoring/blender/check_source_privacy.py` with Python 3.14 or newer. It decompresses the original model files and checks for user-profile paths inside them.

Check source assets and run the sanitizer regressions from the workspace root:

```powershell
python authoring/blender/png_metadata.py --check lab/public/models/thumbnails lab/desktop/assets/icon.png
python -m unittest discover -s authoring/blender -p test_png_metadata.py
```

To sanitize previously exported PNGs, omit `--check`; optional `--audit <file.json>` records before/after IDAT, critical-chunk and retained-chunk hashes without copying removed metadata values into the report.


## Cable samples

Run `blender --background --python authoring/blender/cable_samples.py` from the project root to rebuild the six original material-picker images. The cross-sections live in `lab/lib/cable-profiles.json`. They show what to recognise at a cut end. The bench enlarges the thin wires so a learner can select them.

- The flat cable has a grey sheath with a full-size insulated earth in the middle. The 1.5 mm² solid-core example uses a 1.365 mm copper diameter and 0.7 mm insulation. Its modelled width and height fall within the maker’s tolerance. The brown single shows the same type of solid conductor. [Carkit Irish flat cable data sheet](https://www.cesco.ie/sites/admin/plugins/elfinder/files/cesco2/pdfs/N05VVH4-U%20N05VVH4-R%20-%20T%26E.pdf)
- The white flex follows the three-core H05VV-F sample. It has an 8.1 mm nominal outside diameter, stranded copper and 0.7 mm core insulation. The visible strand count is simplified for the small picture. [Eland 318-Y data sheet](https://www.elandcables.com/media/524f1w5d/318y-h05vv-f-en-50525-2-11-flexible-cable-datasheet.pdf)
- The red and white bell pair follows the unjacketed solid twisted bell wire in the maker’s picture. [Cerrowire bell wire data sheet](https://images.thdstatic.com/catalog/pdfImages/13/131e874e-eba2-4fbc-aabd-341e71d4fb3c.pdf)
- The red and black LED pair follows the joined figure-of-eight profile and stranded construction of a low-voltage LED lead. The four-wire ribbon uses a documented yellow, white, red and black sequence. The LED exercise assigns the functions at the terminal markings. The spacing and stripped lengths in both pictures are illustrative. [Lampfix LED pair](https://www.lampfix.co.uk/shop/01648-2-core-0-36mm-fig-8-red-black-low-voltage-flex-13099/document/150) · [Seeed four-wire colour order](https://wiki.seeedstudio.com/How_To_Choose_The_Right_Cable/)
