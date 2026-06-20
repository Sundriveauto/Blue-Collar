/**
 * Automated accessibility tests using axe-core (WCAG 2.1 AA compliance).
 *
 * Tests render each key component/page fragment and run axe against it.
 * Any axe violation causes the test to fail with a descriptive message.
 */

import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import axe from 'axe-core'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

vi.mock('lucide-react', () => ({
  Menu: () => <span aria-hidden="true" />,
  Wallet: () => <span aria-hidden="true" />,
  ChevronDown: () => <span aria-hidden="true" />,
  User: () => <span aria-hidden="true" />,
  Sun: () => <span aria-hidden="true" />,
  Moon: () => <span aria-hidden="true" />,
  MapPin: () => <span aria-hidden="true" />,
  BadgeCheck: ({ 'aria-label': label }: any) => <span aria-label={label} />,
  Star: () => <span aria-hidden="true" />,
  X: () => <span aria-hidden="true" />,
  Search: () => <span aria-hidden="true" />,
  Bell: () => <span aria-hidden="true" />,
  Home: () => <span aria-hidden="true" />,
  Briefcase: () => <span aria-hidden="true" />,
  Settings: () => <span aria-hidden="true" />,
  LogOut: () => <span aria-hidden="true" />,
  LayoutDashboard: () => <span aria-hidden="true" />,
  Globe: () => <span aria-hidden="true" />,
  ChevronRight: () => <span aria-hidden="true" />,
  ExternalLink: () => <span aria-hidden="true" />,
  AlertCircle: () => <span aria-hidden="true" />,
  CheckCircle: () => <span aria-hidden="true" />,
  Info: () => <span aria-hidden="true" />,
  Loader2: () => <span aria-hidden="true" />,
  Eye: () => <span aria-hidden="true" />,
  EyeOff: () => <span aria-hidden="true" />,
  Upload: () => <span aria-hidden="true" />,
  Camera: () => <span aria-hidden="true" />,
  Trash2: () => <span aria-hidden="true" />,
  Edit: () => <span aria-hidden="true" />,
  Plus: () => <span aria-hidden="true" />,
  Minus: () => <span aria-hidden="true" />,
  Copy: () => <span aria-hidden="true" />,
  QrCode: () => <span aria-hidden="true" />,
  Bookmark: () => <span aria-hidden="true" />,
  BookmarkCheck: () => <span aria-hidden="true" />,
  Share2: () => <span aria-hidden="true" />,
  Filter: () => <span aria-hidden="true" />,
  SlidersHorizontal: () => <span aria-hidden="true" />,
  Grid: () => <span aria-hidden="true" />,
  List: () => <span aria-hidden="true" />,
  ArrowLeft: () => <span aria-hidden="true" />,
  ArrowRight: () => <span aria-hidden="true" />,
  RefreshCw: () => <span aria-hidden="true" />,
  Zap: () => <span aria-hidden="true" />,
  Shield: () => <span aria-hidden="true" />,
  Award: () => <span aria-hidden="true" />,
  TrendingUp: () => <span aria-hidden="true" />,
  Clock: () => <span aria-hidden="true" />,
  Calendar: () => <span aria-hidden="true" />,
  Phone: () => <span aria-hidden="true" />,
  Mail: () => <span aria-hidden="true" />,
  MessageSquare: () => <span aria-hidden="true" />,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    logout: vi.fn(),
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
  })),
}))

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ address: null, connecting: false, connect: vi.fn() }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuthContext: vi.fn(() => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}))

// ─── axe helper ───────────────────────────────────────────────────────────────

/**
 * Run axe on the rendered container and return violations.
 * Configured for WCAG 2.1 AA.
 */
async function runAxe(container: Element) {
  const results = await axe.run(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
    },
  })
  return results.violations
}

function formatViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n  Nodes: ${v.nodes.map((n) => n.html).join(', ')}`,
    )
    .join('\n')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Accessibility (WCAG 2.1 AA)', () => {
  describe('WorkerCard', () => {
    it('has no axe violations', async () => {
      const { default: WorkerCard } = await import('@/components/WorkerCard')
      const { container } = render(
        <WorkerCard
          worker={{
            id: 'w1',
            name: 'Jane Doe',
            isVerified: true,
            category: { id: 'c1', name: 'Plumber' },
            bio: 'Expert plumber',
            location: 'Lagos, Nigeria',
          }}
        />,
      )
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('Navbar (logged out)', () => {
    it('has no axe violations', async () => {
      const { default: Navbar } = await import('@/components/Navbar')
      const { container } = render(<Navbar />)
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('Footer', () => {
    it('has no axe violations', async () => {
      const { default: Footer } = await import('@/components/Footer')
      const { container } = render(<Footer />)
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('EmptyState', () => {
    it('has no axe violations', async () => {
      const { default: EmptyState } = await import('@/components/EmptyState')
      const { container } = render(
        <EmptyState title="No workers found" description="Try adjusting your search." />,
      )
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('StarRating', () => {
    it('has no axe violations', async () => {
      const { default: StarRating } = await import('@/components/StarRating')
      const { container } = render(<StarRating rating={4} />)
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('FormField', () => {
    it('has no axe violations with label and input', async () => {
      const { default: FormField } = await import('@/components/FormField')
      const { container } = render(
        <FormField label="Email address" name="email" type="email" />,
      )
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('PasswordStrength', () => {
    it('has no axe violations', async () => {
      const { default: PasswordStrength } = await import('@/components/PasswordStrength')
      const { container } = render(<PasswordStrength password="Test123!" />)
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })

  describe('ReviewCard', () => {
    it('has no axe violations', async () => {
      const { default: ReviewCard } = await import('@/components/ReviewCard')
      const { container } = render(
        <ReviewCard
          review={{
            id: 'r1',
            rating: 5,
            comment: 'Excellent work!',
            author: { name: 'Alice Smith' },
            createdAt: '2024-01-01T00:00:00Z',
          }}
        />,
      )
      const violations = await runAxe(container)
      expect(violations, formatViolations(violations)).toHaveLength(0)
    })
  })
})
