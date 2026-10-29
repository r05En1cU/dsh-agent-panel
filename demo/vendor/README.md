# Vendored React 18.3.1 UMD

`react.production.min.js` and `react-dom.production.min.js` are the official
React 18.3.1 UMD production builds, downloaded from unpkg for the zero-build demo
harness only. React is MIT-licensed; see https://github.com/facebook/react.

They are not used by the DSH plugin at runtime: the real web client supplies React
through ModuleLoader `require("react")`.
