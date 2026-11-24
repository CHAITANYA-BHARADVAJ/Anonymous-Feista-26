/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        graphite: {
          950: '#07080b',
          900: '#0c0e14',
          850: '#11141c',
          800: '#171a24',
          750: '#1e222f',
          700: '#272d3e',
          600: '#384157',
        },
        gold: {
          500: '#f59e0b',
          400: '#fbbf24',
          300: '#fde68a',
          200: '#fef3c7',
        },
        brand: {
          950: '#0c0d1e',
          900: '#181a38',
          800: '#242857',
          700: '#353a80',
          600: '#4f55b5',
          500: '#6366f1',
          400: '#818cf8',
          300: '#a5b4fc',
        },
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-ping': 'radarPing 2.2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'radar-sweep': 'radarSweep 6s linear infinite',
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        radarPing: {
          '0%': { transform: 'scale(0.95)', opacity: '0.75' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
