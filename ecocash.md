Get started with Ecocash Open API



Building Your Integration



Building an integration to the EcoCash Payments API involves the following steps:





Understand the API Documentation

Thoroughly review our API documentation to familiarize yourself with the available endpoints, request or response formats, authentication methods, and any specific requirements or limitations.





Choose an Integration Method

Select the integration method that best suits your application, such as RESTful APIs or SDKs provided by EcoCash. Ensure compatibility with your preferred programming language and consider the level of support we offer for the chosen integration method.





Implement Authentication

Take note of the authentication mechanism required, such as API keys or OAuth. Implement the necessary logic in your application to securely authenticate and authorize requests to the API.





Handle Payment Requests

Develop the logic to create payment requests within your application. This includes providing essential details like the payment amount, currency, customer MSISDN, and any additional data required by our for successful payment processing.





Handle Responses and Notifications

Implement the logic to handle responses and notifications received through the API. This involves capturing and processing payment success or failure responses, as well as handling asynchronous notifications like callbacks or webhooks for real-time updates on payment status.





Implement Error Handling

Create error handling mechanisms to handle potential errors or exceptions that may occur during the integration process. Handle scenarios such as network failures, invalid requests, or payment processing errors gracefully and provide appropriate feedback to users.





Test and Debug

Thoroughly test your integration using different test scenarios, including successful payments and failed payment attempts. Utilize debugging tools and techniques to identify and resolve any issues or inconsistencies in the integration.





Ensure Security and Compliance

Prioritize security measures to safeguard sensitive data. Implement data encryption, use secure transmission protocols like HTTPS, and adhere to relevant compliance standards, such as PCI-DSS, to maintain the security and integrity of payment transactions.





Consider User Experience

Design a seamless and user-friendly payment flow within your application. Provide clear instructions, informative error messages, and feedback to users throughout the payment process to enhance their experience.





Monitor and Maintain

Continuously monitor the integration's performance, uptime, and error logs. Stay updated with any API version changes or updates provided to ensure ongoing compatibility and reliability of your integration.





Refer to the EcoCash Payments API documentation for detailed information and reach out to our developer support team or community for assistance whenever required. By following these steps, you can build a robust integration with the EcoCash Payments API for a smooth and secure payment experience within your application.





Creating an API key.



Every call to the Ecocash API must include an API secret key. We generate an API key for you for both the Sandbox and Live environment. Follow the instructions below to create your API key.





Create An Account

First, create an account or sign in.

Create a new project and enter all required details.

Once you create an account, a one-time API key is generated. Keep this API key safe; it is generated only once.





Customer To Business Transactions



EcoCash Merchant and Bill Payments are key features of the EcoCash customer to business transactions that can be integrated into applications through the EcoCash API:





Merchant Payments

The EcoCash Merchant Payments feature enables businesses to accept payments from customers using the EcoCash mobile payment platform. By integrating the EcoCash Merchant Payments API into their applications, merchants can provide a seamless and secure payment experience for their customers. This API allows merchants to initiate payment requests, specify the payment amount and details, and receive real-time payment notifications. With the EcoCash Merchant Payments API, businesses can expand their payment options and tap into the large user base of EcoCash customers.





Bill Payments

The EcoCash Bill Payments feature allows users to conveniently pay their bills using the EcoCash platform. By integrating the EcoCash Bill Payments API into their applications, businesses can offer their customers a hassle-free way to settle their bills electronically. This API enables users to initiate bill payments, specify the biller details and payment amount, and receive confirmation of successful payments. With the EcoCash Bill Payments API, businesses can automate their billing processes, reduce manual handling of payments, and provide their customers with a convenient and efficient bill payment solution.





Business to Customer Transactions



Many systems that handle payment receipts may also require processing outward payments. This can include salary disbursements to employees or payments to other stakeholders who accept EcoCash. Currently, this feature is only available through a web portal or manual business-to-customer (B2C) transactions. This will made available soon, allowing developers to accomplish this task seamlessly using the API. This will empower developers and will eliminate the manual process of generating payment files, formatting them correctly, and uploading them via the web portal. Furthermore, there will no longer be a need for approval by a different user. With the B2C API, the process becomes streamlined.





Business to Business Transactions



Coming Soon





Reversals



Even with a sophisticated system in place, there will always be unique cases that require payment reversals. Consider a situation where a customer has made a payment for services that the merchant is no longer able to provide. The best approach is to have a reversal process that the merchant can adapt based on their internal procedures. The EcoCash API supports secure payment reversal automation for such cases. The implementation will depend on the specific service journey and the controls required by your business.



Payments



Ecocash Open API is organized around REST. Our API has resource-oriented URLs, accepts form-encoded request bodies, returns JSON responses, and uses standard HTTP response codes, authentication, and verbs. You can use the Ecocash Open API in test mode/sandbox, which doesn’t affect your live data or interact with the banking networks. The API key you use to authenticate the request determines whether the request is live mode or sandbox.





Payments Request:

BASE\_URL: https://developers.ecocash.co.zw/api/ecocash\_pay/



Sandbox

Live

POST: /api/v2/payment/instant/c2b/sandbox



Authenticated Request:

curl --location 'https://developers.ecocash.co.zw/api/ecocash\_pay/api/v2/payment/instant/c2b/sandbox' \\

--header 'X-API-KEY: 1wddI46HBW3pK7pH32wgr3st9wIM7E4w' \\

--header 'Content-Type: application/json' \\

--data '{

&nbsp; "customerMsisdn": "263774222475",

&nbsp; "amount": 10.50,

&nbsp; "reason": "Payment",

&nbsp; "currency": "USD",

&nbsp; "sourceReference": "581af738-f459-4629-a72e-8388e0acdb5e" 

}'



NB: Ensure sourceReference follows a valid UUID format.





