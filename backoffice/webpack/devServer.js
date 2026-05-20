// ---------------------
// @Loading Dependencies
// ---------------------

const path = require('path');
const manifest = require('./manifest');

/**
 * En desarrollo NO servir `src/*.html` como estáticos: si no, el navegador recibe el
 * HTML sin los bundles inyectados por HtmlWebpackPlugin → pantalla en blanco (p. ej. admin-security).
 * Las imágenes/fuentes bajo `src/assets/static` siguen disponibles en `/assets/static/...`.
 */
const staticConfig = manifest.IS_PRODUCTION
  ? { directory: manifest.paths.build, watch: false }
  : [
      {
        directory: path.join(manifest.paths.src, 'assets', 'static'),
        publicPath: '/assets/static',
        watch: true,
      },
    ];

// ------------------
// @DevServer Configs
// ------------------

/**
 * [1] : To enable local network testing
 */

const devServer = {
  static: staticConfig,
  // MPA con varios .html: si está en true, algunos entornos sirven index.html en rutas y rompen fetch SPA.
  historyApiFallback: false,
  port: manifest.IS_PRODUCTION ? 3001 : 4000,
  compress: manifest.IS_PRODUCTION,
  client: {
    overlay: true,
    progress: !manifest.IS_PRODUCTION,
  },
  hot: !manifest.IS_PRODUCTION,
  host: '0.0.0.0',
  allowedHosts: 'all', // [1]
  devMiddleware: {
    stats: {
      assets: true,
      children: false,
      chunks: false,
      hash: false,
      modules: false,
      publicPath: false,
      timings: true,
      version: false,
      warnings: true,
      colors: true,
    },
  },
};


// -----------------
// @Exporting Module
// -----------------

module.exports = devServer;