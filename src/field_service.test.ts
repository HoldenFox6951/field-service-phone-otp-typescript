import assert from "node:assert/strict";
import { dispatchDecision } from "./field_service.ts";

const assigned = { workOrderId: "WO-7", technicianId: "tech-2", phone: "+14155550123", photoUrl: "https://example.test/photo.jpg", followUp: "Return with replacement seal" };
const closed = { workOrderId: "WO-8", technicianId: "tech-3", phone: "+14155550124", photoUrl: "https://example.test/photo.jpg" };
assert.equal(dispatchDecision(assigned), "follow-up-required");
assert.equal(dispatchDecision(closed), "photo-recorded");
console.log("dispatch decision test passed");
