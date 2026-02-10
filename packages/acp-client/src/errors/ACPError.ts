export type ACPErrorCode =
  | "processNotRunning"
  | "initializationFailed"
  | "authenticationRequired"
  | "sessionNotFound"
  | "invalidParams"
  | "methodNotFound"
  | "cancelled"
  | "rpcError"
  | "invalidResponse"
  | "transportError";

export class ACPError extends Error {
  readonly code: ACPErrorCode;
  readonly detail?: string;
  readonly rpcCode?: number;

  private constructor(code: ACPErrorCode, message: string, detail?: string, rpcCode?: number) {
    super(message);
    this.name = "ACPError";
    this.code = code;
    this.detail = detail;
    this.rpcCode = rpcCode;
  }

  static processNotRunning(): ACPError {
    return new ACPError("processNotRunning", "Agent process is not running");
  }

  static initializationFailed(detail: string): ACPError {
    return new ACPError("initializationFailed", `Initialization failed: ${detail}`, detail);
  }

  static authenticationRequired(): ACPError {
    return new ACPError("authenticationRequired", "Authentication is required");
  }

  static sessionNotFound(): ACPError {
    return new ACPError("sessionNotFound", "Session not found");
  }

  static invalidParams(detail: string): ACPError {
    return new ACPError("invalidParams", `Invalid parameters: ${detail}`, detail);
  }

  static methodNotFound(method: string): ACPError {
    return new ACPError("methodNotFound", `Method not found: ${method}`, method);
  }

  static cancelled(): ACPError {
    return new ACPError("cancelled", "Operation was cancelled");
  }

  static rpcError(code: number, message: string): ACPError {
    return new ACPError("rpcError", `RPC error ${code}: ${message}`, message, code);
  }

  static invalidResponse(detail: string): ACPError {
    return new ACPError("invalidResponse", `Invalid response: ${detail}`, detail);
  }

  static transportError(detail: string): ACPError {
    return new ACPError("transportError", `Transport error: ${detail}`, detail);
  }
}
