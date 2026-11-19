/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#1e1b4b',
          800: '#312e81',
          600: '#4f46e5',
          400: '#818cf8',
        },
      },
    },
  },
  plugins: [],
};
