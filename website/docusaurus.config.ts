import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const GITHUB = 'https://github.com/MateenKhan/advance-scroll-input';
const NPM = 'https://www.npmjs.com/package/@jugaaadi/advance-scroll-input';

const config: Config = {
  title: 'advance-scroll-input',
  tagline: 'A touch-friendly number input with a roller scrubber, unit parsing and formulas',
  favicon: 'img/favicon.ico',

  future: { v4: true },

  // TODO: set this to the real domain before deploying — wrong values break
  // asset paths on the built site.
  url: 'https://advance-scroll-input.example.com',
  baseUrl: '/',

  organizationName: 'MateenKhan',
  projectName: 'advance-scroll-input',

  onBrokenLinks: 'throw',

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: `${GITHUB}/tree/main/website/`,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    /**
     * Tailwind is here **only** to serve the `/tailwind` build demos.
     *
     * `preflight` is disabled in tailwind.config.js so Tailwind emits utility
     * classes and no global reset — that is what stops it bleeding into the
     * CSS-build demos and making them unrepresentative of what consumers see.
     */
    function tailwindPlugin() {
      return {
        name: 'tailwind-plugin',
        configurePostCss(postcssOptions) {
          postcssOptions.plugins.push(require('tailwindcss'), require('autoprefixer'));
          return postcssOptions;
        },
      };
    },
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'advance-scroll-input',
      items: [
        { type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs' },
        { to: '/docs/formulas', label: 'Formulas', position: 'left' },
        { to: '/docs/events', label: 'Events', position: 'left' },
        { href: NPM, label: 'npm', position: 'right' },
        { href: GITHUB, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/intro' },
            { label: 'Formulas', to: '/docs/formulas' },
            { label: 'Events', to: '/docs/events' },
            { label: 'Theming', to: '/docs/theming' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'npm', href: NPM },
            { label: 'GitHub', href: GITHUB },
            { label: 'Issues', href: `${GITHUB}/issues` },
          ],
        },
      ],
      copyright: `MIT © ${new Date().getFullYear()} jugaaadi. Provided as is, without warranty — verify your own numbers.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
