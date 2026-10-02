# Security and private study data

Do not attach credentials, full study backups, browser profiles or raw recovery
files to a public issue. A small synthetic circuit and steps to reproduce are
usually enough to report a problem.

For security vulnerabilities, use GitHub's private vulnerability reporting on
this repository when available. Do not publish an exploit or private user data
in an ordinary issue while it is being investigated.

The desktop app uses an isolated renderer, a limited native bridge and a local
loopback server. These are security boundaries; contributions must preserve
them. Normal study is local and does not require a network connection.
