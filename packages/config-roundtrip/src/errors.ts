import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class ConfigRoundtripError extends RpaPlatformError {
  constructor(reason: string, options: RpaPlatformErrorOptions = {}) {
    super("config_roundtrip.invalid", `Config round-trip error: ${reason}.`, options);
  }
}
