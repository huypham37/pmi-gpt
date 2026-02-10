import type { JSONValue } from "./JSONRPCMessage.js";
import { getStr, getNum, getBool, getObj, getArr, get } from "./JSONRPCMessage.js";

// ---------- Client Info ----------

export interface ClientInfo {
  name: string;
  title?: string;
  version: string;
}

export function clientInfoToJSON(info: ClientInfo): JSONValue {
  const dict: Record<string, JSONValue> = {
    name: info.name,
    version: info.version,
  };
  if (info.title !== undefined) dict["title"] = info.title;
  return dict;
}

// ---------- Agent Info ----------

export interface AgentInfo {
  name: string;
  title?: string;
  version?: string;
}

export function parseAgentInfo(json: JSONValue): AgentInfo {
  return {
    name: getStr(json, "name") ?? "unknown",
    title: getStr(json, "title"),
    version: getStr(json, "version"),
  };
}

// ---------- Client Capabilities ----------

export interface ClientCapabilities {
  fsReadTextFile: boolean;
  fsWriteTextFile: boolean;
  terminal: boolean;
  meta: Record<string, boolean>;
}

export const ClientCapabilitiesPresets = {
  none: { fsReadTextFile: false, fsWriteTextFile: false, terminal: false, meta: {} } satisfies ClientCapabilities,
  readOnly: { fsReadTextFile: true, fsWriteTextFile: false, terminal: false, meta: {} } satisfies ClientCapabilities,
  readWrite: { fsReadTextFile: true, fsWriteTextFile: true, terminal: false, meta: {} } satisfies ClientCapabilities,
  full: {
    fsReadTextFile: true,
    fsWriteTextFile: true,
    terminal: true,
    meta: { terminal_output: true, "terminal-auth": true },
  } satisfies ClientCapabilities,
} as const;

export function clientCapabilitiesToJSON(caps: ClientCapabilities): JSONValue {
  const dict: Record<string, JSONValue> = {
    fs: {
      readTextFile: caps.fsReadTextFile,
      writeTextFile: caps.fsWriteTextFile,
    },
    terminal: caps.terminal,
  };
  const metaKeys = Object.keys(caps.meta);
  if (metaKeys.length > 0) {
    const metaObj: Record<string, JSONValue> = {};
    for (const k of metaKeys) metaObj[k] = caps.meta[k];
    dict["meta"] = metaObj;
  }
  return dict;
}

// ---------- Agent Capabilities ----------

export interface AgentCapabilities {
  loadSession: boolean;
  promptImage: boolean;
  promptAudio: boolean;
  promptEmbeddedContext: boolean;
  mcpHttp: boolean;
  mcpSse: boolean;
}

export function parseAgentCapabilities(json: JSONValue): AgentCapabilities {
  const prompt = get(json, "promptCapabilities");
  const mcp = get(json, "mcpCapabilities");
  return {
    loadSession: getBool(json, "loadSession") ?? false,
    promptImage: getBool(prompt, "image") ?? false,
    promptAudio: getBool(prompt, "audio") ?? false,
    promptEmbeddedContext: getBool(prompt, "embeddedContext") ?? false,
    mcpHttp: getBool(mcp, "http") ?? false,
    mcpSse: getBool(mcp, "sse") ?? false,
  };
}

// ---------- Config Options ----------

export type ConfigOptionCategory = "mode" | "model" | "thought_level";

export interface ConfigOptionValue {
  value: string;
  name: string;
  description?: string;
}

export function parseConfigOptionValue(json: JSONValue): ConfigOptionValue {
  return {
    value: getStr(json, "value") ?? "",
    name: getStr(json, "name") ?? "",
    description: getStr(json, "description"),
  };
}

export interface ConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: ConfigOptionCategory;
  type: string;
  currentValue: string;
  options: ConfigOptionValue[];
}

export function parseConfigOption(json: JSONValue): ConfigOption {
  const raw = getStr(json, "category");
  let category: ConfigOptionCategory | undefined;
  if (raw === "mode" || raw === "model" || raw === "thought_level") category = raw;
  return {
    id: getStr(json, "id") ?? "",
    name: getStr(json, "name") ?? "",
    description: getStr(json, "description"),
    category,
    type: getStr(json, "type") ?? "select",
    currentValue: getStr(json, "currentValue") ?? "",
    options: (getArr(json, "options") ?? []).map(parseConfigOptionValue),
  };
}

// ---------- AI Model ----------

export interface AIModel {
  modelId: string;
  name: string;
}

export function parseAIModel(json: JSONValue): AIModel {
  const modelId = getStr(json, "modelId") ?? getStr(json, "model_id") ?? "";
  return { modelId, name: getStr(json, "name") ?? modelId };
}

// ---------- AI Mode ----------

export interface AIMode {
  id: string;
  name: string;
  description?: string;
}

export function parseAIMode(json: JSONValue): AIMode {
  return {
    id: getStr(json, "id") ?? "",
    name: getStr(json, "name") ?? "",
    description: getStr(json, "description"),
  };
}

// ---------- Content Blocks ----------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text: string } }
  | { type: "resource_link"; uri: string };

