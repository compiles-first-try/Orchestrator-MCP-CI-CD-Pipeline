import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class FrameworkVersionInvalidError extends RpaPlatformError {
  public readonly input: string;

  constructor(input: string, options: RpaPlatformErrorOptions = {}) {
    super("framework.version_invalid", `'${input}' is not a valid semver version string.`, options);
    this.input = input;
  }
}

export class FrameworkReleaseNotFoundError extends RpaPlatformError {
  public readonly version: string;

  constructor(version: string, options: RpaPlatformErrorOptions = {}) {
    super(
      "framework.release_not_found",
      `No framework release found for version '${version}'. Has it been registered in framework_releases?`,
      options,
    );
    this.version = version;
  }
}
