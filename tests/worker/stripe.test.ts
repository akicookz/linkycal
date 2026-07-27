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
  test("selects recovered customers by the complete precedence policy", () => {
    const cases = [
      {
        name: "metadata userId beats email",
        customers: [
          createCustomer("cus_email", "owner@example.com"),
          createCustomer("cus_metadata", "owner@example.com", {
            userId: "user_123",
          }),
        ],
        expectedId: "cus_metadata",
      },
      {
        name: "one exact email is the fallback",
        customers: [createCustomer("cus_email", "owner@example.com")],
        expectedId: "cus_email",
      },
      {
        name: "multiple email-only customers are ambiguous",
        customers: [
          createCustomer("cus_one", "owner@example.com"),
          createCustomer("cus_two", "owner@example.com"),
        ],
        expectedId: null,
      },
    ];

    for (const { name, customers, expectedId } of cases) {
      expect([
        name,
        selectRecoveredCustomer(
            customers,
            "user_123",
            "owner@example.com",
          )?.id ?? null,
      ]).toEqual([name, expectedId]);
    }
  });
});
