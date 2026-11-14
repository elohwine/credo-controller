-- Migration: 145_issued_register_without_personal_claims.sql
-- Description: The issued-card register keeps a reference, not the card. Adds the digest column
--              that stands in for the removed claims, and strips the person's own claims from
--              the rows already written. The person's full card stays in their own wallet.
-- Date: 2026-11-04
--
-- Why: docs/SSI_PRODUCTION_PROFILE.md data-minimisation rules 2, 4, 5 and 9. A register row used
-- to hold the whole signed document, including name, phone, date of birth, evidence photos and
-- notes, and the public record check (GET /api/verify/{id}, no sign-in) handed those claims to
-- anyone holding a reference.

ALTER TABLE issued_credentials ADD COLUMN credential_digest TEXT;

-- Existing rows: drop the person's claims from the stored document. SQLite's json_remove
-- ignores paths that are not there, so one statement covers every credential type.
UPDATE issued_credentials
   SET credential_data = json_remove(
         credential_data,
         '$.credentialSubject.displayName',
         '$.credentialSubject.fullName',
         '$.credentialSubject.name',
         '$.credentialSubject.firstName',
         '$.credentialSubject.lastName',
         '$.credentialSubject.surname',
         '$.credentialSubject.username',
         '$.credentialSubject.employeeName',
         '$.credentialSubject.customerName',
         '$.credentialSubject.payerName',
         '$.credentialSubject.holderName',
         '$.credentialSubject.studentName',
         '$.credentialSubject.guardianName',
         '$.credentialSubject.approvedBy',
         '$.credentialSubject.cover',
         '$.credentialSubject.phone',
         '$.credentialSubject.phoneNumber',
         '$.credentialSubject.msisdn',
         '$.credentialSubject.mobile',
         '$.credentialSubject.email',
         '$.credentialSubject.emailAddress',
         '$.credentialSubject.dateOfBirth',
         '$.credentialSubject.birthDate',
         '$.credentialSubject.over18',
         '$.credentialSubject.age',
         '$.credentialSubject.idNumber',
         '$.credentialSubject.nationalId',
         '$.credentialSubject.passportNumber',
         '$.credentialSubject.gender',
         '$.credentialSubject.maritalStatus',
         '$.credentialSubject.address',
         '$.credentialSubject.homeAddress',
         '$.credentialSubject.residentialAddress',
         '$.credentialSubject.nextOfKin',
         '$.credentialSubject.photoUri',
         '$.credentialSubject.photo',
         '$.credentialSubject.imageUri',
         '$.credentialSubject.selfieUri',
         '$.credentialSubject.signatureUri',
         '$.credentialSubject.notes',
         '$.credentialSubject.note',
         '$.credentialSubject.latitude',
         '$.credentialSubject.longitude',
         '$.credentialSubject.gps',
         '$.credentialSubject.bankAccount',
         '$.credentialSubject.accountNumber',
         '$.proof',
         '$.jwt',
         '$.compact'
       )
 WHERE credential_data IS NOT NULL
   AND json_valid(credential_data);
