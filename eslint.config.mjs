import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "public/fixtures/**",
      "playground/fixtures/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
];
