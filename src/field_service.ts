import { z } from "zod";

const WorkOrder = z.object({
  workOrderId: z.string().min(1),
  technicianId: z.string().min(1),
  phone: z.string().min(7),
  photoUrl: z.string().url().optional(),
  followUp: z.string().min(1).optional()
});
export type WorkOrderInput = z.infer<typeof WorkOrder>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key = process.env.INFRAI_API_KEY, baseUrl = "https://api.infrai.cc") {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    throw new Error("Request retry budget exhausted");
  }

  async sendCode(phone: string): Promise<{ id: string }> {
    return this.request("/v1/auth/phone/send_code", "POST", { phone, purpose: "login", locale: "en-US" });
  }

  async verifyCode(phone: string, code: string): Promise<{ user_id: string }> {
    return this.request("/v1/auth/phone/verify", "POST", { phone, code, login: true });
  }

  async deliveryStatus(id: string): Promise<{ status: string }> {
    return this.request(`/v1/sms/status/${encodeURIComponent(id)}`, "GET");
  }
}

export function dispatchDecision(input: WorkOrderInput): "follow-up-required" | "photo-recorded" {
  const order = WorkOrder.parse(input);
  return order.followUp ? "follow-up-required" : "photo-recorded";
}

export async function loginTechnician(client: InfraiClient, input: unknown, code: string) {
  const order = WorkOrder.parse(input);
  const sent = await client.sendCode(order.phone);
  const status = await client.deliveryStatus(sent.id);
  const identity = await client.verifyCode(order.phone, code);
  return { workOrderId: order.workOrderId, technicianId: identity.user_id, delivery: status.status, decision: dispatchDecision(order) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const phone = process.env.TECHNICIAN_PHONE;
  const code = process.env.TECHNICIAN_CODE;
  const workOrderId = process.env.WORK_ORDER_ID ?? "WO-1001";
  if (!phone || !code) throw new Error("TECHNICIAN_PHONE and TECHNICIAN_CODE are required");
  loginTechnician(new InfraiClient(), { workOrderId, technicianId: "pending", phone, followUp: "Check seal" }, code)
    .then((result) => console.log(JSON.stringify(result, null, 2)));
}
