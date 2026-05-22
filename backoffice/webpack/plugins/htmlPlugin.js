const
  path              = require('path'),
  manifest          = require('../manifest'),
  HtmlWebpackPlugin = require('html-webpack-plugin');

/** Páginas producto (backoffice). */
const productTitles = {
  'index': 'Backoffice · Inicio',
  'signin': 'Adminator · Sign In',
  'admin-users': 'Backoffice · Users',
  'admin-roles': 'Backoffice · Roles',
  'admin-functionalities': 'Backoffice · Functionalities',
  'admin-bingos': 'Backoffice · Bingos',
  'admin-players': 'Backoffice · Players',
  'admin-security': 'Backoffice · Security',
  'admin-rooms': 'Backoffice · Rooms',
};

/** Demo Adminator (solo si `BO_INCLUDE_ADMINATOR_DEMO=1`). */
const demoTitles = {
  'email': 'Adminator · Email',
  'calendar': 'Adminator · Calendar',
  'chat': 'Adminator · Chat',
  'compose': 'Adminator · Compose',
  'charts': 'Adminator · Charts',
  'forms': 'Adminator · Forms',
  'ui': 'Adminator · UI Elements',
  'buttons': 'Adminator · Buttons',
  'basic-table': 'Adminator · Basic Table',
  'datatable': 'Adminator · Data Table',
  'google-maps': 'Adminator · Google Maps',
  'vector-maps': 'Adminator · Vector Maps',
  'blank': 'Adminator · Blank',
  'signup': 'Adminator · Sign Up',
  '404': 'Adminator · 404',
  '500': 'Adminator · 500',
};

const includeDemo = process.env.BO_INCLUDE_ADMINATOR_DEMO === '1';
const titles = includeDemo ? { ...productTitles, ...demoTitles } : productTitles;

let minify = {
  collapseWhitespace: false,
  minifyCSS: false,
  minifyJS: false,
  removeComments: true,
  useShortDoctype: false,
};

if (manifest.MINIFY) {
  minify = {
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    removeComments: true,
    useShortDoctype: true,
  };
}

module.exports = Object.keys(titles).map(title => {
  return new HtmlWebpackPlugin({
    template: path.join(manifest.paths.src, `${title}.html`),
    path: manifest.paths.build,
    filename: `${title}.html`,
    chunks: ['runtime', '2026'],
    inject: true,
    minify,
    meta: {
      'view-transition': 'same-origin',
    },
  });
});
