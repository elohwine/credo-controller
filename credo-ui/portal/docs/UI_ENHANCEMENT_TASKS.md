# Credentis Portal UI Enhancement Tasks

> **Design Philosophy:** Mantine is the gravity center. Glass is ceremonial, not functional.

---

## 🎨 Color Palette (Credentis Brand)

| Token | Hex | Usage |
|-------|-----|-------|
| **Curious Blue** | `#2188CA` | Primary actions, links, headers |
| **Link Water** | `#D0E6F3` | Background, light surfaces (replaces white) |
| **Viking** | `#6FB4DC` | Secondary accents, hover states |
| **Cornflower** | `#88C4E3` | Tertiary, borders, subtle highlights |

---

## 📚 Library Stack (Finalized)

| Library | Role | Install |
|---------|------|---------|
| **Mantine v7+** | Core UI (forms, layout, modals, tables) | `@mantine/core @mantine/hooks @mantine/form @mantine/notifications` |
| **React Bits** | Micro-interactions (text animations, magnet cursors) | Copy components from reactbits.dev |
| **Glassmorphism CSS** | Visual layer for trust surfaces | Custom CSS (see below) |
| **Framer Motion** | Animations | `framer-motion` |
| **Tabler Icons** | Icons | `@tabler/icons-react` |

---

## 🏗️ UI Tasks (Pre-Phase Work)

### Phase 0.1: Foundation Setup

- [ ] **Task 1:** Install Mantine and configure theme with Credentis palette
  ```bash
  cd credo-ui/portal && npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications @tabler/icons-react framer-motion
  ```

- [ ] **Task 2:** Create `lib/theme/credentis-theme.ts` with full Mantine theme object

- [ ] **Task 3:** Update `_app.tsx` to wrap with `MantineProvider`

- [ ] **Task 4:** Create CSS variables for glassmorphism in `styles/glass.css`

- [ ] **Task 5:** Add PostCSS preset for Mantine

---

### Phase 0.2: Component Directory Structure

Create the following structure per UI layer separation rules:

```
components/
├── base/           # Mantine ONLY - structural
│   ├── Button/
│   ├── Input/
│   ├── Table/
│   ├── Modal/
│   └── Layout/
├── admin/          # Mantine ONLY - no glass
│   ├── IssuerDashboard/
│   ├── VerifierConsole/
│   └── AuditLog/
└── trust/          # Mantine + Glass allowed
    ├── CredentialCard/
    ├── ProofResult/
    ├── VerifiedSeal/
    └── WalletIdentity/
```

---

### Phase 0.3: Glassmorphism CSS System

Create `styles/glass.css` with controlled glass classes:

```css
/* Glassmorphism - TRUST SURFACES ONLY */
.glass-surface {
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  background-color: rgba(33, 136, 202, 0.1); /* Curious Blue at 10% */
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.glass-card {
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  background-color: rgba(208, 230, 243, 0.75); /* Link Water at 75% */
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 8px 32px rgba(33, 136, 202, 0.15);
}

.glass-credential {
  backdrop-filter: blur(20px) saturate(200%);
  -webkit-backdrop-filter: blur(20px) saturate(200%);
  background: linear-gradient(
    135deg,
    rgba(208, 230, 243, 0.9) 0%,
    rgba(136, 196, 227, 0.8) 100%
  );
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Firefox fallback */
@-moz-document url-prefix() {
  .glass-surface,
  .glass-card,
  .glass-credential {
    background-color: rgba(208, 230, 243, 0.95);
  }
}
```

---

### Phase 0.4: Navigation & Layout Improvements

- [ ] **Task 6:** Reorganize nav into logical groups:
  
  | Group | Items |
  |-------|-------|
  | **Core** | Home, Credentials |
  | **Commerce** | Catalog, Finance, Inventory |
  | **Operations** | HR, Onboarding, Payroll |
  | **Trust** | Trust, Revocation, Workflows |
  | **System** | Metrics, WhatsApp |

