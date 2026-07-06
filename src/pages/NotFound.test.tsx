import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "@/pages/NotFound";

describe("NotFound", () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <NotFound />
      </MemoryRouter>,
    );

  it("renders the 404 heading", () => {
    renderAt("/does-not-exist");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/route not found/i);
    expect(heading).toHaveTextContent(/404/i);
  });

  it("renders an accessible SPA link back to home", () => {
    renderAt("/does-not-exist");
    const link = screen.getByRole("link", { name: /return to base/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("shows the unregistered path", () => {
    renderAt("/ghost/route");
    expect(screen.getByText("/ghost/route")).toBeInTheDocument();
  });
});