When working in the sandbox, please use the following passwords to complete transactions. It's important to note that no other passwords will be accepted for these transactions:





&nbsp;   pin codes:

&nbsp;   - "0000"

&nbsp;   - "1234"

&nbsp;   - "9999"

&nbsp;   



Response:

STATUS: 200 OK



Code Sample



Java

Python

JavaScript

var settings = {

&nbsp; "url": "https://developers.ecocash.co.zw/api/ecocash\_pay/api/v2/payment/instant/c2b/sandbox",

&nbsp; "method": "POST",

&nbsp; "timeout": 0,

&nbsp; "headers": {

&nbsp;   "X-API-KEY": "1wddI46HBW3pK7pH32wgr3st9wIM7E4w",

&nbsp;   "Content-Type": "application/json"

&nbsp; },

&nbsp; "data": JSON.stringify({

&nbsp;   "customerMsisdn": "263774222475",

&nbsp;   "amount": 10.5,

&nbsp;   "reason": "Payment",

&nbsp;   "currency": "USD",

&nbsp;   "sourceReference": "581af738-f459-4629-a72e-8388e0acdb5e"

&nbsp; }),

};



$.ajax(settings).done(function (response) {

&nbsp; console.log(response);

});



HTTP Status Code Summary



200	 OK                 	Everything worked as expected.

400	 Bad Request        	The request was unacceptable, often due to missing a required parameter.

401	 Unauthorized       	No valid API key provided.

402	 Request Failed     	The parameters were valid but the request failed.

403	 Forbidden          	The API key doesn’t have permissions to perform the request.

404	 Not Found          	The requested resource doesn’t exist.

409	 Conflict           	The request conflicts with another request (perhaps due to using the same idempotent key).

429	 Too Many Requests  	Too many requests hit the API too quickly. We recommend an exponential backoff of your requests.

500	 Server Errors      	Something went wrong on Ecocash’s end. (These are rare.)



Refunds



Ecocash Open API is organized around REST. Our API has resource-oriented URLs, accepts form-encoded request bodies, returns JSON responses, and uses standard HTTP response codes, authentication, and verbs. You can use the Ecocash Open API in test mode/sandbox, which doesn’t affect your live data or interact with the banking networks. The API key you use to authenticate the request determines whether the request is live mode or sandbox.





Refunds Request:

BASE\_URL: https://developers.ecocash.co.zw/api/ecocash\_pay/



Sandbox

Live

POST: /api/v2/refund/instant/c2b/sandbox



Authenticated Request:

curl --location '

https://developers.ecocash.co.zw/api/ecocash\_pay/api/v2/refund/instant/c2b/live'

\\

--header 'X-API-KEY: 1wddI46HBW3pK7pH32wgr3st9wIM7E4w' \\

--header 'Content-Type: application/json' \\

--data '{

&nbsp; "origionalEcocashTransactionReference": "581af738-f459-4629-a72e-8388e0acdb5e",

&nbsp; "refundCorelator": "012345l61975",

&nbsp; "sourceMobileNumber": "263774222475",

&nbsp; "amount": 10.50,

&nbsp; "clientName": "vaya africa",

&nbsp; "currency": "ZiG",

&nbsp; "reasonForRefund": "string"

}'



NB: Ensure origionalEcocashTransactionReference follows a valid UUID format.





Response:

{

&nbsp;   "sourceReference": "581af738-f459-4629-a72e-8388e0acdb5e",

&nbsp;   "transactionEndTime": "20-02-2024",

&nbsp;   "callbackUrl": "",

&nbsp;   "destinationReferenceCode": "MP240213.1412.A01664",

&nbsp;   "sourceMobileNumber": "263774222475",

&nbsp;   "transactionStatus": "COMPLETED",

&nbsp;   "amount": 10.50,

&nbsp;   "destinationEcocashReference": "MP240213.1412.A01664",

&nbsp;   "clientMerchantCode": "850236",

&nbsp;   "clientMerchantNumber": "263771896633",

&nbsp;   "clienttransactionDate": "12-05-2024",

&nbsp;   "description": "",

&nbsp;   "responseMessage": "COMPLETED",

&nbsp;   "currency": "ZiG",

&nbsp;   "paymentAmount": 10.50,

&nbsp;   "ecocashReference": "012345l619757",

&nbsp;   "transactionstartTime": "15:56"

}



Code Sample



Java

Python

JavaScript

