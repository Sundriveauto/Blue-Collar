# Contributing to BlueCollar App

Thanks for your interest in contributing to the BlueCollar frontend!

## Setup

```bash
git clone https://github.com/your-org/bluecollar.git
cd bluecollar
pnpm install

cp packages/app/.env.example packages/app/.env
# fill in NEXT_PUBLIC_API_URL

cd packages/app
pnpm dev   # starts on :3001
```

**Requirements:** Node.js >= 20, pnpm >= 9

## Code Style

- **ESLint** — `pnpm lint` (extends `next/core-web-vitals` + `next/typescript`)
- **TypeScript** — strict mode; run `pnpm type-check` before pushing
- No Prettier config yet — match the surrounding code style (2-space indent, double quotes)

## Component Conventions

- One component per file, named to match the filename (`WorkerCard.tsx` → `export default function WorkerCard`)
- Shared UI primitives live in `src/components/ui/` (shadcn/ui pattern)
- Feature-specific components live in `src/features/<feature-name>/`
- Page-level components live in `src/app/` following Next.js App Router conventions
- Use Tailwind utility classes; avoid inline styles

## Design

Figma design file: [BlueCollar UI Kit](https://www.figma.com/file/bluecollar-ui) *(request access from a maintainer)*

## PR Process

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes and ensure checks pass:
   ```bash
   pnpm lint
   pnpm type-check
   pnpm build
   ```
3. Open a pull request against `main` with a clear description
4. All PRs require passing CI checks before merge

## Questions?

Open an issue or start a discussion on GitHub.

---

## Internationalisation (i18n)

The app uses [next-intl](https://next-intl-docs.vercel.app/) for translations. Locale files live in `src/messages/`.

### Supported locales

| Code | Language   |
|------|------------|
| `en` | English    |
| `fr` | Français   |
| `es` | Español    |
| `pt` | Português  |

### Adding a new locale

1. Create `src/messages/<code>.json` by copying `en.json` as a template.
2. Translate every value (keep the keys identical to `en.json`).
3. Add the locale code to the `locales` array in `src/middleware.ts`.
4. Add the language to the `languages` array in `src/components/LanguageSwitcher.tsx`.

### Adding new strings

1. Add the key/value to `src/messages/en.json` first.
2. Add the same key to every other locale file (`fr.json`, `es.json`, `pt.json`, …).
3. Use `useTranslations` in client components or `getTranslations` in server components:

```tsx
// Client component
import { useTranslations } from 'next-intl';
const t = useTranslations('common');
return <span>{t('save')}</span>;

// Server component
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('workers');
return <h1>{t('title')}</h1>;
```

### Locale detection

The middleware (`src/middleware.ts`) reads the `Accept-Language` header and redirects to the best-matching locale prefix (e.g. `/pt/workers`). The default locale is `en`.