- [ ] **Task 7:** Add collapsible sidebar for desktop, drawer for mobile

- [ ] **Task 8:** Implement breadcrumbs using Mantine `Breadcrumbs`

- [ ] **Task 9:** Add consistent page headers with `Paper` component

---

### Phase 0.5: Spacing & Layout Consistency

Apply Mantine spacing scale consistently:

| Spacing | Use Case |
|---------|----------|
| `xs` (4px) | Inline icon gaps |
| `sm` (8px) | Form field margins |
| `md` (16px) | Section padding |
| `lg` (24px) | Card padding |
| `xl` (32px) | Page section gaps |

- [ ] **Task 10:** Replace all raw pixel values with Mantine spacing tokens

- [ ] **Task 11:** Use `Stack` and `Group` components for vertical/horizontal layouts

- [ ] **Task 12:** Implement `Container` with max-width for content centering

---

### Phase 0.6: Animation System (React Bits + Framer Motion)

**Safe React Bits components to use:**

| Component | Use Case |
|-----------|----------|
| `SplitText` | Hero headings, page titles |
| `Aurora` | Background for wallet/holder views |
| `Dock` | Quick action bar (wallet only) |
| `Magnet` | Interactive credential cards |

**Framer Motion patterns:**

```tsx
// Page transitions
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
>
  {children}
</motion.div>

// Success state
<motion.div
  initial={{ scale: 0.8, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: "spring", stiffness: 200 }}
>
  <VerifiedSeal />
</motion.div>
```

---

### Phase 0.7: Trust Components (Glass Allowed)

Components where glass IS appropriate:

| Component | Description |
|-----------|-------------|
| `CredentialCard` | Display issued VCs with glass effect |
| `ProofResult` | Verification success/failure |
| `VerifiedSeal` | Animated checkmark with glass glow |
| `WalletIdentity` | User DID display |
| `TrustScore` | Merchant trust visualization |
| `PaymentReceipt` | Receipt VC presentation |

---

## ✅ Compliance Checklist

### Glass Rules
- [ ] Glass only on trust/proof surfaces
- [ ] No glass on forms, inputs, buttons
- [ ] No glass on admin/issuer/verifier pages
- [ ] Glass consumes theme colors, never defines new ones

### Mantine Rules
- [ ] All colors from theme tokens
- [ ] All spacing from theme scale
- [ ] Default radius: 8px structural, 12-16px glass
- [ ] Focus states respect accessibility

### Animation Rules
- [ ] Motion reveals truth (proof, verification)
- [ ] No animation on navigation
- [ ] No animation on inputs
- [ ] Respect `prefers-reduced-motion`

---

## 📋 Priority Order

1. **P0 (Now):** Theme setup, color tokens, Layout nest fix ✅
2. **P1 (This week):** Mantine provider, glass CSS, nav reorganization
3. **P2 (Next):** Component directory structure, spacing audit
4. **P3 (Later):** Animation system, trust components with glass

---

## 🔗 Official Documentation Links

| Resource | URL |
|----------|-----|
| Mantine Getting Started | https://mantine.dev/getting-started/ |
| Mantine Theme Object | https://mantine.dev/theming/theme-object/ |
| Mantine UI Components | https://ui.mantine.dev/ |
| React Bits | https://www.reactbits.dev/ |
| Glass UI Generator | https://ui.glass/generator/ |
| Framer Motion | https://www.framer.com/motion/ |
| Tabler Icons | https://tabler.io/icons |

---

## 🎯 Visual Hierarchy Summary

```
Admin/Issuer/Verifier (100% Mantine, Zero Glass)
├── Tables → Mantine Table
├── Forms → Mantine Form
├── Modals → Mantine Modal
├── Charts → Mantine Charts
└── Message: "This system is dependable"

Wallet/Holder/Proof (Mantine + Glass Accents)
├── Credential Card → Glass
├── Proof Result → Glass
├── Verified Seal → Glass + Animation
├── Identity → Glass
└── Message: "This proof is real"
```

> **Remember:** Glass is where *belief* happens.
