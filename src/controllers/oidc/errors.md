····schemaManagerContractAddress,⏎····walletConfig,⏎····autoAcceptConnections,⏎····autoAcceptCredentials,⏎····autoAcceptProofs,⏎····walletScheme,⏎····apiKey,⏎····updateJwtSecret,⏎····tenancy,⏎····...afjConfig⏎·` prettier/prettier
  124:1   error    Insert`··` prettier/prettier
132:76 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/controllers/agent/AgentController.ts
181:72 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/controllers/anoncreds/cred-def/CredentialDefinitionController.ts
33:3 error Insert `····` prettier/prettier
34:1 error Insert `····` prettier/prettier
62:3 error Insert `····` prettier/prettier
63:1 error Insert `····` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/anoncreds/endorser-transaction/EndorserTransactionController.ts
97:1 error Delete `····` prettier/prettier
135:1 error Delete `····` prettier/prettier
136:76 error Delete `··` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/anoncreds/schema/SchemaController.ts
31:3 error Insert `····` prettier/prettier
32:1 error Insert `····` prettier/prettier
51:3 error Insert `····` prettier/prettier
52:1 error Insert `····` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/did/DidExpansionController.ts
1:1 error There should be at least one empty line between import groups import/order
2:1 error There should be at least one empty line between import groups import/order
2:1 error `express` type import should occur before import of `tsoa` import/order
3:1 error `@credo-ts/core` import should occur before import of `tsoa` import/order
4:1 error `bs58` import should occur before import of `tsoa` import/order
5:1 error `jose` import should occur before import of `tsoa` import/order
6:1 error There should be at least one empty line between import groups import/order
6:1 error `axios` import should occur before import of `tsoa` import/order
7:1 error There should be at least one empty line between import groups import/order
8:1 error `../../types/api` type import should occur before import of `tsoa` import/order
11:32 error Replace `·keyType?:·'Ed25519'·` with `⏎··keyType?:·'Ed25519'⏎` prettier/prettier
34:29 error Replace `@Request()·request:·ExRequest,·@Body()·body:·CreateDidKeyRequest` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·CreateDidKeyRequest,⏎··` prettier/prettier
35:1 error Replace `··` with `····` prettier/prettier
51:56 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
53:3 error Insert `··` prettier/prettier
54:3 error Replace `didStore.save({·did,·method:·'key',·keyRef,·createdAt,·type:·'key',·didDocument:·didDocumentJson,·publicKeyBase58,·keyType:·'Ed25519'` with `··didStore.save({⏎······did,⏎······method:·'key',⏎······keyRef,⏎······createdAt,⏎······type:·'key',⏎······didDocument:·didDocumentJson,⏎······publicKeyBase58,⏎······keyType:·'Ed25519',⏎···` prettier/prettier
55:1 error Insert `··` prettier/prettier
56:1 error Insert `··` prettier/prettier
62:29 error Replace `@Request()·request:·ExRequest,·@Body()·body:·CreateDidJwkRequest` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·CreateDidJwkRequest,⏎··` prettier/prettier
63:1 error Insert `··` prettier/prettier
96:48 error Replace `.sort().reduce((acc:·any,·k)·=>·{·acc[k]·=·(publicJwk·as·any)[k];·return·acc` with `⏎······.sort()⏎······.reduce((acc:·any,·k)·=>·{⏎········acc[k]·=·(publicJwk·as·any)[k]⏎········return·acc⏎·····` prettier/prettier
96:69 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
96:105 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
115:3 error Insert `··` prettier/prettier
116:3 error Insert `··` prettier/prettier
117:1 error Replace `··` with `····` prettier/prettier
118:1 error Insert `··` prettier/prettier
119:1 error Insert `··` prettier/prettier
120:3 error Replace `didStore.save({·did,·method:·'jwk',·keyRef,·createdAt,·type:·'jwk',·didDocument,·publicKeyBase58,·keyType:·desired` with `··didStore.save({⏎······did,⏎······method:·'jwk',⏎······keyRef,⏎······createdAt,⏎······type:·'jwk',⏎······didDocument,⏎······publicKeyBase58,⏎······keyType:·desired,⏎···` prettier/prettier
121:1 error Insert `··` prettier/prettier
122:1 error Insert `··` prettier/prettier
131:30 error Replace `@Request()·request:·ExRequest,·@Body()·body:·PrepareDidWebRequest` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·PrepareDidWebRequest,⏎··` prettier/prettier
132:1 error Insert `··` prettier/prettier
150:29 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
173:11 error Delete `··` prettier/prettier
174:11 error Delete `··` prettier/prettier
175:1 error Delete `··` prettier/prettier
176:13 error Delete `··` prettier/prettier
177:1 error Delete `··` prettier/prettier
178:1 error Delete `··` prettier/prettier
179:1 error Delete `··` prettier/prettier
213:3 error Insert `··` prettier/prettier
215:56 error Delete `·` prettier/prettier
220:3 error Insert `··` prettier/prettier
221:1 error Insert `··` prettier/prettier
222:1 error Insert `··` prettier/prettier
223:3 error Insert `··` prettier/prettier
224:3 error Insert `··` prettier/prettier
225:1 error Insert `··` prettier/prettier
231:42 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
238:71 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
239:24 error Replace `.trim().toLowerCase().replace(/^https?:\/\//,·'')` with `⏎······.trim()⏎······.toLowerCase()⏎······.replace(/^https?:\/\//,·'')⏎······` prettier/prettier
248:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/controllers/didcomm/credentials/CredentialController.ts
1:14 error Replace `·CredentialExchangeRecordProps,·CredentialProtocolVersionType,·PeerDidNumAlgo2CreateOptions,·Routing·` with `⏎··CredentialExchangeRecordProps,⏎··CredentialProtocolVersionType,⏎··PeerDidNumAlgo2CreateOptions,⏎··Routing,⏎` prettier/prettier
58:3 error Insert `····` prettier/prettier
59:1 error Insert `····` prettier/prettier
101:1 error Insert `····` prettier/prettier
118:3 error Insert `····` prettier/prettier
119:1 error Insert `····` prettier/prettier
140:3 error Insert `····` prettier/prettier
141:1 error Insert `····` prettier/prettier
158:3 error Insert `····` prettier/prettier
159:3 error Insert `····` prettier/prettier
194:1 error Insert `····` prettier/prettier
194:44 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
239:3 error Insert `····` prettier/prettier
240:1 error Insert `····` prettier/prettier
241:1 error Insert `····` prettier/prettier
262:1 error Insert `····` prettier/prettier
263:3 error Insert `····` prettier/prettier
280:3 error Insert `····` prettier/prettier
281:3 error Insert `····` prettier/prettier
296:3 error Insert `····` prettier/prettier
297:1 error Insert `····` prettier/prettier
304:1 error Insert `··` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/didcomm/question-answer/QuestionAnswerController.ts
42:3 error Insert `····` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/examples.ts
269:22 error Replace `'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH#z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'` with `⏎······'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH#z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',⏎····` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/multi-tenancy/MultiTenancyController.ts
22:3 error Insert `····` prettier/prettier
22:51 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
42:1 error Insert `····` prettier/prettier
42:51 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
82:3 error Insert `····` prettier/prettier
82:51 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
103:1 error Insert `····` prettier/prettier
103:51 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
116:42 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/controllers/oidc/OidcIssuerController.ts
1:1 error There should be at least one empty line between import groups import/order
2:1 error There should be at least one empty line between import groups import/order
2:1 error `express` type import should occur before import of `tsoa` import/order
3:1 error `@credo-ts/core` import should occur before import of `tsoa` import/order
4:1 error There should be at least one empty line between import groups import/order
4:1 error `crypto` import should occur before import of `tsoa` import/order
6:1 error `../../utils/didStore` import should occur before import of `../../utils/store` import/order
7:1 error There should be at least one empty line between import groups import/order
7:1 error `../../utils/schemaStore` import should occur before import of `../../utils/store` import/order
8:1 error `../../types/api` type import should occur before import of `tsoa` import/order
8:14 error Replace `·CreateCredentialOfferRequest,·CreateCredentialOfferResponse,·TokenRequestBody,·TokenResponseBody,·IssuedCredentialRecord·` with `⏎··CreateCredentialOfferRequest,⏎··CreateCredentialOfferResponse,⏎··TokenRequestBody,⏎··TokenResponseBody,⏎··IssuedCredentialRecord,⏎` prettier/prettier
37:38 error Replace `@Request()·request:·ExRequest,·@Body()·body:·CreateCredentialOfferRequest` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·CreateCredentialOfferRequest,⏎··` prettier/prettier
52:1 error Replace `··` with `····` prettier/prettier
53:3 error Insert `··` prettier/prettier
54:1 error Insert `··` prettier/prettier
66:3 error Insert `··` prettier/prettier
67:1 error Replace `··` with `····` prettier/prettier
71:1 error Insert `··` prettier/prettier
77:1 error Insert `··` prettier/prettier
79:3 error Insert `··` prettier/prettier
81:1 error Insert `··` prettier/prettier
82:3 error Insert `··` prettier/prettier
83:1 error Insert `··` prettier/prettier
85:40 error Replace `r` with `(r)` prettier/prettier
98:70 error Replace `(errors?.map(e·=>·e.message).join(';·')` with `errors?.map((e)·=>·e.message).join(';·'` prettier/prettier
103:3 error Insert `··` prettier/prettier
104:1 error Insert `··` prettier/prettier
122:42 error Replace `r` with `(r)` prettier/prettier
139:1 error Replace `··` with `····` prettier/prettier
144:3 error Replace `const·record:·IssuedCredentialRecord·=·{·id:·vcId,·jwt,·subject:·body.subject_did,·issuer:·payload.iss,·createdAt:·new·Date().toISOString(),·revoked:·false,·schemaId:·credTmpl?.schemaId` with `··const·record:·IssuedCredentialRecord·=·{⏎······id:·vcId,⏎······jwt,⏎······subject:·body.subject_did,⏎······issuer:·payload.iss,⏎······createdAt:·new·Date().toISOString(),⏎······revoked:·false,⏎······schemaId:·credTmpl?.schemaId,⏎···` prettier/prettier
145:1 error Replace `··` with `····` prettier/prettier
146:3 error Replace `request.logger?.info({·module:·'issuer',·operation:·'issue',·credentialId:·vcId,·issuerDid,·subject:·body.subject_did·},·'Issued·credential'` with `··request.logger?.info(⏎······{·module:·'issuer',·operation:·'issue',·credentialId:·vcId,·issuerDid,·subject:·body.subject_did·},⏎······'Issued·credential',⏎····` prettier/prettier
147:1 error Insert `··` prettier/prettier
153:59 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
165:93 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
181:94 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
182:48 error Replace `rec` with `(rec)` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/oidc/OidcVerifierController.ts
1:1 error There should be at least one empty line between import groups import/order
2:1 error There should be at least one empty line between import groups import/order
2:1 error `express` type import should occur before import of `tsoa` import/order
3:1 error There should be at least one empty line between import groups import/order
3:1 error `crypto` import should occur before import of `tsoa` import/order
5:1 error There should be at least one empty line between import groups import/order
5:1 error `../../utils/schemaStore` import should occur before import of `../../utils/store` import/order
6:1 error `../../types/api` type import should occur before import of `tsoa` import/order
38:42 error Replace `@Request()·request:·ExRequest,·@Body()·body:·CreatePresentationRequestBody` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·CreatePresentationRequestBody,⏎··` prettier/prettier
40:44 error Replace `·id:·requestId,·definition:·body?.presentationDefinition,·createdAt:·Date.now()` with `⏎······id:·requestId,⏎······definition:·body?.presentationDefinition,⏎······createdAt:·Date.now(),⏎···` prettier/prettier
42:1 error Insert `··` prettier/prettier
43:1 error Insert `··` prettier/prettier
51:35 error Replace `@Request()·request:·ExRequest,·@Body()·body:·VerifyPresentationRequestBody` with `⏎····@Request()·request:·ExRequest,⏎····@Body()·body:·VerifyPresentationRequestBody,⏎··` prettier/prettier
63:18 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
65:27 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
81:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
82:29 error Replace `{·module:·'verifier',·operation:·'verifyPresentation',·error:·e.message·},·'Verification·failed:·malformed·presentation'` with `⏎········{·module:·'verifier',·operation:·'verifyPresentation',·error:·e.message·},⏎········'Verification·failed:·malformed·presentation',⏎······` prettier/prettier
86:28 error Replace `{·module:·'verifier',·operation:·'verifyPresentation',·requestId:·body.requestId·},·'Verification·failed:·credential·revoked'` with `⏎········{·module:·'verifier',·operation:·'verifyPresentation',·requestId:·body.requestId·},⏎········'Verification·failed:·credential·revoked',⏎······` prettier/prettier
89:26 error Replace `{·module:·'verifier',·operation:·'verifyPresentation',·requestId:·body.requestId·},·'Verification·success·(placeholder·only)'` with `⏎······{·module:·'verifier',·operation:·'verifyPresentation',·requestId:·body.requestId·},⏎······'Verification·success·(placeholder·only)',⏎····` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/schemas/SchemaRegistryController.ts
2:1 error There should be at least one empty line between import groups import/order
2:1 error `crypto` import should occur before import of `tsoa` import/order
31:3 error Insert `··` prettier/prettier
38:1 error Insert `··` prettier/prettier

/home/eloh/MINE/credo-controller/src/controllers/types.ts
125:12 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
131:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
145:22 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
154:22 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
232:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
243:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
252:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
269:10 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
302:13 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
395:15 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
397:22 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
408:10 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
415:22 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/enums/enum.ts
20:26 error Insert `}` prettier/prettier
21:1 error Replace `··//·Future·blockchain·networks·can·be·added·here⏎}` with `//·Future·blockchain·networks·can·be·added·here` prettier/prettier
27:22 error Insert `}` prettier/prettier
28:1 error Delete `··` prettier/prettier
29:1 error Replace `··//·Example:·Hyperledger_Fabric_Channel1·=·'fabric:channel1'⏎}` with `//·Example:·Hyperledger_Fabric_Channel1·=·'fabric:channel1'` prettier/prettier

/home/eloh/MINE/credo-controller/src/errorHandlingService.ts
24:3 error Insert `····` prettier/prettier

/home/eloh/MINE/credo-controller/src/events/ProofEvents.ts
12:77 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/events/WebhookEvent.ts
23:19 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/middleware/correlation.ts
1:1 error There should be at least one empty line between import groups import/order
2:1 error There should be at least one empty line between import groups import/order

/home/eloh/MINE/credo-controller/src/server.ts
10:1 error `@credo-ts/tenants/build/TenantAgent` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
11:1 error `body-parser` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
12:1 error `cors` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
13:1 error `dotenv` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
14:1 error `express` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
15:1 error `express-rate-limit` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
16:1 error `fs` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
17:1 error `swagger-ui-express` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
18:1 error `tsoa` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
19:1 error `tsyringe` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
21:1 error There should be at least one empty line between import groups import/order
21:1 error `./authentication` import should occur after import of `@credo-ts/core/build/utils/uuid` import/order
22:1 error There should be at least one empty line between import groups import/order
23:1 error `./utils/requestContext` import should occur after import of `./securityMiddleware` import/order
24:1 error `./utils/pinoLogger` import should occur after import of `./securityMiddleware` import/order
38:35 error Replace `⏎··agent:·Agent,⏎··config:·ServerConfig,⏎··apiKey?:·string,⏎` with `agent:·Agent,·config:·ServerConfig,·apiKey?:·string` prettier/prettier
74:21 error Insert `⏎·····` prettier/prettier
79:14 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
109:3 error Insert `··` prettier/prettier
110:1 error Insert `··` prettier/prettier
124:3 error Replace `agent.config.logger.warn(`Caught·Validation·Error·for·${req.path}:`,·{·fields:·err.fields,·correlationId:·req.correlationId` with `····agent.config.logger.warn(`Caught·Validation·Error·for·${req.path}:`,·{⏎········fields:·err.fields,⏎········correlationId:·req.correlationId,⏎·····` prettier/prettier
130:1 error Insert `····` prettier/prettier
136:1 error Insert `····` prettier/prettier
143:1 error Insert `····` prettier/prettier

/home/eloh/MINE/credo-controller/src/tracer.ts
3:1 warning Do not use "@ts-nocheck" because it alters compilation errors @typescript-eslint/ban-ts-comment

/home/eloh/MINE/credo-controller/src/types/api.ts
29:16 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
35:39 error Replace `·keyType:·'P-256'·|·'Ed25519'·` with `⏎··keyType:·'P-256'·|·'Ed25519'⏎` prettier/prettier
37:40 error Replace `·domain:·string;·keyMethod?:·'jwk'·|·'key';·keyType?:·'Ed25519'·|·'P-256'·` with `⏎··domain:·string⏎··keyMethod?:·'jwk'·|·'key'⏎··keyType?:·'Ed25519'·|·'P-256'⏎` prettier/prettier
41:45 error Replace `·name:·string;·version:·string;·jsonSchema:·Record<string,·any>·` with `⏎··name:·string⏎··version:·string⏎··jsonSchema:·Record<string,·any>⏎` prettier/prettier
41:104 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
49:20 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
97:49 error Replace `·presentationDefinition?:·any·` with `⏎··presentationDefinition?:·any⏎` prettier/prettier
97:75 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
100:53 error Replace `·requestId:·string;·presentation_request_url:·string·` with `⏎··requestId:·string⏎··presentation_request_url:·string⏎` prettier/prettier
103:49 error Replace `·requestId:·string;·verifiablePresentation:·string·` with `⏎··requestId:·string⏎··verifiablePresentation:·string⏎` prettier/prettier
106:46 error Replace `·verified:·boolean;·reason?:·string;·schemaValidation?:·any;·presentation?:·any;·error?:·string·` with `⏎··verified:·boolean⏎··reason?:·string⏎··schemaValidation?:·any⏎··presentation?:·any⏎··error?:·string⏎` prettier/prettier
106:102 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
106:122 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/utils/didStore.ts
7:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
16:3 error Missing accessibility modifier on method definition save @typescript-eslint/explicit-member-accessibility
20:3 error Missing accessibility modifier on method definition list @typescript-eslint/explicit-member-accessibility
24:3 error Missing accessibility modifier on method definition find @typescript-eslint/explicit-member-accessibility
25:30 error Replace `r` with `(r)` prettier/prettier
29:47 error Insert `⏎` prettier/prettier

/home/eloh/MINE/credo-controller/src/utils/kms.ts
2:1 error Imports "JWK" are only used as type @typescript-eslint/consistent-type-imports
9:15 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
16:3 error Missing accessibility modifier on method definition storeEd25519PrivateKey @typescript-eslint/explicit-member-accessibility
23:3 error Missing accessibility modifier on method definition storeJwkPrivateKey @typescript-eslint/explicit-member-accessibility
23:27 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
35:3 error Missing accessibility modifier on method definition storePrivateJwkWithId @typescript-eslint/explicit-member-accessibility
35:42 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
41:3 error Missing accessibility modifier on method definition primaryKeyRef @typescript-eslint/explicit-member-accessibility
41:40 error Replace `·return·this.primary` with `⏎····return·this.primary⏎·` prettier/prettier
43:3 error Missing accessibility modifier on method definition signDetached @typescript-eslint/explicit-member-accessibility
51:3 error Missing accessibility modifier on method definition getPrivateJwk @typescript-eslint/explicit-member-accessibility
63:3 error Missing accessibility modifier on method definition signJwtWithJwk @typescript-eslint/explicit-member-accessibility
63:24 error Replace `keyRef:·string,·payload:·Record<string,·any>,·protectedHeader:·Partial<{·alg:·string;·kid:·string;·typ:·string·}>` with `⏎····keyRef:·string,⏎····payload:·Record<string,·any>,⏎····protectedHeader:·Partial<{·alg:·string;·kid:·string;·typ:·string·}>,⏎··` prettier/prettier
63:64 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
69:40 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
70:44 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
74:44 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
75:41 error Replace `⏎······.setProtectedHeader({·alg,·...(protectedHeader.kid·?·{·kid:·protectedHeader.kid·}·:·{}),·typ:·protectedHeader.typ·||·'JWT'` with `.setProtectedHeader({⏎······alg,⏎······...(protectedHeader.kid·?·{·kid:·protectedHeader.kid·}·:·{}),⏎······typ:·protectedHeader.typ·||·'JWT',⏎···` prettier/prettier

/home/eloh/MINE/credo-controller/src/utils/logger.ts
4:1 error There should be at least one empty line between import groups import/order
5:1 error There should be at least one empty line between import groups import/order
5:1 error `./pinoLogger` import should occur after import of `../tracer` import/order
8:1 error There should be at least one empty line between import groups import/order
57:27 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
121:3 error Insert `··` prettier/prettier
122:1 error Insert `··` prettier/prettier
126:5 error Insert `····` prettier/prettier
127:1 error Insert `····` prettier/prettier
133:54 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
137:55 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
141:55 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
145:54 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
149:54 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
153:55 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
157:55 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/utils/schemaStore.ts
1:1 error Imports "ErrorObject" are only used as type @typescript-eslint/consistent-type-imports
6:30 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
18:3 error Missing accessibility modifier on method definition register @typescript-eslint/explicit-member-accessibility
21:17 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
24:40 error Replace `s` with `(s)` prettier/prettier
37:3 error Missing accessibility modifier on method definition list @typescript-eslint/explicit-member-accessibility
37:11 error Replace `·return·[...this.schemas]` with `⏎····return·[...this.schemas]⏎·` prettier/prettier
38:3 error Missing accessibility modifier on method definition get @typescript-eslint/explicit-member-accessibility
38:26 error Replace `·return·this.schemas.find(s·=>·s.schemaId·===·schemaId)` with `⏎····return·this.schemas.find((s)·=>·s.schemaId·===·schemaId)⏎·` prettier/prettier
39:3 error Missing accessibility modifier on method definition find @typescript-eslint/explicit-member-accessibility
39:40 error Replace `·return·this.schemas.find(s·=>·s.name·===·name·&&·s.version·===·version)` with `⏎····return·this.schemas.find((s)·=>·s.name·===·name·&&·s.version·===·version)⏎·` prettier/prettier
41:3 error Missing accessibility modifier on method definition validate @typescript-eslint/explicit-member-accessibility
41:36 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
43:17 error Replace `·return·{·valid:·false,·errors:·[{·keyword:·'notFound',·instancePath:·'',·schemaPath:·'',·params:·{},·message:·'schema·not·found'·}]·as·any` with `⏎······return·{⏎········valid:·false,⏎········errors:·[⏎··········{·keyword:·'notFound',·instancePath:·'',·schemaPath:·'',·params:·{},·message:·'schema·not·found'·},⏎········]·as·any,⏎·····` prettier/prettier
43:153 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/utils/store.ts
3:51 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
4:44 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
5:55 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

/home/eloh/MINE/credo-controller/src/utils/tsyringeTsoaIocContainer.ts
6:24 warning Unexpected any. Specify a different type @typescript-eslint/no-explicit-any

✖ 310 problems (231 errors, 79 warnings)
214 errors and 3 warnings potentially fixable with the `--fix` option.

error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
next steps
Cryptographic verification in the verifier (JWS, nonce/aud checks) using Credo services.
Optional: unify correlation-id middleware by using correlation.ts in server.ts.
Add backup/restore scaffolding when you’re ready.
If you want me to unify the correlation middleware now, I can wire it in and remove the duplicate inline handler.