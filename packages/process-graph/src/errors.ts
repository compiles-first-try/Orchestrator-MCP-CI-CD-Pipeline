import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class ProcessGraphError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("process_graph.build_failed", message, options);
  }
}

export class ProcessIngestError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("process_graph.ingest_failed", message, options);
  }
}
