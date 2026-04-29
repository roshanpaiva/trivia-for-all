import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";

describe("Home", () => {
  it("renders the brand heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /trivia for all/i })).toBeInTheDocument();
  });

  it("renders the placeholder tagline", () => {
    render(<Home />);
    expect(screen.getByText(/90 seconds. as many as you can get/i)).toBeInTheDocument();
  });
});
