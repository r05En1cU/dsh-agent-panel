# Build provenance

- Source: DSH checkout `D:\dsh-upstream`, commit `f3803c96974ad4a94195fb97e5c637e9c2a3afe3` (version `0.2.2-alpha.2`).
- Build: `pnpm run build:artifacts` (8 build gates, all passed).
- Tested build: `pnpm run build:check` (Host and Client aggregates, both passed); focused vitest 86 files / 1430 tests.
- Browser end-to-end: `DSH_SNAPSHOT=refresh` and `DSH_SNAPSHOT=replay`, 12/12 tests in each mode, against the real Host + real Web client with real collaboration records.
- Screenshots in `docs/screenshots/project-space/` were produced by the same e2e run (system Chrome headless, Windows).

## Artifact hashes (SHA-256)

| File | SHA-256 |
| --- | --- |
| `packages/dsh-experimental-collaboration-records/lib/index.js` | `95B8EECA5E3F95148B52651A2E42D38FC801F50E572D26BFF35D48B87D4D0ABA` |
| `packages/dsh-experimental-client-ui-project-space/lib/index.js` | `EF4DB5E6BBAFE4E574531DA182BE44A19A5F0A82F2A141075FD34DACE9487930` |
| `packages/dsh-experimental-client-ui-project-space/lib/client.js` | `2DA84C37F967008F7767420B9022D1D6C499C2B9F17814D2E7E7553EAFAD0B96` |

## Runtime compatibility

- Full interaction verification: DSH `0.2.2-alpha.2` source-built Web composition.
- Load-only verification: installed DSH desktop runtime `0.2.1-rc.5` — both loader rows mounted, the client plugin appeared in the browser boot manifest, no page errors, no console errors, no failed requests. This did not re-run the full interaction suite against the installed runtime.

## Rebuilding

The plugin sources are TypeScript packages inside the DSH workspace; the artifacts shipped here are the workspace build outputs. Rebuilding requires the matching DSH checkout and its `build:artifacts` pipeline; this repository does not duplicate that toolchain.