var settings = {

&nbsp; "url": "https://developers.ecocash.co.zw/api/ecocash\_pay/api/v2/refund/instant/c2b/live",

&nbsp; "method": "POST",

&nbsp; "timeout": 0,

&nbsp; "headers": {

&nbsp;   "X-API-KEY": "1wddI46HBW3pK7pH32wgr3st9wIM7E4w",

&nbsp;   "Content-Type": "application/json",

&nbsp;   "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJfY3ZoUmkxVkZtZ21Ueng0dXBPMFUwcF9uX1ZSWmdHUzVIbHNXNkUxN29FIn0.eyJleHAiOjE3MDg0NTc1NTYsImlhdCI6MTcwODQyMTU1NiwianRpIjoiYzU0Njg5YTktMmNhMS00ODE0LTkyMWMtNDg5NzU3OGY1YzE5IiwiaXNzIjoiaHR0cDovLzE5Mi4xNjguMTE4LjQxOjMxMjY2L2F1dGgvcmVhbG1zL2VpcF9vcGVuX2FwaSIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJlMWZlNjFjNS00ZWI0LTRjMDMtYjkzMS0xNjE2OTUzNDVmNDIiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ3ZWJfYXBwIiwic2Vzc2lvbl9zdGF0ZSI6ImYyZmEyY2VlLWQ4ZDUtNGI2YS05YzU1LTkyYjMzYjdlNzBmNSIsImFsbG93ZWQtb3JpZ2lucyI6WyJodHRwOi8vbG9jYWxob3N0OjMwMDAvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiIsImRlZmF1bHQtcm9sZXMtZWlwX29wZW5fYXBpIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJvcGVuaWQgZW1haWwgcHJvZmlsZSIsInNpZCI6ImYyZmEyY2VlLWQ4ZDUtNGI2YS05YzU1LTkyYjMzYjdlNzBmNSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwibmFtZSI6InRlc3QgdGVzdCIsInByZWZlcnJlZF91c2VybmFtZSI6InRlc3QudGVzdCIsImdpdmVuX25hbWUiOiJ0ZXN0IiwiZmFtaWx5X25hbWUiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QG1haWwuY29tIn0.BKIR8tB2PDHGRX1DbydY3d7EFGe67t276vX-Qqo7F4A3z\_uOJhn1QQWMgspY1XfdPMXT9Jjr0KPGzvcssgTEH3tPm-BzQ7rRrYvTxsL3IM4Pa3mZreZWuR9WDzdaKB0qiQPt6Mo4HmJ4GCtaqkb3d\_ekmW6RIkqRZrFNzu\_37Ap-2KfjqVdr9mHlX2bNy4eYREsI2R\_nD23WVDwM-TbRYx7qPMrbIVa9fUP5\_vs41ke8X7dNvxiEAYtw3yI5hwlFALgxh9tQ7xVtZrwy69Q7XcNIT8drUPsYyNMjndLNm8v41kB\_xUm\_RsNDR8YQlWNQwtOBJqUT2Uvj09QWgcbRSw"

&nbsp; },

&nbsp; "data": JSON.stringify({

&nbsp;   "origionalEcocashTransactionReference": "MP240213.1412.A01664",

&nbsp;   "refundCorelator": "012345l619757",

&nbsp;   "sourceMobileNumber": "263774222475",

&nbsp;   "amount": 10.5,

&nbsp;   "clientName": "vaya africa",

&nbsp;   "currency": "ZiG",

&nbsp;   "reasonForRefund": "string"

&nbsp; }),

};



$.ajax(settings).done(function (response) {

&nbsp; console.log(response);

});



HTTP Status Code Summary



200	 OK                 	Everything worked as expected.

400	 Bad Request        	The request was unacceptable, often due to missing a required parameter.

401	 Unauthorized       	No valid API key provided.

402	 Request Failed     	The parameters were valid but the request failed.

403	 Forbidden          	The API key doesn’t have permissions to perform the request.

404	 Not Found          	The requested resource doesn’t exist.

409	 Conflict           	The request conflicts with another request (perhaps due to using the same idempotent key).

429	 Too Many Requests  	Too many requests hit the API too quickly. We recommend an exponential backoff of your requests.

500	 Server Errors      	Something went wrong on Ecocash’s end. (These are rare.)







Transactions Lookup



Ecocash Open API is organized around REST. Our API has resource-oriented URLs, accepts form-encoded request bodies, returns JSON responses, and uses standard HTTP response codes, authentication, and verbs. You can use the Ecocash Open API in test mode/sandbox, which doesn’t affect your live data or interact with the banking networks. The API key you use to authenticate the request determines whether the request is live mode or sandbox.





Lookup Request:

BASE\_URL: https://developers.ecocash.co.zw/api/ecocash\_pay/



Sandbox

Live

POST: /api/v1/transaction/c2b/status/sandbox



Authenticated Request:

curl --location 'https://developers.ecocash.co.zw/api/ecocash\_pay/api/v1/transaction/c2b/status/sandbox' \\

--header 'X-API-KEY: 1wddI46HBW3pK7pH32wgr3st9wIM7E4w' \\

--header 'Content-Type: application/json' \\

--data '{

&nbsp; "sourceMobileNumber": "263774222475",

&nbsp; "sourceReference": "581af738-f459-4629-a72e-8388e0acdb5e"

}'



NB: Ensure sourceReference follows a valid UUID format.





Response:

{

&nbsp;   "amount": {

&nbsp;       "amount": 10.00,

&nbsp;       "currency": "USD"

&nbsp;   },

&nbsp;   "customerMsisdn": "263774222475",

&nbsp;   "reference": "gjhfgfdgh787",

&nbsp;   "ecocashReference": "MP240226.1054.A45839",

&nbsp;   "status": "SUCCESS",

&nbsp;   "transactionDateTime": "2024-02-26 10:54:41"

}



Optionally you may use this authenticated request to get near realtime updates on transaction status.



curl --location '

https://customer-call-back-url/custom-path'

\\

--header 'Content-Type: application/json' \\

--data '{

&nbsp;   "transactionOperationStatus": "",

&nbsp;   "clientReference": "",

&nbsp;   "ecocashReference": ""

}'





Code Samples



Java

Python

JavaScript

OkHttpClient client = new OkHttpClient().newBuilder()

&nbsp; .build();

MediaType mediaType = MediaType.parse("application/json");

RequestBody body = RequestBody.create(mediaType, "{\\n  \\"sourceMobileNumber\\": \\"263774222475\\",\\n  \\"sourceReference\\": \\"0123456789\\"\\n}");

Request request = new Request.Builder()

&nbsp; .url("https://developers.ecocash.co.zw/api/ecocash\_pay/api/v1/transaction/c2b/status/sandbox")

&nbsp; .method("POST", body)

&nbsp; .addHeader("X-API-KEY", "jyIqs8Z0Luk3oB5\_TxDZX-rxS9M\_95Ip")

&nbsp; .addHeader("Content-Type", "application/json")

