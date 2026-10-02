# Third-party notices

The MIT license in this repository covers the original application code, lesson
content, procedural model definitions, Blender assemblies, generated equipment
models, textures and project documentation. Third-party software retains its
own license; the project license does not replace those terms.

- JavaScript dependencies and their exact resolved versions are recorded in
  `lab/package-lock.json`. `lab/scripts/collect-third-party-notices.mjs` collects
  the exact LICENSE/COPYING/NOTICE files from the installed production graph
  into `THIRD_PARTY_DEPENDENCIES.txt` before desktop packaging. The installer
  bundles this file alongside the project license and retained third-party
  notices. Missing notice files or license expressions requiring review are
  identified in its header; no project license is substituted for them.
  Version-scoped upstream license supplements are retained in
  `lab/vendor/dependency-notices`, with source URLs and SHA-256 hashes. They
  cover published npm packages that omitted their project's license file.
  Exact available inline source notices and README declarations are retained
  for packages with no published package-level license; those remain explicitly
  flagged for review. Notice collection works offline.
- The vendored shadcn Tailwind stylesheet retains its MIT notice in
  `lab/vendor/shadcn-tailwind-4.13.0.LICENSE.md`. The adapted shadcn UI component
  source in `lab/components/ui` is also covered by the shadcn MIT notice below.
- The Next.js starter SVGs `lab/public/file.svg`, `lab/public/globe.svg` and
  `lab/public/window.svg` retain the Vercel MIT notice below.
- The Sites development wrapper retains its OpenAI MIT notice in
  `lab/build/sites-vite-plugin.LICENSE`.
- Packaged Windows applications include Electron and Chromium's license files
  and third-party notices alongside the executable.
- Referenced Irish guidance, manufacturer documentation and research remain
  the property of their respective publishers. References link to those sources;
  the project license does not license the linked documents.

Blender is an optional external authoring tool and is not bundled in this Git
repository. Model source and exported assets are included so the app can be
built without installing Blender.

## shadcn UI

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Next.js starter assets

The MIT License (MIT)

Copyright (c) 2025 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
