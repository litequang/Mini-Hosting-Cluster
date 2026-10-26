# MHC TEST 0.5.0B4 — Write Path LAB Adapters

- Base: TEST 0.5.0B3.
- Four isolated, witness-gated offline LAB fixture writers (canary, static preview, fake upload, job receipt), each with independent size limit; no arbitrary file names/paths, no overwrite, at most 24 artifacts per adapter.
- Before and after temporary write: verify LAB constraints, private directory, witness lease and same epoch. An invalid lease or missing witness denies before publish.
- Original Android Mini Hosting Panel **9090** reports four isolated LAB adapter types and **nine UNGUARDED real write-path categories**; read-only authenticated API, unchanged original Panel user/session.
- Regression coverage: B3 36 checks, B4 51 checks, panel HTTP auth/privilege, legacy API redaction and other existing suites.
- Source-only upgrades support TEST 0.5.0B3 markers, with previous launcher/bin backup. No production app/db data or service startup is changed.
- **NOT** production fencing, not live HTTP/SQL/Sheet/uploads protection, not Cloudflare deployment, not HA authorization, and not a proof against split-brain.
- Two real Android LAB nodes and a separate real Cloudflare LAB witness are **NOT** validated by synthetic Linux tests.

Read `docs/WRITE-PATH-ADAPTERS-0.5B4.md` before starting any isolated LAB fixture write.
