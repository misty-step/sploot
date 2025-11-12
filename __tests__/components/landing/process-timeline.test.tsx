import { act, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessTimeline } from "@/components/landing/process-timeline";

const titles = ["upload", "ai analyzes", "search & find"];
let intersectionCallback: IntersectionObserverCallback | null = null;

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  intersectionCallback = null;
});

function triggerIntersection() {
  act(() => {
    intersectionCallback?.(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });
}

describe("ProcessTimeline", () => {
  it("renders all process steps with the correct copy", () => {
    render(<ProcessTimeline />);

    titles.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    expect(
      screen.getByText("drag and drop your memes. we'll handle the rest."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("clip embeddings capture semantic meaning of every image."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("type what you remember, get what you need instantly."),
    ).toBeInTheDocument();
  });

  it("renders process icons for each step", () => {
    const { container } = render(<ProcessTimeline />);
    const icons = container.querySelectorAll("svg");

    expect(icons).toHaveLength(3);
    icons.forEach((icon) => {
      expect(icon.getAttribute("viewBox")).toBe("0 0 120 120");
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("applies responsive layout classes to the wrapper", () => {
    const { container } = render(<ProcessTimeline />);
    const wrapper = container.firstElementChild as HTMLElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("flex");
    expect(wrapper?.className).toContain("flex-col");
    expect(wrapper?.className).toContain("md:flex-row");
  });

  it("only shows connecting lines on desktop breakpoints", () => {
    const { container } = render(<ProcessTimeline />);
    const connectors = container.querySelectorAll("[data-connector]");

    expect(connectors).toHaveLength(2);
    connectors.forEach((connector) => {
      expect(connector.className).toContain("hidden");
      expect(connector.className).toContain("md:flex");
    });
  });

  it("fades steps into view with staggered delays when intersecting", () => {
    render(<ProcessTimeline />);
    const articlesBefore = screen.getAllByRole("article");

    articlesBefore.forEach((article) => {
      expect(article.className).toContain("opacity-0");
      expect(article.className).toContain("translate-y-6");
    });

    triggerIntersection();

    const articlesAfter = screen.getAllByRole("article");
    articlesAfter.forEach((article, index) => {
      expect(article.className).toContain("opacity-100");
      expect(article.className).toContain("translate-y-0");
      expect(article.style.transitionDelay).toBe(`${index * 150}ms`);
    });
  });
});
