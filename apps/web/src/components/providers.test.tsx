// @vitest-environment-options {"url":"https://andes-hack-web-diego.diegorafaelcisnerostafur.workers.dev/"}
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Providers from "./providers";

const domain = "andes-hack-web-diego.diegorafaelcisnerostafur.workers.dev";
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  window.fetch = fetchMock;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("analytics provider", () => {
  it("sends an automatic pageview for the registered site domain", async () => {
    const firstRender = render(
      <Providers>
        <p>Te Jalo</p>
      </Providers>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(payload).toMatchObject({
      d: domain,
      n: "pageview",
      u: `https://${domain}/`,
    });

    const tracker = Object.getOwnPropertyDescriptor(window, "plausible")?.value;
    firstRender.unmount();

    expect(() =>
      render(
        <Providers>
          <p>Te Jalo</p>
        </Providers>,
      ),
    ).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(window, "plausible")?.value).toBe(tracker);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
