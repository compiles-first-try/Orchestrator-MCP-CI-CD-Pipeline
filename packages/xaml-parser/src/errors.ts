import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class XamlParseError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("xaml.parse_failed", message, options);
  }
}
