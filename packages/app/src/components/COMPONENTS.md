# Components Documentation

This directory contains all React components for the Blue-Collar application.

## Component Categories

### Core Components
- **WorkerForm**: Main form for worker registration/profile editing
  - Decomposed into: WorkerBasicInfo, WorkerContactInfo, WorkerWalletInfo
- **ImageUpload**: Image upload with editing capabilities (crop, rotate, flip)
  - Uses custom hook: useImageProcessing

### UI Components (Shared Library)
Located in `ui/` directory - reusable design system components:
- Button
- Card
- Dialog
- Dropdown Menu
- Input
- Sheet
- Badge

### Feature Components
- **WorkerCard**: Displays worker information
- **WorkerInfiniteList**: Paginated worker listing
- **WorkerMap**: Map view of workers
- **SearchAutocomplete**: Search with autocomplete
- **TransactionHistory**: Payment/transaction history
- **NotificationDropdown**: User notifications
- **WorkerHeader**: Profile header with avatar, verification, and quick actions
- **WorkerContactDetails**: Worker address, email, and phone details
- **WorkerTipSection**: Wallet tipping and transaction history section

### Form Components
- **FormField**: Reusable form field wrapper
- **PasswordStrength**: Password strength indicator
- **StarRating**: Rating component

### Utility Components
- **ErrorBoundary**: Error handling wrapper
- **Skeleton**: Loading placeholder
- **Toast**: Notification messages
- **ZoomableAvatar**: Interactive avatar component

## Recent Refactoring

### ImageUpload Component
- **Before**: 239 lines, all logic inline
- **After**: 149 lines, logic extracted to `useImageProcessing` hook
- **Benefits**: Reusable image processing logic, cleaner component

### WorkerForm Component
- **Before**: 223 lines, all form fields inline
- **After**: 101 lines, decomposed into sub-components
- **Benefits**: Better maintainability, reusable form sections

## Component Guidelines

1. **Single Responsibility**: Each component should have one clear purpose
2. **Composition over Inheritance**: Use composition for complex UIs
3. **Custom Hooks**: Extract complex logic into reusable hooks
4. **Shared Library**: Use `ui/` components for consistent design
5. **Documentation**: Update this file when adding new components

## Testing

Components should have corresponding test files in `__tests__/` directory.