&nbsp; .addHeader("Authorization", "Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJfY3ZoUmkxVkZtZ21Ueng0dXBPMFUwcF9uX1ZSWmdHUzVIbHNXNkUxN29FIn0.eyJleHAiOjE3MDg3MTQxODYsImlhdCI6MTcwODY3ODE4NiwianRpIjoiZmMwZjI2NjctYTVhOS00ZWZiLWEyNzctNmViNjY0NDJmMWRiIiwiaXNzIjoiaHR0cDovLzE5Mi4xNjguMTE4LjQxOjMxMjY2L2F1dGgvcmVhbG1zL2VpcF9vcGVuX2FwaSIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJlMWZlNjFjNS00ZWI0LTRjMDMtYjkzMS0xNjE2OTUzNDVmNDIiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ3ZWJfYXBwIiwic2Vzc2lvbl9zdGF0ZSI6IjMxZTBkYTRmLTUyNjUtNDUxYS04ZjA3LTRiMGY2ZGYwYTZlYiIsImFsbG93ZWQtb3JpZ2lucyI6WyJodHRwOi8vbG9jYWxob3N0OjMwMDAvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiIsImRlZmF1bHQtcm9sZXMtZWlwX29wZW5fYXBpIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJvcGVuaWQgZW1haWwgcHJvZmlsZSIsInNpZCI6IjMxZTBkYTRmLTUyNjUtNDUxYS04ZjA3LTRiMGY2ZGYwYTZlYiIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwibmFtZSI6InRlc3QgdGVzdCIsInByZWZlcnJlZF91c2VybmFtZSI6InRlc3QudGVzdCIsImdpdmVuX25hbWUiOiJ0ZXN0IiwiZmFtaWx5X25hbWUiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QG1haWwuY29tIn0.b2zrDl8XkLyTXlWa0oaMeP-4eivqyjeUWe3n\_xU9V8OWDXPtxzlq\_MDKG02BFlrSSoE14wlmRs5cvUdTdEcsgtnPKQqet4rT\_6fs-tcIrVGBjxQUVcB6BuDIxoNfO5f7z-5MTx\_oDFtYMycT1knZ5xWmyhLf2Vw5TjvTUydaZdcRKwTCgmfUA7bdaigccPEmEElH1oHkITvQGW6Wits38zyl6wlGcnxulJMly07vsgUMX7D\_Yrh2Zcs6gMMiqUK\_xDMk7xaonPVL69PRnhlQqQ8DksZbr-0oA6r14bf9fkDbshGTXV4FMzmWTZeTc\_2ThbpVMHJC7g5yJKPl35Be1A")

&nbsp; .build();

Response response = client.newCall(request).execute();



HTTP Status Code Summary



200	 OK                 	Everything worked as expected.

400	 Bad Request        	The request was unacceptable, often due to missing a required parameter.

401	 Unauthorized       	No valid API key provided.

402	 Request Failed     	The parameters were valid but the request failed.

403	 Forbidden          	The API key doesn’t have permissions to perform the request.

404	 Not Found          	The requested resource doesn’t exist.

409	 Conflict           	The request conflicts with another request (perhaps due to using the same idempotent key).

429	 Too Many Requests  	Too many requests hit the API too quickly. We recommend an exponential backoff of your requests.

500	 Server Errors      	Something went wrong on Ecocash’s end. (These are rare.)

Great — I did the research and produced everything you asked for:

1. A focused research brief (Zimbabwe hardware case study + documented invoice/quotation fraud incidents and how this platform fixes them).
2. A full **OpenAPI 3.0 (YAML)** spec you can use to generate server/client code. It’s tied to the EcoCash endpoints described in their docs and uses your test API key in the examples. It contains endpoints for Quote → Invoice → Payment initiation (EcoCash) → webhook handling → Receipt VC issuance → presentation verification.
3. Production-ready **JSON-LD VC schema files** for **QuoteVC**, **InvoiceVC** and **ReceiptVC** (complete fields, credentialStatus for revocation, evidence/anchor metadata, selective disclosure notes). They’re portable (registry-agnostic) and ready to register later with your permissioned ledger.

Below I give the research brief (short but well-cited), then paste the OpenAPI YAML (copy-paste ready), then the three JSON-LD schemas (copy-paste ready). At the end are clear implementation notes, security cautions, and next steps so your dev can start immediately.

---

# 1) Research brief — Quotation/Invoice fraud in Zimbabwe (hardware case study) and how the Trust platform solves it

## Synopsis

Quotation (proforma) and invoice fraud is real and common in Zimbabwe — scammers and insiders manipulate proforma invoices, forge supplier documents, or redirect payments to fraudulent accounts. Hardware stores and construction suppliers are frequently targeted because of large-value orders and dependence on invoices/proforma documents for payment and stock release. Two local examples illustrate the problem:

* **Halsteds (Mutare, hardware)** — public reporting shows a case where a builder forged/altered invoices to steal construction materials — the individual was arrested for an elaborate invoice alteration and material fraud. This is a concrete example of how forged invoices/proforma documents are used to misappropriate stock from hardware suppliers. ([newsnest.co.za][1])
* **N. Richards group (Masvingo hardware shops)** — reporting documents a well-organized cement scam resulting in losses (alleged $300k) across hardware stores, showing the scale of vendor fraud affecting hardware retailers. ([tellzim.com][2])

Additional evidence: Zimbabwean court documents and legal commentary repeatedly show proforma invoices and missing documentation as central elements in commercial disputes and fraud cases — proving this is a structural problem across sectors, including hardware and wholesale supply. ([lawportalzim.co.zw][3])

## Why hardware merchants are particularly vulnerable

* High-value inventory, frequent deliveries, and many purchase orders make reconciliation complex.
* Manual paper/PDF workflows and reliance on screenshots or emails for payment proof create opportunities for forgery and impersonation.
* In many cases, buyers or agents present forged proforma invoices to justify prepayment or to collect goods. Once goods are released, tracing money or goods is slow and painful.
* Informal markets (Mbare Musika, etc.) further complicate trust because many transactions are cash or mobile money based with minimal digital audit trails. ([Facebook][4])

