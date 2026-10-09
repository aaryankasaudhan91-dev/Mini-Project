# HMS architecture (Archify)

Open [.archify/architecture-hms-20261009-210323/hms-architecture.html](.archify/architecture-hms-20261009-210323/hms-architecture.html) in a browser. The standalone viewer includes dark/light themes, node focus and export controls. The editable diagram is `candidate.json` in the same directory.

The diagram covers the guest/staff portals, browser session, HTTP API client, Express routes, JWT guards and PostgreSQL. It documents administrator-ID ownership, date-aware reservations, room locking, transactional status changes and today's occupancy.

## Evidence

Source references were verified against a local snapshot of the updated source at `718fc1d632f7c80689a8c22761df7a7e27f597f8`. This revision is not published to the project's remote. `source-snapshot.bundle` preserves that exact source revision so the evidence can be reproduced without committing or rewriting the application repository.

Clone the bundle into a separate local directory to inspect the evidence. Its source snapshot contains no `.env` files or dependency directories.

## Validation

- Repository source references and the candidate's layout passed the renderer's read-only layout validation.
- The final HTML passed all nine Archify static artifact checks, with zero composition errors and zero warnings.
- Archify `finalize` could not publish its receipts because Windows denied hard-link creation (`EPERM`). The HTML was assembled using Archify's template, semantic SVG helpers and verified layout, then saved as an ordinary file.
- Browser validation could not complete because Chrome's Crashpad/DevTools pipe failed. The in-app preview also timed out. No visual inspection or successful browser validation is claimed.
- Official delivery provenance remains unknown. `artifact-check.json` and `validation-notes.json` record the checks and limits; they are not a passing finalize receipt.

The HTML SHA-256 is `78db44250c4786c1e871a2329997093c5af288ca9d223af6aa02390b5d375b64`.

To regenerate with an unrestricted Archify installation, use `finalize architecture candidate.json hms-architecture.html --repo-root <source-snapshot-checkout> --quality showcase --json` from the project root, supplying the actual paths under `.archify/`. A fresh output/evidence directory is recommended for a new revision.
