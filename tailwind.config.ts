import type { Config } from 'tailwindcss'

/**
 * StyleVerse AI design system.
 * Every value here is lifted verbatim from the :root block and rule set of
 * the visual specification (production.html). Do not invent new values --
 * add them to the spec first.
 */
export default {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F4F1EE',
        white: '#FFFFFF',
        shell: '#FBF7F3',
        ink: '#231F1C',
        ink2: '#3A342F',
        body: '#5C554E',
        mute: '#8D857D',
        orange: '#D04A02',
        orangeD: '#A33A00',
        peach: '#FBE3D4',
        blush: '#F6D3D9',
        rule: '#F0EBE5',
        rule2: '#E5DED7',
        hover: '#EDE7E1',
        green: '#2FA45B',
        greenW: '#DFF3E3',
        amber: '#9A6B08',
        amberW: '#FBF0D2',
        red: '#C0392B',
        redW: '#F9DEDA',
        violet: '#5B4B8A',
        violetW: '#EDE9F5',
      },
      borderRadius: {
        pill: '999px',
        card: '22px',
        inner: '18px',
        quote: '14px',
      },
      boxShadow: {
        card: '0 6px 18px rgba(122,72,38,.10)',
        nav: '0 1px 2px rgba(35,31,28,.04)',
        raised: '0 1px 2px rgba(35,31,28,.05)',
        drawer: '-16px 0 40px rgba(35,31,28,.18)',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Named steps of the production.html type scale. Numeric px keys are
        // deliberate: the spec is expressed in px, not in t-shirt sizes.
        h1: ['26px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        hero: ['21px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        kpi: ['19px', { lineHeight: '1.2' }],
        logo: ['15px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h3: ['14px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        base: ['13px', { lineHeight: '1.45' }],
        copy: ['12.5px', { lineHeight: '1.6' }],
        nav: ['12px', { lineHeight: '1.35' }],
        small: ['11.5px', { lineHeight: '1.45' }],
        label: ['11px', { lineHeight: '1.35' }],
        th: ['10.5px', { lineHeight: '1.3', letterSpacing: '0.04em' }],
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.06em' }],
      },
    },
  },
  plugins: [],
} satisfies Config