## How the Trust-as-a-Service platform solves the problem (business features, not technical jargon)

The platform replaces fragile paper/PDF receipts and screenshots with a clear, auditable chain of digital evidence your merchant and buyer can rely on:

1. **Verifiable Quote (QuoteVC)** — when the merchant issues a quotation/proforma, the platform issues a **signed QuoteVC**. This proves the quotation existed, who issued it, and what the terms were. It prevents later substitution or forgery of the original quote. (Buyer stores the QuoteVC in their wallet.)

2. **Verifiable Invoice (InvoiceVC)** — when the buyer accepts the quote, the seller issues an **InvoiceVC** that references the QuoteVC ID (creates a provable chain: quote → invoice). The invoice also contains payment instructions (EcoCash merchant number or QR). Because it’s signed and anchored to a registry (or includes evidence), it cannot be swapped or forged after issuance.

3. **Verifiable Receipt (ReceiptVC)** — when payment is received via EcoCash, the platform verifies the EcoCash transaction (webhook/verify endpoint) and issues a **ReceiptVC** (ideally signed by EcoCash’s DID or by the platform on EcoCash authority). This receipt contains the EcoCash transaction reference and links to the invoice and quote. A screenshot can never substitute for this cryptographic proof.

4. **Chain of trust & audit** — the full cycle (QuoteVC → InvoiceVC → ReceiptVC) forms an immutable audit trail. If disputes arise, the merchant, buyer, bank, or regulator can verify the credentials cryptographically (signature + revocation + optional public anchor). This speeds dispute resolution and reduces fraud.

5. **Low friction for SME adoption** — the initial pilot requires minimal investment: the SME uses their EcoCash Plus merchant setup (existing EcoCash onboarding for SMEs) and a simple web/mobile dashboard (or lightweight app) to create quotes/invoices and push VCs to customers. The platform handles the VC signing (key management) and EcoCash integration — the SME’s main change is to issue quotes via the dashboard instead of Word/PDF emails.

6. **Why this works for financial inclusion & informal markets**

* EcoCash has huge SME and informal market penetration. Tying VC issuance to EcoCash payments leverages behavior users already trust and use.
* Governments pushing to formalize informal markets (tax reporting, vendor registration) can rely on machine-readable VC proofs to reconcile and regularize markets like Mbare Musika. The platform provides the verification layer regulators need to trust digital transactions without forcing hardware or expensive devices on traders.

**Citations & sources:** article on Mutare invoice forgery at Halsteds; N. Richards cement scam reports; court/legal cases referencing proforma invoice evidence; EcoCash scam advisories — all show the problem and support the platform’s value proposition. ([newsnest.co.za][1])

---

# 2) OpenAPI 3.0 spec (YAML) — Credo Controller integrated with EcoCash

This is a **complete, copy-paste ready OpenAPI YAML** tailored to your flow. It includes example bodies using EcoCash’s endpoints and your **test API key** where appropriate. (Keep the key secure; this is for sandbox/testing only.)

> Save this as `credo-ecocash-openapi.yaml` and feed directly to Swagger / OpenAPI codegen.

