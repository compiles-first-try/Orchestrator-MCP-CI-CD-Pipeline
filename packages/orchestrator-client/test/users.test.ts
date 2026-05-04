import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestClient } from "../src/rest-client.js";
import { UsersClient } from "../src/users.js";
import { jsonResponse, stubTokenSource } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/o/t/orchestrator_";

const SAMPLE_USER = {
  Id: 5,
  UserName: "alice",
  EmailAddress: "alice@example.com",
  Name: "Alice",
  Surname: "Smith",
  IsActive: true,
};

function makeClient(fetchMock: ReturnType<typeof vi.fn>): UsersClient {
  return new UsersClient(
    new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("UsersClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("getByEmail filters by EmailAddress and returns first match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_USER] }));
    const found = await makeClient(fetchMock).getByEmail("alice@example.com");
    expect(found?.Id).toBe(5);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Users?%24filter=EmailAddress+eq+%27alice%40example.com%27&%24top=1`);
    // Users are tenant-level — folder header must NOT be set.
    expect((init.headers as Record<string, string>)["X-UIPATH-OrganizationUnitId"]).toBeUndefined();
  });

  it("getByEmail returns undefined when no match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const found = await makeClient(fetchMock).getByEmail("nobody@example.com");
    expect(found).toBeUndefined();
  });

  it("listRoles uses $expand=RolesList and unwraps the field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        Id: 5,
        UserName: "alice",
        RolesList: [
          { Id: 1, Name: "Administrator", DisplayName: "Administrator", Type: "Mixed" },
          { Id: 2, Name: "Robot", DisplayName: "Robot", Type: "Mixed" },
        ],
      }),
    );
    const roles = await makeClient(fetchMock).listRoles(5);
    expect(roles).toHaveLength(2);
    expect(roles[0]?.Name).toBe("Administrator");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/odata/Users(5)");
    expect(url).toContain("%24expand=RolesList");
  });

  it("listRoles returns empty array when RolesList is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Id: 5, UserName: "alice" }));
    const roles = await makeClient(fetchMock).listRoles(5);
    expect(roles).toEqual([]);
  });
});
