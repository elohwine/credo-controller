# Problem Summary: Reporting Verification FK Failure

## Issue
The `scripts/verify-reporting.ts` script fails with `FOREIGN KEY constraint failed` when attempting to seed data for the Financial Reporting test.

## Error Detail
```
🚀 Starting Financial Reporting Verification...
1. Seeding Financial Data...
❌ Verification Failed: FOREIGN KEY constraint failed
```

## Context
- The script attempts to seed:
    1. `carts` (Revenue)
    2. `employees` (Seed data for expense FK)
    3. `payroll_runs` (Wages expense)
    4. `expense_claims` (Operations expense - **Failed Step**)

- **Root Cause Analysis**:
    - The `expense_claims` table has a Foreign Key to `employees(id)`.
    - Although the script inserts an employee before inserting the claim, the constraint still fails.
    - Speculation: 
        - The transaction might not be committed visible to the next statement immediately if using the same connection in a weird state (unlikely with synchronous `better-sqlite3`).
        - The `tenant_id` might be mismatched or the `employee_id` inserted doesn't exactly match the one being used (checked, seemed correct).
        - **Potential Hidden FK**: The `carts` insertion might also be triggering a missing `merchant_id` check if `carts` references specific merchant tables not seen in `006_create_carts.sql` (but `006` usually doesn't enforce merchant FK).
        - **Dirty State**: Despite `DELETE` statements, a `WAL` file or open connections might be locking/confusing the state.

## Tasks at Hand
1.  **Debug FK Violation**:
    -   Verify strict Schema for `carts`, `employees`, `payroll_runs`, `expense_claims`.
    -   Check if `carts` requires a `merchants` table entry (if migration 001/010 enforcement is stricter than thought).
    -   Isolate the failure: Run a script inserting ONLY the employee and then the claim.
2.  **Fix `verify-reporting.ts`**:
    -   Ensure all dependencies (Tenants, Merchants, Employees) are seeded.
3.  **Complete Phase 5**:
    -   Once seeded, verify `ReportingService` aggregates correctly.
    -   Verify `ReportingController` returns valid JSON and Offer URI.
