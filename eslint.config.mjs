// eslint-config-next 16 ships native flat-config arrays; import them directly.
// (FlatCompat + these configs hits a circular-serialization bug on ESLint 9.)
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["runs/**", "var/**", "public/vendor/**"],
  },
];

export default eslintConfig;