export function contentBlockToJSON(block: ContentBlock): JSONValue {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return { type: "image", data: block.data, mimeType: block.mimeType };
    case "resource": {
      const resource: Record<string, JSONValue> = {
        uri: block.resource.uri,
        text: block.resource.text,
      };
      if (block.resource.mimeType !== undefined) resource["mimeType"] = block.resource.mimeType;
      return { type: "resource", resource };
    }
    case "resource_link":
      return { type: "resource_link", uri: block.uri };
  }
}

// ---------- Tool Call ----------

export type ToolKind = "read" | "write" | "other";
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export interface FileDiff {
  path: string;
  oldText?: string;
  newText: string;
}

export interface FileLocation {
  path: string;
  line?: number;
}

export class ToolCall {
  id: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  rawInput: JSONValue | undefined;
  rawOutput: JSONValue | undefined;
  diffs: FileDiff[];
  locations: FileLocation[];
  textContent: string;

  constructor(json: JSONValue) {
    this.id = getStr(json, "toolCallId") ?? crypto.randomUUID();
    this.title = getStr(json, "title") ?? "";
    this.kind = (getStr(json, "kind") as ToolKind | undefined) ?? "other";
    if (this.kind !== "read" && this.kind !== "write" && this.kind !== "other") this.kind = "other";
    this.status = (getStr(json, "status") as ToolCallStatus | undefined) ?? "pending";
    this.rawInput = get(json, "rawInput");
    this.rawOutput = get(json, "rawOutput");
    this.diffs = ToolCall.parseDiffs(get(json, "content"));
    this.locations = ToolCall.parseLocations(get(json, "locations"));
    this.textContent = ToolCall.parseText(get(json, "content"));
  }

  applyUpdate(json: JSONValue): void {
    const title = getStr(json, "title");
    if (title !== undefined) this.title = title;
    const kind = getStr(json, "kind") as ToolKind | undefined;
    if (kind !== undefined && (kind === "read" || kind === "write" || kind === "other")) this.kind = kind;
    const status = getStr(json, "status") as ToolCallStatus | undefined;
    if (status !== undefined) this.status = status;
    const input = get(json, "rawInput");
    if (input !== undefined) this.rawInput = input;
    const output = get(json, "rawOutput");
    if (output !== undefined) this.rawOutput = output;
    const content = get(json, "content");
    if (content !== undefined) {
      this.diffs.push(...ToolCall.parseDiffs(content));
      const newText = ToolCall.parseText(content);
      if (newText.length > 0) this.textContent += newText;
    }
    const locations = get(json, "locations");
    if (locations !== undefined) {
      this.locations.push(...ToolCall.parseLocations(locations));
    }
  }

  private static parseDiffs(content: JSONValue | undefined): FileDiff[] {
    if (!Array.isArray(content)) return [];
    const result: FileDiff[] = [];
    for (const item of content) {
      if (getStr(item, "type") !== "diff") continue;
      const path = getStr(item, "path");
      const newText = getStr(item, "newText");
      if (path === undefined || newText === undefined) continue;
      result.push({ path, oldText: getStr(item, "oldText"), newText });
    }
    return result;
  }

  private static parseLocations(locations: JSONValue | undefined): FileLocation[] {
    if (!Array.isArray(locations)) return [];
    const result: FileLocation[] = [];
    for (const item of locations) {
      const path = getStr(item, "path");
      if (path === undefined) continue;
      result.push({ path, line: getNum(item, "line") });
    }
    return result;
  }

  private static parseText(content: JSONValue | undefined): string {
    if (!Array.isArray(content)) return "";
    const parts: string[] = [];
    for (const item of content) {
      if (getStr(item, "type") !== "content") continue;
      const text = getStr(get(item, "content"), "text");
      if (text !== undefined) parts.push(text);
    }
    return parts.join("");
  }
}

// ---------- Plan ----------

export interface PlanEntry {
  content: string;
  priority?: string;
  status: string;
}

export function parsePlanEntry(json: JSONValue): PlanEntry {
  return {
    content: getStr(json, "content") ?? "",
    priority: getStr(json, "priority"),
    status: getStr(json, "status") ?? "pending",
  };
}

// ---------- Permission ----------

export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export function parsePermissionOption(json: JSONValue): PermissionOption {
  const kind = getStr(json, "kind") as PermissionOptionKind | undefined;
  return {
    optionId: getStr(json, "optionId") ?? "",
    name: getStr(json, "name") ?? "",
    kind: kind ?? "allow_once",
  };
}

// ---------- Stop Reason ----------

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";

// ---------- Session Update ----------

export type SessionUpdate =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "toolCall"; toolCall: ToolCall }
  | { type: "plan"; entries: PlanEntry[] }
  | { type: "permissionRequest"; request: PermissionRequest }
  | { type: "configUpdate"; configOptions: ConfigOption[] };

import type { PermissionRequest } from "../ACPSession.js";

// ---------- Prompt Result ----------

export interface PromptResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
}

// ---------- MCP Server ----------

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function mcpServerToJSON(server: MCPServer): JSONValue {
  const envArray: JSONValue[] = Object.entries(server.env).map(([name, value]) => ({
    name,
    value,
  }));
  return {
    name: server.name,
    command: server.command,
    args: server.args,
    env: envArray,
  };
}
