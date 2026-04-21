/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#09090d',
          900: '#111117',
          800: '#18181f',
          700: '#1f1f29',
        },
        border: {
          DEFAULT: '#27272f',
          light: '#35353f',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          muted: 'rgba(124,58,237,0.18)',
          glow: 'rgba(124,58,237,0.35)',
        },
        ink: {
          DEFAULT: '#f0f0f5',
          muted: '#7070a0',
          dim: '#44445a',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.4s ease forwards',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(124,58,237,0.35)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
