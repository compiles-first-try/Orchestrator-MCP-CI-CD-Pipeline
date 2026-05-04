import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

// Users + their roles, used by the Slack→Orchestrator identity resolution
// described in `permissions_architecture` memory: the platform asks
// Orchestrator "who is @alice and what roles does she have?" before applying
// the platform's permission matrix.
//
// VERIFY: scope likely `OR.Users.Read` (or `OR.Users`) and `OR.Administration`
// for role assignments. Test against a real tenant on first integration run.

export const UserEntity = z.object({
  Id: z.number().int(),
  UserName: z.string().nullable().optional(),
  EmailAddress: z.string().nullable().optional(),
  Name: z.string().nullable().optional(),
  Surname: z.string().nullable().optional(),
  Type: z.string().optional(),
  IsActive: z.boolean().optional(),
});
export type UserEntity = z.infer<typeof UserEntity>;

// `RolesList` is returned by the user-roles lookup. Per UiPath OData,
// individual roles look like { Id, Name, DisplayName, Type, Groups[] }.
export const RoleEntity = z.object({
  Id: z.number().int(),
  Name: z.string(),
  DisplayName: z.string().nullable().optional(),
  Type: z.string().optional(),
});
export type RoleEntity = z.infer<typeof RoleEntity>;

// Users live at the tenant level — folder header is not applicable. The
// per-method options drop `folder` from RequestOptions to make this explicit.
export type UserRequestOptions = Omit<RequestOptions, "folder">;

export class UsersClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: UserRequestOptions & { activeOnly?: boolean } = {}): Promise<readonly UserEntity[]> {
    const baseQuery = options.query === undefined ? {} : { ...options.query };
    if (options.activeOnly === true) {
      baseQuery.$filter = "IsActive eq true";
    }
    const result = await this.#rest.get("/odata/Users", odataList(UserEntity), {
      ...(options.headers !== undefined && { headers: options.headers }),
      query: baseQuery,
    });
    return result.value;
  }

  async getByEmail(email: string, options: UserRequestOptions = {}): Promise<UserEntity | undefined> {
    const result = await this.#rest.get("/odata/Users", odataList(UserEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("EmailAddress", email), $top: 1 },
    });
    return result.value[0];
  }

  async getById(id: number, options: UserRequestOptions = {}): Promise<UserEntity> {
    return this.#rest.get(`/odata/Users(${id})`, UserEntity, options);
  }

  async listRoles(userId: number, options: UserRequestOptions = {}): Promise<readonly RoleEntity[]> {
    // VERIFY exact OData expand path. Common pattern is
    //   /odata/Users({id})?$expand=RolesList
    // and reading the embedded RolesList field. Fallback path that some
    // Orchestrator versions expose: /odata/Users({id})/RolesList. This v1
    // implementation uses the function call and adapts later if the live
    // tenant returns a different shape.
    const ResponseShape = z.object({ RolesList: z.array(RoleEntity).optional() });
    const result = await this.#rest.get(`/odata/Users(${userId})`, ResponseShape, {
      ...options,
      query: { ...options.query, $expand: "RolesList" },
    });
    return result.RolesList ?? [];
  }
}
