# Windows releases and source packages

Published releases contain a per-user Windows x64 installer, a complete source
archive, usage instructions and SHA-256 checksums. The source repository retains
the original model assemblies, exported assets and scripts; generated installers
are release downloads rather than Git history.

## Install

1. Download `Irish-Electrical-Lab-1.2.1-Setup.exe` from the project's GitHub release.
2. Optionally compare its hash with the downloaded `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash .\Irish-Electrical-Lab-1.2.1-Setup.exe -Algorithm SHA256
   ```

3. Run the installer for your Windows account and open **Irish Electrical Lab**
   from the Desktop or Start menu. No separate Node.js runtime is needed.
4. Close the app window to stop it. Use **My builds → Export full backup** before
   moving study data to another PC or testing experimental storage changes.

The installer is unsigned; its publisher is not verified by a signing
certificate. The checksum confirms the downloaded file matches the published
artifact; it is not an installation or electrical safety certification.

For replacement releases, close the running app and install the new version.
Compatible updates retain the application identity, loopback origin and study
profile. Study records are not included in release downloads.

## Build and understand the project

Extract the source archive or clone the repository, then follow the
[development guide](development.md). The [usage guide](usage.md) covers courses,
sandbox controls, meters, tests and backups. The [integrated process plant](../lab/examples/industrial-plant/README.md)
is included as an importable original example, with its electrical verification.

The compiled installer also includes the project and dependency notices,
usage guide and example JSON under its installed `resources` directory. The
Blender source assemblies are provided in the source archive; running the
installed app uses the bundled exported models.

## Prepare a release

From `lab`, install locked dependencies and run the relevant source checks,
type check and production build. `npm run desktop:installer` generates its
own QA input fixtures and dependency notices before packaging the current
production output. Read every flagged dependency license against the actual
distributed code. Review native app behaviour and the public verification record.

Before publication, audit the staged source and compiled resources for secrets,
personal paths, study profiles and metadata. The PNG authoring pipeline strips
text metadata without changing pixels. Keep raw local verification and recovery
files excluded. Commit only the reviewed source, archive that commit and publish
the installer with its checksums. Never include a working application profile.