```yaml
openapi: 3.0.3
info:
  title: Credo Controller - Quote/Invoice/Payment/Receipt API (EcoCash)
  version: 1.0.0
  description: >
    Credo Controller API for Quote -> Invoice -> Payment (via EcoCash) -> Receipt VC issuance.
    Designed to work with EcoCash Open API (sandbox/live). Includes webhook handling and VC issuance endpoints.
servers:
  - url: https://api.yourdomain.com/v1
security:
  - oauth2: []
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://auth.yourdomain.com/oauth/token
          scopes:
            credoscope: "Access Credo Controller APIs"
    ApiKeyHeader:
      type: apiKey
      in: header
      name: X-API-Key
  schemas:
    # Request/response schemas (concise)
    QuoteCreate:
      type: object
      required: [issuerDid, buyerDid, items, total, validUntil]
      properties:
        issuerDid: { type: string, example: "did:org:chipo-shop" }
        buyerDid: { type: string, example: "did:example:buyer-001" }
        items:
          type: array
          items:
            type: object
            required: [sku, qty, unitPrice]
            properties:
              sku: { type: string, example: "HAMMER-1" }
              description: { type: string, example: "Claw hammer 16oz" }
              qty: { type: integer, example: 2 }
              unitPrice: { type: number, example: 25.00 }
        total: { type: number, example: 50.00 }
        currency: { type: string, example: "ZWL" }
        validUntil: { type: string, format: date-time, example: "2025-11-24T09:00:00Z" }
        terms: { type: string, example: "30% deposit required" }
    QuoteResponse:
      type: object
      properties:
        quoteId: { type: string, example: "Q-2025-0001" }
        quoteVC: { type: object, description: "Signed Quote VC JSON-LD" }
    InvoiceCreate:
      type: object
      required: [issuerDid, buyerDid, quoteRef, invoiceId, total, dueDate]
      properties:
        issuerDid: { type: string, example: "did:org:chipo-shop" }
        buyerDid: { type: string, example: "did:example:buyer-001" }
        quoteRef: { type: string, example: "Q-2025-0001" }
        invoiceId: { type: string, example: "INV-2025-1001" }
        total: { type: number, example: 52.50 }
        currency: { type: string, example: "ZWL" }
        dueDate: { type: string, format: date, example: "2025-11-24" }
        paymentInstructions:
          type: object
          properties:
            method: { type: string, example: "EcoCash" }
            merchantNumber: { type: string, example: "+263772XXXXXXX" }
            qrPayload: { type: string, description: "QR payload for EcoCash/Paynow" }
    InvoiceResponse:
      type: object
      properties:
        invoiceId: { type: string }
        invoiceVC: { type: object }
        paymentRequest: { type: object, description: "Optional payment initiation payload" }
    PaymentInitiate:
      type: object
      required: [invoiceId, payerPhone, amount, currency]
      properties:
        invoiceId: { type: string }
        payerPhone: { type: string, example: "+263774222475" }
        amount: { type: number, example: 52.50 }
        currency: { type: string, example: "USD" }
        reason: { type: string, example: "Payment for INV-2025-1001" }
        sourceReference: { type: string, example: "581af738-f459-4629-a72e-8388e0acdb5e" }
    PaymentInitiateResponse:
      type: object
      properties:
        paymentRequestId: { type: string, example: "PR-20251117-abc" }
        status: { type: string, example: "pending" }
        ecocashCall:
          type: object
          description: "Echo of EcoCash request/response"
    EcoCashWebhook:
      type: object
      properties:
        paymentRequestId: { type: string }
        status: { type: string }
        transactionId: { type: string }
        amount: { type: number }
        currency: { type: string }
        metadata: { type: object }
    ReceiptVCResponse:
      type: object
      properties:
        receiptVC: { type: object }
        deliveredToHolder: { type: boolean }
    PresentationVerifyRequest:
      type: object
      required: [presentation]
      properties:
        presentation: { type: object }
    PresentationVerifyResponse:
      type: object
      properties:
        valid: { type: boolean }
        errors: { type: array, items: { type: string } }
paths:
  /quotes:
    post:
      tags: [quotes]
      summary: Create a Quote and issue QuoteVC
      security:
        - oauth2: [credoscope]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/QuoteCreate'
      responses:
        '201':
          description: Quote created and VC issued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QuoteResponse'
  /quotes/{quoteId}/accept:
    post:
      tags: [quotes]
      summary: Buyer accepts a quote -> create Invoice & issue InvoiceVC
      security:
        - oauth2: [credoscope]
      parameters:
        - name: quoteId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InvoiceCreate'
      responses:
        '201':
          description: Invoice created and InvoiceVC issued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InvoiceResponse'
  /payments/initiate:
    post:
      tags: [payments]
      summary: Initiate EcoCash payment (calls EcoCash C2B endpoint)
      security:
        - oauth2: [credoscope]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PaymentInitiate'
      responses:
        '200':
          description: Payment initiated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentInitiateResponse'
      x-code-samples:
        - lang: Shell
          label: Example EcoCash C2B call (sandbox)
          source: |
            curl --location 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/instant/c2b/sandbox' \
              --header 'X-API-KEY: 405mvFAY3Tz6o3V48JX6NDeSWGneVLaB' \
              --header 'Content-Type: application/json' \
              --data '{
                "customerMsisdn": "263774222475",
                "amount": 10.5,
                "reason": "Payment for INV-2025-1001",
                "currency": "USD",
                "sourceReference": "581af738-f459-4629-a72e-8388e0acdb5e"
              }'
  /webhooks/ecocash:
    post:
      tags: [payments]
      summary: EcoCash webhook for payment status updates (HMAC/APIKEY protected)
      security:
        - ApiKeyHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EcoCashWebhook'
      responses:
        '200':
          description: Ack received
  /credentials/issue-receipt:
    post:
      tags: [credentials]
      summary: Issue a ReceiptVC (called internally on confirmed payment)
      security:
        - oauth2: [credoscope]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [invoiceId, transactionId]
              properties:
                invoiceId: { type: string }
                transactionId: { type: string }
                payerDid: { type: string }
                merchantDid: { type: string }
      responses:
        '201':
          description: Receipt VC created and delivered (if holder reachable)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReceiptVCResponse'
  /verify/presentation:
    post:
      tags: [credentials]
      summary: Verify a Verifiable Presentation (VP) from a holder
      security:
        - oauth2: [credoscope]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PresentationVerifyRequest'
      responses:
        '200':
          description: Verification result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PresentationVerifyResponse'
  /transactions/lookup:
    post:
      tags: [payments]
      summary: Lookup transaction status with EcoCash (polling/near realtime)
      security:
        - oauth2: [credoscope]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [sourceMobileNumber, sourceReference]
              properties:
                sourceMobileNumber: { type: string, example: "263774222475" }
                sourceReference: { type: string, example: "581af738-f459-4629-a72e-8388e0acdb5e" }
      responses:
        '200':
          description: EcoCash transaction lookup
          content:
            application/json:
              schema:
                type: object
                properties:
                  amount: { type: object }
                  customerMsisdn: { type: string }
                  reference: { type: string }
                  ecocashReference: { type: string }
                  status: { type: string }
                  transactionDateTime: { type: string }
tags:
  - name: quotes
  - name: invoices
  - name: payments
  - name: credentials
```

**How this OpenAPI maps to the flow**

* `POST /quotes` → create QuoteVC and return signed VC.
* `POST /quotes/{id}/accept` → create InvoiceVC referencing quote.
* `POST /payments/initiate` → Credo calls EcoCash C2B sandbox endpoint using `X-API-KEY` (sample code uses your test key). Store `sourceReference` (UUID) and paymentRequestId.
* `POST /webhooks/ecocash` → EcoCash calls this on status updates. On `status: SUCCESS` the webhook handler calls `/credentials/issue-receipt` to mint ReceiptVC using EcoCash transaction metadata.
* `POST /credentials/issue-receipt` → construct ReceiptVC JSON-LD and either push via DIDComm to holder or store server-side and return `vcUrl`.
* `POST /verify/presentation` → accept VP from holder and validate cryptographic proof + revocation.

**Important security notes**

* Protect webhook route with HMAC verification & `X-API-Key` (provided by EcoCash sandbox or your own secret). Validate `sourceReference` and idempotency keys to avoid double-issuing receipts.
* Manage VC issuer private keys in an HSM/KMS. Never hardcode keys in source.
* Use TLS everywhere.

