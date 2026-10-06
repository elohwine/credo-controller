# Portal UI Quick Reference Guide

## Starting the Portal

```bash
# Terminal 1: Start main API server
cd /home/eloh/PROJECTS/credo-controller
node samples/startServer.js

# Terminal 2: Start holder server
node samples/startHolderServer.js

# Terminal 3: Start portal UI
cd credo-ui/portal
yarn dev
```

Access portal at: `http://localhost:5000`

---

## Feature Guide

### 📦 Catalog Management (`/catalog`)

**Use Case**: Manage product inventory for e-commerce

1. Click "Add Item" button
2. Fill in:
   - Name (e.g., "iPhone 14")
   - SKU (e.g., "IPHONE14-BLK")
   - Price (e.g., 799.99)
   - Description (optional)
3. Submit to create
4. Use search bar to filter items

**API Endpoint**: `POST /api/catalog/items`

---

### 🛡️ Trust & Compliance (`/trust`)

**Use Case**: Monitor merchant reputation and report issues

**Check Trust Score**:

1. Enter merchant ID (e.g., "merchant-001")
2. View score (0-100) and badge
3. Review trust drivers breakdown

**Create Escalation**:

1. Click "Report Issue"
2. Enter merchant ID
3. Select reason (fraud/non-delivery/counterfeit/dispute)
4. Provide description
5. Submit to regulator

**API Endpoints**:

- `GET /api/trust/:merchantId`
- `POST /api/regulator/escalations`

---

### 💰 Payroll Processing (`/payroll`)

**Use Case**: Process employee payroll and issue PayslipVCs

1. Click "Run Payroll"
2. Set period start/end dates
3. Enable "Dry Run" for preview
4. Click "Run" to execute
5. View results: employees processed, gross/net totals

**API Endpoint**: `POST /api/payroll/run`

---

### 👤 Employee Onboarding (`/onboarding`)

**Use Case**: Track new employee onboarding workflows

1. Click "New Employee"
2. Fill in:
   - Employee Name
   - Email
   - Department
   - Role
   - Start Date
3. Submit to create case
4. Track status: in_progress → completed

**API Endpoint**: `POST /api/onboarding/cases`

---

### 🏢 Organization Setup (`/organization/setup`)

**Use Case**: Finish setup one question at a time. The phone Settings → Organisation page uses the same checklist.

1. Open **Organization → Setup**
2. The checklist has four steps: Say what you do, Choose who handles money, Pick how you take payments, Invite your team. **Start** opens that one question. **Change** opens it again.
3. After a save, **Next** continues and **Finish later** returns here. The page says how many of the four are done.
4. **Kinds of requests** lists what is open and what still needs a person.
5. **Who does what** (`/organization/actors`) is one category per window: Money, then each kind of request, then If nobody is chosen, then Role cards.

**API Endpoints**:

- `GET /api/organizations/{orgTenantId}/setup/profile`
- `PUT /api/organizations/{orgTenantId}/setup/profile`
- `GET /api/organizations/{orgTenantId}/setup/readiness`

---

### 💬 WhatsApp Commerce (`/whatsapp`)

**Use Case**: Monitor WhatsApp shopping cart activity

1. View active carts in left panel
2. Click cart to see details
3. Review items, quantities, prices
4. Check total and status

**API Endpoint**: `GET /api/wa/carts`

---

### 🚫 Credential Revocation (`/revocation`)

**Use Case**: Revoke compromised or invalid credentials

1. Browse all issued credentials
2. Use search to filter by ID/subject/type
3. Click "Revoke" on active credential
4. Confirm action in modal (irreversible)
5. Credential status changes to "Revoked"

**API Endpoint**: `POST /api/revocation/revoke/:credentialId`

---

### 📊 System Metrics (`/metrics`)

**Use Case**: Monitor platform health and performance

**Health Checks** (auto-refresh every 5s):

- Overall status (healthy/unhealthy)
- Database connection
- Agent availability
- Memory usage

**System Resources**:

- Heap memory (used/total)
- RSS memory
- Uptime

**Database Metrics**:

- Active connections
- Pool size
- Query latency

**Business Metrics**:

- Active wallets
- Credentials issued
- Workflows executed

**API Endpoints**:

- `GET /health`
- `GET /metrics/json`

---

## Navigation Tips

- **Top Bar**: All features accessible from navigation links
- **Home Dashboard**: Quick access to all 12 feature modules
- **Color Coding**:
  - 🟢 Green = Success/Active/Completed
  - 🟡 Yellow = Pending/In Progress
  - 🔴 Red = Error/Revoked/Critical

---

## Common Workflows

### E-commerce Flow

1. **Catalog** → Add products
2. **WhatsApp** → Customer creates cart
3. **Finance** → Generate invoice
4. **Trust** → Check merchant score
5. (Payment via EcoCash webhook)
6. **Finance** → Issue PaymentReceiptVC

### HR Workflow

1. **Onboarding** → Create new employee case
2. **HR Operations** → Add to department
3. **Payroll** → Include in pay run
4. **Payroll** → Issue PayslipVC

### Trust & Compliance

1. **Finance** → Transaction occurs
2. **Trust** → Score automatically updated
3. **Trust** → Issue detected → Create escalation
4. **Revocation** → Revoke merchant's credentials if needed

---

## Development Notes

### API Base URL

Currently hardcoded to `http://localhost:3000`. For production:

```typescript
// Create .env.local in credo-ui/portal
NEXT_PUBLIC_API_URL=https://api.credentis.co.zw
```

Update fetch calls:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
fetch(`${API_URL}/api/catalog/items`)
```

### Authentication

Portal pages currently bypass authentication. To add tenant auth:

```typescript
// Add to each page component
import { useAuth } from '@/hooks/useAuth'

export default function CatalogPage() {
  const { token } = useAuth()

  const res = await fetch(`${API_URL}/api/catalog/items`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}
```

### Error Handling

Add toast notifications:

```typescript
import { toast } from 'react-hot-toast';

try {
  const res = await fetch(...);
  if (!res.ok) throw new Error('API error');
  toast.success('Item created successfully');
} catch (error) {
  toast.error('Failed to create item');
  console.error(error);
}
```

---

## Troubleshooting

### "Failed to fetch" errors

- Ensure API server is running on port 3000
- Check CORS configuration in `src/server.ts`
- Verify endpoint exists in backend

### Empty data/tables

- Backend may need sample data seeding
- Check browser console for API errors
- Verify database migrations ran successfully

### Navigation not working

- Clear Next.js cache: `rm -rf .next`
- Rebuild portal: `yarn build && yarn dev`

### Metrics not updating

- Check metrics endpoint: `curl http://localhost:3000/health`
- Ensure MetricsController is mounted
- Verify TSOA routes regenerated

---

## Next Enhancements

1. **Real-time Updates**: Replace polling with WebSockets
2. **Bulk Operations**: Multi-select for revocation, catalog updates
3. **Advanced Filters**: Date ranges, status filters, category dropdowns
4. **Export Functions**: CSV/PDF downloads for reports
5. **Audit Logs**: Display who/when/what for all changes
6. **Mobile Optimization**: Responsive layouts for phone screens
7. **Offline Support**: Service worker for PWA functionality
8. **Localization**: Multi-language support (English, Shona, Ndebele)

---

## Support

For issues or questions:

- Check logs: `tail -f logs.txt`
- Review API docs: `http://localhost:3000/api-docs`
- See implementation checklist: `IMPLEMENTATION_CHECKLIST.md`
- Project overview: `PROJECT_OVERVIEW.md`
