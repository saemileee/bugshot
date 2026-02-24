/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      keyframes: {
        'pulse-opacity': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'panel-flash': {
          '0%, 100%': {
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
          },
          '25%, 75%': {
            boxShadow: '0 4px 24px rgba(59, 130, 246, 0.3), 0 0 0 2px rgba(59, 130, 246, 0.5)',
          },
          '50%': {
            boxShadow: '0 4px 30px rgba(59, 130, 246, 0.4), 0 0 0 3px rgba(59, 130, 246, 0.6)',
          },
        },
        'spin': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-opacity': 'pulse-opacity 1.5s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
        'panel-flash': 'panel-flash 0.6s ease-out',
        'spin': 'spin 0.6s linear infinite',
      },
    },
  },
  plugins: [],
};
