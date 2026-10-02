# Original Blender equipment library

The complete offline library contains 87 equipment variants covering 68 component types. Each has an editable original `.blend` source under `models/`, an original geometry recipe under `recipes/`, and locally bundled full-detail and distance-detail GLB assets under `lab/public/models/`.

Every variant receives a family-specific construction layer in `detail_library.py`, covering 29 authoring families. It models pressure-plate terminal cages, real apertures, helical fastener threads and washers, contact tips, trip mechanisms, bearings and cages, valve gears, process assemblies, electronic converter architectures and individually stranded cable cores. The [construction audit](MODEL-GAPS.md) identifies the earlier gaps and the requirements for each family. The [primary reference map](reference-map.json) records manufacturer material consulted for representative architecture and the explicit conceptual assumptions.

The one-way switch, rose and B22 holder, industrial cabinet, machinery applications and sensor variants retain their distinct original housings. Full source `.blend` files are saved before runtime batching, keeping individual threads, washers, screw heads, gear teeth, semiconductor leads and clamp parts editable. GLB export combines static details within a selectable assembly/material owner, preserving independent electrical terminals, functional controls and animation nodes. These are original generic training forms, rather than manufacturer CAD or dimensional service drawings.

Stable `terminalId` extras identify each physical rear terminal exactly once. The authoritative rear layout remains `lab/lib/terminal-layout.ts`. GLB `partId` and animation extras preserve selectable housings, covers, clamps, contacts, coils, rotors and mechanisms. Cover-open, exploded and cutaway presentations change cloned scene transforms and materials; circuit connections remain fixed. Runtime clones share immutable source geometry and materials, with separate state materials only where needed.

Distance GLBs simplify mesh detail and omit microscopic engraved terminal lettering. Selected equipment always requests the full GLB. Engraved lettering returns with close inspection. The procedural renderer remains available while an asset loads or if local loading fails, so asset presentation cannot block wiring or simulation.

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
python authoring/blender/contact_sheets.py
```

Run the asset contract tests from `lab/`:

```powershell
node --import tsx --test scripts/blender-assets.test.ts scripts/model-detail.test.ts scripts/lamp-brightness.test.tsx
```

The tests parse every full and distance GLB through Three.js, verify exactly-once terminal identities and real world coordinates, exercise inspection modes, prove cached assets remain unchanged, check distinct architectures and selectable construction geometry, and operate switches, contactors, valves and rotors. They also verify per-lamp solved-power brightness and the newly exposed bulb filament. `verification/model-detail/construction-audit.json` records actual mesh evidence; `verification/blender/asset-audit.json` records triangle counts. Eight views per variant show the front, rear and both inspection directions, so the back of a circuit board cannot conceal its component side in the review. The 87 icons are local files under `lab/public/models/thumbnails/`, referenced by `thumbnailUrl` in the manifest. Native GPU performance and picking are measured separately by the installed-app harness.

Blender renders can embed local filenames in PNG text metadata. Every thumbnail and inspection render now passes through `png_metadata.py` immediately after export. This portable Python standard-library helper removes only `tEXt`, `zTXt` and `iTXt` chunks, validates chunk CRCs, and preserves every image, transparency, colour-profile and other retained chunk byte-for-byte. It does not decode or re-encode pixels. Invalid PNG files are rejected before writing.

Check source assets and run the sanitizer regressions from the workspace root:

```powershell
python authoring/blender/png_metadata.py --check lab/public/models/thumbnails lab/desktop/assets/icon.png
python -m unittest discover -s authoring/blender -p test_png_metadata.py
```

To sanitize previously exported PNGs, omit `--check`; optional `--audit <file.json>` records before/after IDAT, critical-chunk and retained-chunk hashes without copying removed metadata values into the report.
