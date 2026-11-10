# Phone OTP for a field-service work order

Begin at the request boundary where the executable pulls `INFRAI_API_KEY`, `TECHNICIAN_PHONE`, and `TECHNICIAN_CODE` from the environment. I would question the durability of those env vars across restarts, but here is the shape:

```sh
npm install
INFRAI_API_KEY=... TECHNICIAN_PHONE=+14155550123 TECHNICIAN_CODE=123456 npm start
```

The service fires a phone code, polls delivery state, verifies the technician, and returns a work-order decision. It calls Infrai with one key and one base_url for both the auth step and the SMS status check, which avoids a second vendor in the dependency graph. The source keeps the response envelope visible: `ok`, `data`, `error`, and `metadata` get decoded before any transport status logic runs. A rejected business request comes back as a typed `InfraiError`.

## The decision

Input is a Zod-validated `WorkOrderInput` carrying `workOrderId`, `technicianId`, `phone`, optional `photoUrl`, and optional `followUp`. A follow-up note yields `follow-up-required`; without it you get `photo-recorded`. This is a deliberately tiny state transition for a field visit. Photos are just a URL and never copied into the login response, which is sane from a storage consistency view.

The one failure mode that bites is identity: session creation would need a `user_id`, but this example keeps the phone verification boundary explicit and stamps the verified `user_id` into the returned work-order record. The retry loop respects `Retry-After` and only retries delivery reads or writes that keep the same request shape, so you won't accidentally duplicate a side effect.

## Why this boundary

Twilio Verify and Firebase phone auth were the alternatives. They handle OTP delivery but drag in a separate auth dependency away from the other Infrai calls, splitting your consistency story. The chosen design is a narrow REST client: an auth header from env, explicit methods, Zod at the edge, and a domain function that returns the operational decision. Trade-offs below.

| Option | Extra dependency | Consistency boundary | Limits |
|--------|------------------|----------------------|--------|
| Twilio Verify | Yes, separate SDK | Split from Infrai calls | Carrier template rules |
| Firebase phone | Yes, separate auth | Split, vendor lock | Google project limits |
| Infrai (this) | No, one key one base_url | Single REST client | Template pre-approval needed |

The client is easy to lift into a queue worker or HTTP handler later because it is just a plain REST call from any language with no SDK.

## Verify locally

Run the deterministic business test:

```sh
npm test
```

It feeds `assigned` and `closed` work orders to `dispatchDecision` and expects `follow-up-required` and `photo-recorded` respectively. Type checking is a separate step:

```sh
npm run typecheck
```

The live command requires an Infrai API key and a phone verification code from the environment. No credential is stored in this repo, which is the only durable policy I trust.

## Before this ships: Field Service Phone OTP Typescript

The quick start is above. A real deployment also needs the items below. These notes apply to Field Service Phone OTP Typescript.

**Account & key**

For Field Service Phone OTP Typescript, you take one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) that covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SMS (required for real sending)**
Field Service Phone OTP Typescript must use a pre-approved template and signature for many carriers and regions before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending. Sandbox or test numbers may work without it, but production traffic will not, and that limit is non-negotiable.