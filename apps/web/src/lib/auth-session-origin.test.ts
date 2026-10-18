import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("lets a signed-in browser join through the API origin that owns its session cookie", async () => {
  const apiOrigin = "http://127.0.0.1:3100";
  const cookieOrigins = new Set<string>();
  vi.stubEnv("NEXT_PUBLIC_SERVER_URL", apiOrigin);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const requestUrl = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin,
    );
    if (requestUrl.pathname.endsWith("/sign-in/email")) cookieOrigins.add(requestUrl.origin);
    return Response.json({
      token: "test-session",
      user: { id: "test-user", email: "test@example.com" },
    });
  });
  vi.resetModules();

  const [{ authClient }, { communitiesApi }, { httpClient }] = await Promise.all([
    import("./auth-client"),
    import("./communities-api"),
    import("./http-client"),
  ]);
  httpClient.defaults.adapter = async (config) => {
    const requestUrl = new URL(config.url ?? "", config.baseURL ?? apiOrigin);
    const response = {
      data: { joined: true, alreadyMember: false },
      status: cookieOrigins.has(requestUrl.origin) ? 200 : 401,
      statusText: cookieOrigins.has(requestUrl.origin) ? "OK" : "Unauthorized",
      headers: new AxiosHeaders(),
      config,
      request: {},
    };
    if (response.status === 401) {
      throw new AxiosError(
        "Request failed with status code 401",
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response,
      );
    }
    return response;
  };

  await authClient.signIn.email({ email: "test@example.com", password: "test-password" });
  await expect(communitiesApi.joinCommunity("cookie-test", "TESTCODE2026")).resolves.toMatchObject({
    joined: true,
  });
});
