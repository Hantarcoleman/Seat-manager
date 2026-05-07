/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'sans-serif'],
      },
      colors: {
        bg:   'var(--bg)',
        bg2:  'var(--bg2)',
        sf:   'var(--sf)',
        ink:  'var(--ink)',
        ink2: 'var(--ink2)',
        ink3: 'var(--ink3)',
        ac:   'var(--ac)',
        gn:   'var(--gn)',
        rd:   'var(--rd)',
        bl:   'var(--bl)',
        bd:   'var(--bd)',
      },
    },
  },
  plugins: [],
}
