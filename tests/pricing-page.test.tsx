import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Pricing from "../src/pages/Pricing";

describe("pricing page", () => {
  test("monthly and annual views expose the exact customer contract from the catalog", () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Simple pricing, clear limits" }))
      .toBeTruthy();
    expect(screen.getAllByText("500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unlimited").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Included").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Custom CSS").length).toBeGreaterThan(0);
    expect(screen.queryByText(/custom widgets/i)).toBeNull();
    expect(screen.queryByText(/dedicated support/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Annual billing" }));
    expect(screen.getByText("$288 billed yearly")).toBeTruthy();
    expect(screen.getByText("$984 billed yearly")).toBeTruthy();
  });
});
