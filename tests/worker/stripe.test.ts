import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";

import { selectRecoveredCustomer } from "../../worker/lib/stripe";

function createCustomer(
  id: string,
  email?: string | null,
  metadata: Record<string, string> = {},
): Stripe.Customer {
  return {
    id,
    email: email ?? null,
    metadata,
  } as Stripe.Customer;
}

describe("selectRecoveredCustomer", () => {
  test("prefers metadata userId matches over email matches", () => {
    const customer = selectRecoveredCustomer(
      [
        createCustomer("cus_email", "owner@example.com"),
        createCustomer("cus_metadata", "owner@example.com", { userId: "user_123" }),
      ],
      "user_123",
      "owner@example.com",
    );

    expect(customer?.id).toBe("cus_metadata");
  });

  test("falls back to a single exact email match", () => {
    const customer = selectRecoveredCustomer(
      [createCustomer("cus_email", "owner@example.com")],
      "user_123",
      "owner@example.com",
    );

    expect(customer?.id).toBe("cus_email");
  });

  test("does not guess when multiple email-only customers exist", () => {
    const customer = selectRecoveredCustomer(
      [
        createCustomer("cus_one", "owner@example.com"),
        createCustomer("cus_two", "owner@example.com"),
      ],
      "user_123",
      "owner@example.com",
    );

    expect(customer).toBeNull();
  });
});
