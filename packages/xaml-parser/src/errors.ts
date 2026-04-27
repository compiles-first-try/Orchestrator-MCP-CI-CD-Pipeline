import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class XamlParseError extends RpaPlatformError {
  constructor(reason: string, options: RpaPlatformErrorOptions = {}) {
    super("xaml.parse_error", `XAML parse error: ${reason}.`, options);
  }
}
