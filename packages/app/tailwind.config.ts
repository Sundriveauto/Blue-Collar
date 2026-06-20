import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        success: { light: '#d1fae5', DEFAULT: '#10b981', dark: '#065f46' },
        warning: { light: '#fef3c7', DEFAULT: '#f59e0b', dark: '#92400e' },
        error:   { light: '#fee2e2', DEFAULT: '#ef4444', dark: '#991b1b' },
        info:    { light: '#dbeafe', DEFAULT: '#3b82f6', dark: '#1e40af' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        sm:   '0.125rem',
        md:   '0.375rem',
        lg:   '0.5rem',
        xl:   '0.75rem',
        '2xl':'1rem',
        '3xl':'1.5rem',
      },
      boxShadow: {
        sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md:  '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg:  '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl:  '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },
      transitionDuration: {
        fast:     '150ms',
        normal:   '200ms',
        slow:     '300ms',
        slowest:  '500ms',
      },
      zIndex: {
        hide:      '-1',
        dropdown:  '1000',
        sticky:    '1020',
        fixed:     '1030',
        backdrop:  '1040',
        offcanvas: '1050',
        modal:     '1060',
        popover:   '1070',
        tooltip:   '1080',
      },
    },
  },
  plugins: [],
}

export default config
