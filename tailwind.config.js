/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        praxis: {
          50:  '#f0f4f8',
          100: '#dce4ed',
          200: '#b8c9db',
          300: '#8ba8c4',
          400: '#5e87ad',
          500: '#3a6891',
          600: '#2d5275',
          700: '#243f5a',
          800: '#1c3044',
          900: '#14222f',
          950: '#0b1319',
        },
        accent: {
          emerald: '#2dd4a8',
          coral:   '#f97066',
          amber:   '#f59e0b',
          blue:    '#3b82f6',
          violet:  '#8b5cf6',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f8f9fb',
          100: '#f1f3f5',
          200: '#e5e8eb',
          300: '#d1d5db',
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'elevated': '0 8px 24px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
};
