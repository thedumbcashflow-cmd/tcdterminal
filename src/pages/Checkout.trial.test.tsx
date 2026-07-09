import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Capture navigation
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

// Fake authed user
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user-1" }, loading: false }),
}));

// Mock supabase client used inside Checkout
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

// Capture PayPal button callbacks
let capturedOnApprove: ((data: { orderID: string }) => Promise<void>) | null = null;
let capturedCreateOrder: (() => Promise<string>) | null = null;

beforeEach(() => {
  navigateMock.mockReset();
  capturedOnApprove = null;
  capturedCreateOrder = null;

  // Inject a fake PayPal SDK so loadPayPalSdk short-circuits
  (window as any).paypal = {
    Buttons: (cfg: any) => {
      capturedOnApprove = cfg.onApprove;
      capturedCreateOrder = cfg.createOrder;
      return { render: (_el: HTMLElement) => Promise.resolve() };
    },
  };

  // Mock fetch: create-checkout returns order_id, payment-webhook returns success
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/functions/v1/create-checkout")) {
        return new Response(JSON.stringify({ order_id: "ORDER-TEST-123" }), { status: 200 });
      }
      if (u.includes("/functions/v1/payment-webhook")) {
        return new Response(
          JSON.stringify({
            success: true,
            request_id: "req-abc",
            trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).paypal;
  vi.useRealTimers();
});

describe("Checkout — 7-day trial flow (mocked PayPal + webhook)", () => {
  it("activates trial and redirects to /dashboard?trial=started", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: Checkout } = await import("./Checkout");

    render(
      <MemoryRouter initialEntries={["/checkout?plan=trial&period=monthly"]}>
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for PayPal Buttons render to have captured the callbacks
    await waitFor(() => expect(capturedOnApprove).not.toBeNull());
    expect(capturedCreateOrder).not.toBeNull();

    // createOrder should hit create-checkout and return the order id
    const orderId = await capturedCreateOrder!();
    expect(orderId).toBe("ORDER-TEST-123");

    // Simulate PayPal approval
    await act(async () => {
      await capturedOnApprove!({ orderID: "ORDER-TEST-123" });
    });

    // Verify webhook was called with paypal.trial event
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const webhookCall = calls.find((c) => String(c[0]).includes("/functions/v1/payment-webhook"));
    expect(webhookCall).toBeDefined();
    const body = JSON.parse(webhookCall![1].body as string);
    expect(body).toMatchObject({
      event: "paypal.trial",
      order_id: "ORDER-TEST-123",
      plan: "trial",
      period: "monthly",
    });

    // Advance the 2s success delay
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(navigateMock).toHaveBeenCalledWith("/dashboard?trial=started");
  });

  it("does NOT redirect when webhook reports failure", async () => {
    // Override fetch: webhook returns { success: false }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/functions/v1/create-checkout")) {
          return new Response(JSON.stringify({ order_id: "ORDER-FAIL-1" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ success: false, code: "paypal_authorize_not_completed", error: "denied" }),
          { status: 400 },
        );
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: Checkout } = await import("./Checkout");

    render(
      <MemoryRouter initialEntries={["/checkout?plan=trial&period=monthly"]}>
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(capturedOnApprove).not.toBeNull());
    await act(async () => {
      await capturedOnApprove!({ orderID: "ORDER-FAIL-1" });
      vi.advanceTimersByTime(2500);
    });

    expect(navigateMock).not.toHaveBeenCalledWith("/dashboard?trial=started");
  });
});