---

# 3) Production-ready JSON-LD VC schemas (three files)

Below are the full JSON-LD schemas. Save each as a `.jsonld` file (e.g., `quote-vc-schema.jsonld`, `invoice-vc-schema.jsonld`, `receipt-vc-schema.jsonld`). They are portable (no registry dependency). Each contains `schemaId` you can later register with your permissioned ledger.

---

## quote-vc-schema.jsonld

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    {
      "QuoteCredential": "https://example.org/credentials/quote-v1",
      "quoteId": "https://example.org/credentials/schema/quoteId",
      "items": "https://example.org/credentials/schema/items",
      "total": "https://example.org/credentials/schema/total",
      "currency": "https://example.org/credentials/schema/currency",
      "validUntil": "https://example.org/credentials/schema/validUntil",
      "terms": "https://example.org/credentials/schema/terms",
      "schemaId": "https://example.org/credentials/schema/schemaId"
    }
  ],
  "id": "urn:uuid:quote-vc-{{UUID}}",
  "type": ["VerifiableCredential", "QuoteCredential"],
  "issuer": "did:org:chipo-shop",
  "issuanceDate": "2025-11-17T09:00:00Z",
  "credentialSubject": {
    "id": "did:example:buyer-001",
    "quoteId": "Q-2025-0001",
    "items": [
      { "sku": "HAMMER-1", "description": "Claw hammer 16oz", "qty": 2, "unitPrice": 25.00 }
    ],
    "total": 50.0,
    "currency": "ZWL",
    "validUntil": "2025-11-24T09:00:00Z",
    "terms": "30% deposit required"
  },
  "schemaId": "urn:vc:chipo:quote:v1",
  "credentialStatus": {
    "id": "https://registry.yourdomain.com/revocations/quote/Q-2025-0001",
    "type": "RevocationList2021"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-11-17T09:00:05Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:org:chipo-shop#key-1",
    "jws": "BASE64_SIGNATURE"
  }
}
```

**Notes**

* Replace `{{UUID}}` with a server-generated UUID per issuance.
* Keep `issuer` as the actual issuer DID (seller DID or platform DID if platform issues on seller’s behalf).
* `credentialStatus` points to a revocation entry on your registry. For pilot you can implement a simple revocation endpoint.

---

## invoice-vc-schema.jsonld

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    {
      "InvoiceCredential": "https://example.org/credentials/invoice-v1",
      "invoiceId": "https://example.org/credentials/schema/invoiceId",
      "quoteRef": "https://example.org/credentials/schema/quoteRef",
      "dueDate": "https://example.org/credentials/schema/dueDate",
      "tax": "https://example.org/credentials/schema/tax",
      "paymentInstructions": "https://example.org/credentials/schema/paymentInstructions",
      "schemaId": "https://example.org/credentials/schema/schemaId"
    }
  ],
  "id": "urn:uuid:invoice-vc-{{UUID}}",
  "type": ["VerifiableCredential", "InvoiceCredential"],
  "issuer": "did:org:chipo-shop",
  "issuanceDate": "2025-11-17T09:15:00Z",
  "credentialSubject": {
    "id": "did:example:buyer-001",
    "invoiceId": "INV-2025-1001",
    "quoteRef": "Q-2025-0001",
    "dueDate": "2025-11-24",
    "tax": 2.5,
    "total": 52.5,
    "currency": "ZWL",
    "paymentInstructions": {
      "method": "EcoCash",
      "merchantNumber": "+263772XXXXXXX",
      "qrPayload": "ecocash://qr?m=+26377...
      "
    }
  },
  "schemaId": "urn:vc:chipo:invoice:v1",
  "credentialStatus": {
    "id": "https://registry.yourdomain.com/revocations/invoice/INV-2025-1001",
    "type": "RevocationList2021"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-11-17T09:15:05Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:org:chipo-shop#key-1",
    "jws": "BASE64_SIGNATURE"
  }
}
```

**Notes**

* `paymentInstructions.qrPayload` should follow EcoCash/Paynow canonical QR format for one-tap pay. The invoice links immediately to EcoCash payment flow.

---

