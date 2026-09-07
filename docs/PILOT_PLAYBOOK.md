# Pilot Playbook — Merchant & Driver Onboarding

> Step-by-step guide for onboarding pilot participants

---

## 🏪 Merchant Onboarding

### Prerequisites

- Active EcoCash merchant account
- WhatsApp Business number
- Product catalog (3-5 items for pilot)

### Setup Steps

1. **Create Merchant Account**

   ```
   POST /multi-tenancy/create-tenant
   {
     "config": { "label": "Harare Groceries" }
   }
   ```

2. **Configure EcoCash**

   - Add merchant code to tenant config
   - Verify webhook endpoint access

3. **Seed Products**

   ```
   POST /catalog/items
   {
     "name": "Cooking Oil 2L",
     "price": 5.50,
     "currency": "USD",
     "merchantId": "<tenant_id>"
   }
   ```

4. **Test Transaction**
   - Create test order via WhatsApp
   - Verify ReceiptVC issuance
   - Confirm wallet receipt

---

## 🚗 Driver Onboarding

### Prerequisites

- Smartphone with camera
- WhatsApp access
- Brief training (15 min)

### Training Checklist

- [ ] Explain the verification flow
- [ ] Practice scanning QR codes
- [ ] Show "Verified" vs "Failed" states
- [ ] Demonstrate "Mark Delivered" action

### Verification Flow

1. Customer shows QR code (from receipt)
2. Driver opens verification link
3. Page shows:
   - ✅ **Paid** badge
   - 🧾 Order summary
   - 📦 "Mark Delivered" button
4. Driver taps "Mark Delivered"
5. Handover complete

---

## 📱 WhatsApp Message Templates

### Order Confirmation

```
🛒 *Order Confirmed*

Order: #{{order_id}}
Total: ${{amount}} USD

💳 Pay via EcoCash:
Dial *151# > Pay Bill > {{merchant_code}}

Your verified receipt will be sent after payment.
```

### Receipt Delivered

```
✅ *Payment Received*

Receipt: #{{receipt_id}}
Amount: ${{amount}} USD
Merchant: {{merchant_name}}

🔗 View verified receipt:
{{receipt_url}}

💾 Save to wallet for proof of purchase.
```

### Delivery Verification

```
📦 *Ready for Delivery*

Show this QR to your driver at handover:
{{qr_image}}

Or share this link:
{{verify_url}}

The driver will scan to confirm delivery.
```

---

## 🔧 Troubleshooting

| Issue                 | Solution                                        |
| --------------------- | ----------------------------------------------- |
| QR won't scan         | Check camera focus, ensure adequate lighting    |
| "Verification Failed" | Check if payment was completed, contact support |
| No receipt received   | Verify phone number, check WhatsApp connection  |
| Payment timeout       | Retry payment, check EcoCash balance            |

---

## 📞 Support Contacts

- **Technical Support:** [Support channel]
- **Merchant Issues:** [Merchant contact]
- **Driver Hotline:** [Driver contact]

---

## 📊 Pilot Feedback Form

Collect weekly feedback:

- Transaction count
- Issues encountered
- User confusion points
- Suggested improvements
