// Regenerates src/vendor/*.css: Bootstrap and Bootstrap Icons with every rule the app never uses removed.
// Run `npm run css:purge` after adding new Bootstrap classes or icons, then commit the result.
import { PurgeCSS } from 'purgecss';
import { writeFileSync, readFileSync } from 'node:fs';

const content = [
  'src/index.html',
  'src/**/*.html',
  'src/**/*.ts',
  'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js', // classes Bootstrap's own JS toggles
];

// Classes added at runtime by Bootstrap JS or the CDK that never appear literally in our templates.
const safelist = {
  standard: [
    'show', 'showing', 'hiding', 'collapse', 'collapsing', 'collapsed', 'active', 'disabled', 'fade',
    'modal-open', 'modal-backdrop', 'dropdown-backdrop', 'navbar-collapse', 'was-validated',
    'is-valid', 'is-invalid', 'visually-hidden', 'visually-hidden-focusable', 'sticky-top', 'fixed-top',
  ],
  greedy: [/^tooltip/, /^popover/, /^bs-/, /^dropdown/, /^navbar/, /^nav-/, /^btn-close/, /^spinner/],
};

const [bootstrap, icons] = await new PurgeCSS().purge({
  content,
  css: [
    'node_modules/bootstrap/dist/css/bootstrap.min.css',
    'node_modules/bootstrap-icons/font/bootstrap-icons.css',
  ],
  safelist,
  fontFace: true,
  keyframes: true,
  variables: false,
});

writeFileSync('src/vendor/bootstrap.purged.css', bootstrap.css);
// Point the icon font at the installed package; the bundler then hashes and serves it.
writeFileSync(
  'src/vendor/bootstrap-icons.purged.css',
  icons.css
    .replace(/url\("\.\/fonts\//g, 'url("../../node_modules/bootstrap-icons/font/fonts/')
    .replace('font-display: block', 'font-display: swap'),
);
const kb = (f) => (readFileSync(f).length / 1024).toFixed(1) + ' kB';
console.log('bootstrap', kb('src/vendor/bootstrap.purged.css'), '| icons', kb('src/vendor/bootstrap-icons.purged.css'));
