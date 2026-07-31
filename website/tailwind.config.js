/** @type {import('tailwindcss').Config} */
module.exports = {
  /**
   * Tailwind exists here purely to style the `/tailwind` build demos.
   *
   * `preflight: false` is the whole point: with it on, Tailwind's global reset
   * would restyle `input` and `svg` across the site, including inside the
   * CSS-build demos — which would make those demos misrepresent what a
   * consumer of the default build actually gets.
   */
  corePlugins: {
    preflight: false,
  },
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './docs/**/*.{md,mdx}',
    // Without this, the classes baked into the Tailwind build get purged and
    // that demo renders unstyled — which looks like a library bug rather than
    // a docs misconfiguration.
    './node_modules/@jugaaadi/advance-scroll-input/dist/**/*.js',
  ],
  theme: { extend: {} },
  plugins: [],
};