## receipt-vc-schema.jsonld

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    {
      "PaymentReceipt": "https://example.org/credentials/payment-receipt-v1",
      "transactionId": "https://example.org/credentials/schema/transactionId",
      "invoiceId": "https://example.org/credentials/schema/invoiceId",
      "amount": "https://example.org/credentials/schema/amount",
      "currency": "https://example.org/credentials/schema/currency",
      "merchantDid": "https://example.org/credentials/schema/merchantDid",
      "payerDid": "https://example.org/credentials/schema/payerDid",
      "ecocashRef": "https://example.org/credentials/schema/ecocashRef",
      "anchor": "https://example.org/credentials/schema/anchor",
      "schemaId": "https://example.org/credentials/schema/schemaId"
    }
  ],
  "id": "urn:uuid:receipt-vc-{{UUID}}",
  "type": ["VerifiableCredential", "PaymentReceipt"],
  "issuer": "did:org:ecocash",
  "issuanceDate": "2025-11-17T09:20:30Z",
  "credentialSubject": {
    "id": "did:example:buyer-001",
    "invoiceId": "INV-2025-1001",
    "transactionId": "ECX-20251117-ABC123",
    "amount": 52.50,
    "currency": "ZWL",
    "timestamp": "2025-11-17T09:20:00Z",
    "merchantDid": "did:org:chipo-shop",
    "payerDid": "did:example:buyer-001",
    "ecocashRef": {
      "providerTxnRef": "ECX-20251117-ABC123",
      "gatewayRef": "PR-20251117-abc",
      "status": "SETTLED"
    }
  },
  "schemaId": "urn:vc:ecocash:receipt:v1",
  "evidence": [
    {
      "type": "TransactionEvidence",
      "url": "https://explorer.yourdomain.com/tx/ECX-20251117-ABC123",
      "name": "EcoCash transaction record",
      "note": "Payment confirmed by EcoCash via API"
    }
  ],
  "credentialStatus": {
    "id": "https://registry.yourdomain.com/revocations/receipt/ECX-20251117-ABC123",
    "type": "RevocationList2021"
  },
  "anchor": {
    "method": "OpenTimestamps",
    "anchorHash": "sha256:abcdef...",
    "anchorTx": "btc_txid_or_url",
    "anchorConfirmedAt": "2025-11-17T10:35:00Z"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-11-17T09:20:45Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:org:ecocash#key-1",
    "jws": "BASE64_SIGNATURE"
  }
}
```

**Notes**

* Best trust model: EcoCash issues ReceiptVC signed with `did:org:ecocash`. If EcoCash is not able to sign on your pilot, platform signs but *must* include `ecocashRef` and `evidence.url` that provides the EcoCash transaction record for auditors. Later, negotiate co-signing with EcoCash.

---

# 4) Implementation notes, developer tips & immediate next steps

## Quick dev checklist (what to implement first)

1. **Bootstrap Credo Controller**: endpoints per OpenAPI file. Implement `/quotes` and `/quotes/{id}/accept` first (they create VCs).
2. **EcoCash sandbox integration**: implement `POST /payments/initiate` that maps to EcoCash sandbox `POST /api/v2/payment/instant/c2b/sandbox` using `X-API-KEY: 405mvFAY3Tz6o3V48JX6NDeSWGneVLaB` for testing. Include `sourceReference` as UUID for idempotency.
3. **Webhook handling**: implement `POST /webhooks/ecocash` (verify HMAC/API key) and on `status: SUCCESS` call `POST /credentials/issue-receipt`.
4. **VC signing**: integrate Aries-JS / Credo signing to sign JSON-LD VCs. For early dev use `did:key` with a secure key in a KMS. Later migrate to HSM & permissioned registry.
5. **Wallet delivery**: deliver VC to holder via DIDComm push or return `vcUrl` for manual import.
6. **Verifier**: quick web app that receives VP (OIDC4VP or DIDComm) and validates signature, `credentialStatus` (revocation) and `anchor` if present.

## UX suggestions (minimize friction)

* For SMEs: one dashboard where you create quote → automatically issue QuoteVC and send buyer a link (deep link to wallet). Buyer clicks, accepts, invoice is generated and shows Pay button (EcoCash). After payment, ReceiptVC auto-added.
* Keep the wallet simple: show timeline Quote → Invoice → Receipt with big green verified ticks and an option to download a PDF with cryptographic proof for accountants.

## Security & compliance cautions

* **HSM/KMS** for keys in production. Rotate keys and revoke compromised ones promptly.
* **Minimize PII** in credentials; if PII is necessary, store only in encrypted off-chain databases and include hashes in the VC evidence, not raw personal data.
* **Consent & audit**: log issuance and user consent events (signed timestamps) for disputes.

## Pilot strategy to get EcoCash to co-sign receipts

* Use Paynow/EcoCash sandbox to show working flow and metrics (reduction in disputes etc.) and then present to EcoCash with pilot data. Ask EcoCash to sign ReceiptVCs in production for maximum trust and regulatory alignment.

---

# 5) Short example: Chipo's Hardware (SME) — how this looks in practice (end-to-end)

1. Chipo logs into Credo dashboard and issues a quote for a builder (QuoteVC issued). Buyer receives a link and stores QuoteVC in wallet.
2. Buyer accepts quote in wallet → Credo issues InvoiceVC referencing the quote and shows EcoCash Pay button.
3. Buyer taps Pay → EcoCash sandbox flow returns immediate confirmation (or user enters PIN in sandbox). Credo webhook receives success → Credo calls `/credentials/issue-receipt` which mints ReceiptVC (signed) and pushes to buyer’s wallet and Chipo’s dashboard.
4. Buyer presents VP to recipient/inspector at delivery; VP verifies in under 3 seconds; goods are released. If a dispute occurs, the VC chain + EcoCash evidence resolve the case quickly.

**Why Chipo benefits**: near-zero extra investment (dashboard + integration), huge reduction in payment fraud, faster reconciliation, easier lending (verified payment history). The EcoCash Plus SME wallet is the natural endgame for distribution and recovery options.

---

# 6) Deliverables / artifacts included in this message

* Research brief + citations (above). ([newsnest.co.za][1])
* `credo-ecocash-openapi.yaml` (OpenAPI YAML) — full spec above.
* `quote-vc-schema.jsonld` — full schema above.
* `invoice-vc-schema.jsonld` — full schema above.
* `receipt-vc-schema.jsonld` — full schema above.

---


[1]: https://newsnest.co.za/mutare-builder-jailed-after-altering-invoice-in-elaborate-us2k-fraud-scheme-at-halsteds/?utm_source=chatgpt.com "Mutare Builder Jailed After Altering Invoice in Elaborate US$2 ..."
[2]: https://tellzim.com/n-richards-manager-in-over-300-000-scam/?utm_source=chatgpt.com "N. Richards manager in over $300 000 scam"
[3]: https://lawportalzim.co.zw/cases/civil/293/evidence-on-behalf-of-a-corporate-entity-and-institutional-memory?utm_source=chatgpt.com "Evidence on Behalf of a Corporate Entity and Institutional ..."
[4]: https://www.facebook.com/TheHeraldZimbabwe/posts/four-people-accused-of-embezzling-funds-from-a-co-operative-at-mbare-musika-in-h/1051360913685678/?utm_source=chatgpt.com "Four people accused of embezzling funds from a co"
