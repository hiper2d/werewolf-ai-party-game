// Flat ESLint config (ESLint 9 / Next 16). Replaces the removed `next lint`
// command and the legacy `.eslintrc.json`. `eslint-config-next/core-web-vitals`
// is a native flat-config array that already bundles the TypeScript config,
// the React / react-hooks / jsx-a11y / import plugins, and the global ignores
// (`.next`, `out`, `build`, `next-env.d.ts`); node_modules and .git are ignored
// by default.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ["coverage/**"],
  },
  {
    // eslint-config-next 16 bundles eslint-plugin-react-hooks v6, which turns the
    // new React-Compiler rules on as ERRORS. They flag long-standing, working
    // patterns in our prod components (SSR mount guards, a checkout redirect via
    // window.location, reading a ref to position a hover card, useMemo passed a
    // stable top-level fn). None are real bugs, so we keep them as visible
    // warnings rather than refactoring working code to satisfy them.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
];

export default eslintConfig;
