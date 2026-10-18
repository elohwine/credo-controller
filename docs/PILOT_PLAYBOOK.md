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

## 🙋 Asking for something (Request on Home)

On Home, next to Scan, Receive, Pay and Share, there is **Request**. On the website it is the **Request** button at the top of Home, and the "Ask for something" cards below. It shows only what you can ask for right now.

**My organisations** — one block for each organisation you work with.

- **Ask for leave**: pick the kind of leave and the first and last day. Your manager gets it in their inbox and decides. You see the answer under My requests.
- **Claim an expense**: say what you paid for, the amount and the category. Your manager decides; finance pays you back and marks it paid.
- **Ask for my payout**: only shows when one of your finished jobs is still waiting for its payment. It sends a reminder to the person who releases it. It closes by itself when the payment goes out.
- **Something else**: a short title and a few words. It goes to the person who handles requests in that organisation.

**My records** — for a new or reset phone.

- **Staff card** and **receipts** come back to your inbox; accept each one.
- **Payslips** are sent by your payroll person. Tap "Ask the organisation" and they get your request.

**Other businesses** — organisations you do not work for.

- **Ask for a quote**, **Ask for a bill**, **Book a service**: on the phone, pick the business under Network → Discover; on the website, search for it in the sheet. They see your name and what you wrote, nothing else. Their answer arrives in your inbox.

**Acting as an organisation**: the sheet shows the organisation's actions instead (purchase request, new field job, collect a payment). Your own requests stay under your personal account.

**My requests** lists everything you asked for, where it is (Waiting, Done, Declined) and, for an organisation request, its full History.

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
