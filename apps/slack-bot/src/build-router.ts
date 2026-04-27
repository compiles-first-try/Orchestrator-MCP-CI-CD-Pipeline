import { PERMISSIONS } from "@rpa-platform/shared";
import { withPermission } from "./permissions.js";
import { configSetHandler } from "./handlers/config-set.js";
import { editHandler } from "./handlers/edit.js";
import { helpHandler } from "./handlers/help.js";
import { statusHandler } from "./handlers/status.js";
import { CommandRouter } from "./router.js";

export function buildDefaultRouter(): CommandRouter {
  const router = new CommandRouter();
  router.register("help", helpHandler);
  router.register("status", statusHandler);
  router.register("edit", editHandler);
  router.register(
    "config",
    withPermission(PERMISSIONS.CONFIG_QUICK_EDIT, configSetHandler, (ctx) => {
      const tenant = ctx.args[1];
      if (tenant === "dev" || tenant === "test" || tenant === "stage" || tenant === "prod") {
        return { tenant };
      }
      return undefined;
    }),
  );
  return router;
}
