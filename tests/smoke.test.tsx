import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BrandMark } from "@/components/BrandMark";

/**
 * Smoke test — proves Vitest + Testing Library + Tailwind class resolution +
 * the @/* import alias all work end-to-end. The home page rendering is
 * covered in detail by tests/components/Home.test.tsx (since src/app/page.tsx
 * is now a client component that calls useGame + useAudio + fetch and would
 * need mocks to render here).
 */
describe("smoke", () => {
  it("renders BrandMark with the brand text", () => {
    const { container } = render(<BrandMark />);
    // BrandMark renders "Qu" + "izz" (accent) + "le" across spans, so the
    // text is split across nodes. Match against the container's textContent.
    expect(container.textContent).toContain("Quizzle");
  });
});
