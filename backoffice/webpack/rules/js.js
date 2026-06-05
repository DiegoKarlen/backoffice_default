const SHARED_SRC_RE = /packages[\\/]+shared[\\/]+src[\\/]/i;

function shouldExcludeFromBabel(resourcePath) {
  const p = String(resourcePath).replace(/\\/g, "/");
  if (SHARED_SRC_RE.test(p)) return false;
  return /node_modules/.test(p) || /\/dist\//.test(p) || /\/build\//.test(p);
}

/** App JS/JSX + TypeScript sources under `packages/shared` (alias `@shared`). */
module.exports = {
  test: /\.(m?js|m?jsx|tsx?)$/,
  exclude: shouldExcludeFromBabel,
  use: {
    loader: "babel-loader",
    options: {
      cacheDirectory: true,
      presets: [
        [
          "@babel/preset-env",
          {
            useBuiltIns: false,
            modules: false,
          },
        ],
        [
          "@babel/preset-typescript",
          {
            allowDeclareFields: true,
            onlyRemoveTypeImports: true,
          },
        ],
      ],
      plugins: ["@babel/plugin-transform-runtime"],
    },
  },
};
