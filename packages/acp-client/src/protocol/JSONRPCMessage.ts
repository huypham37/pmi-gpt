export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: JSONValue;
}

export interface JSONRPCResponse {
  jsonrpc: string;
  id?: number;
  result?: JSONValue;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: JSONValue;
}

export interface JSONRPCNotification {
  jsonrpc: string;
  method: string;
  params?: JSONValue;
}

export const JSONRPCErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  authenticationRequired: -32000,
  resourceNotFound: -32002,
} as const;

export function getStr(val: JSONValue | undefined, key: string): string | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val[key];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export function getNum(val: JSONValue | undefined, key: string): number | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val[key];
    return typeof v === "number" ? v : undefined;
  }
  return undefined;
}

export function getBool(val: JSONValue | undefined, key: string): boolean | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val[key];
    return typeof v === "boolean" ? v : undefined;
  }
  return undefined;
}

export function getObj(val: JSONValue | undefined, key: string): Record<string, JSONValue> | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, JSONValue>;
    }
  }
  return undefined;
}

export function getArr(val: JSONValue | undefined, key: string): JSONValue[] | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val[key];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

export function get(val: JSONValue | undefined, key: string): JSONValue | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val[key];
  }
  return undefined;
}
