import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Lint API + Vite apps (backoffice webpack excluded). */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "backoffice/**", "database/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["api/src/**/*.ts", "player-portal/src/**/*.ts", "bingo-display/src/**/*.ts", "packages/shared/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
