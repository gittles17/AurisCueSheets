/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Auris Background Colors
        'auris-bg': '#0a0d12',
        'auris-bg-secondary': '#090b0f',
        'auris-card': '#08090d',
        'auris-card-hover': '#0c0e14',
        'auris-surface': '#090b0f',
        
        // Auris Border Colors
        'auris-border': '#262626',
        'auris-border-light': '#333333',
        
        // Auris Text Colors
        'auris-text': '#ffffff',
        'auris-text-secondary': '#a3a3a3',
        'auris-text-muted': '#737373',
        
        // Auris Accent Colors
        'auris-green': '#5BB09A',
        'auris-green-dim': 'rgba(91, 176, 154, 0.15)',
        'auris-blue': '#7AAED4',
        'auris-blue-dim': 'rgba(122, 174, 212, 0.15)',
        'auris-purple': '#9A85C9',
        'auris-purple-dim': 'rgba(154, 133, 201, 0.15)',
        'auris-orange': '#E09055',
        'auris-orange-dim': 'rgba(224, 144, 85, 0.15)',
        'auris-red': '#D4918A',
        'auris-red-dim': 'rgba(212, 145, 138, 0.15)',
      },
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        'mono': ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace'],
        'display': ['Alpha Lyrae', 'Inter', 'sans-serif'],
      },
      fontSize: {
        'xs': '10px',
        'sm': '12px',
        'base': '14px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
        '3xl': '32px',
        '4xl': '48px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 4px 16px rgba(0, 0, 0, 0.5)',
        'modal': '0 24px 48px rgba(0, 0, 0, 0.7)',
        'focus-blue': '0 0 0 3px rgba(122, 174, 212, 0.15)',
        'focus-green': '0 0 0 3px rgba(91, 176, 154, 0.15)',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
      }
    },
  },
  plugins: [],
}
