import type { JSONValue, JSONRPCResponse, JSONRPCRequest } from "./protocol/JSONRPCMessage.js";
import { JSONRPCErrorCode, getStr, get, getArr, getNum } from "./protocol/JSONRPCMessage.js";
import type { JSONRPCError } from "./protocol/JSONRPCMessage.js";
import { ACPError } from "./errors/ACPError.js";
import { StdioTransport } from "./transport/StdioTransport.js";
import type { Transport } from "./transport/Transport.js";
import type { ClientInfo, ClientCapabilities, MCPServer } from "./protocol/ACPTypes.js";
import {
  clientInfoToJSON,
  clientCapabilitiesToJSON,
  ClientCapabilitiesPresets,
  mcpServerToJSON,
  parseAgentInfo,
  parseAgentCapabilities,
  parseAIModel,
  parseAIMode,
  parseConfigOption,
} from "./protocol/ACPTypes.js";
import type { AgentInfo, AgentCapabilities, AIModel, AIMode } from "./protocol/ACPTypes.js";
import { ACPSession } from "./ACPSession.js";

interface PendingRequest {
  resolve: (value: JSONValue) => void;
  reject: (reason: unknown) => void;
}

export class ACPClient {
  private readonly transport: Transport;
  private readonly clientInfo: ClientInfo;
  private readonly clientCapabilities: ClientCapabilities;
  private readonly workingDirectory: string | undefined;

  agentInfo: AgentInfo | undefined;
  agentCapabilities: AgentCapabilities | undefined;

  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private notificationHandler: ((method: string, params: JSONValue | undefined) => void) | null = null;
  private incomingRequestHandler: ((requestId: number, params: JSONValue) => void) | null = null;

  constructor(opts: {
    executable: string;
    arguments?: string[];
    environment?: Record<string, string>;
    workingDirectory?: string;
    clientInfo: ClientInfo;
    capabilities?: ClientCapabilities;
  }) {
    this.transport = new StdioTransport({
      executable: opts.executable,
      args: opts.arguments ?? ["acp"],
      environment: opts.environment,
      workingDirectory: opts.workingDirectory,
    });
    this.clientInfo = opts.clientInfo;
    this.clientCapabilities = opts.capabilities ?? ClientCapabilitiesPresets.none;
    this.workingDirectory = opts.workingDirectory;
  }

  async start(): Promise<void> {
    this.transport.onData = (data: Buffer) => {
      this.handleIncomingData(data);
    };
    await this.transport.start();
    await this.initialize();
  }

  stop(): void {
    this.transport.stop();
    const pending = new Map(this.pendingRequests);
    this.pendingRequests.clear();
    for (const [, req] of pending) {
      req.reject(ACPError.processNotRunning());
    }
  }

  async newSession(mcpServers: MCPServer[] = []): Promise<ACPSession> {
    const params: Record<string, JSONValue> = {
      mcpServers: mcpServers.map(mcpServerToJSON),
    };
    if (this.workingDirectory) {
      params["cwd"] = this.workingDirectory;
    }

    const result = await this.sendRequest("session/new", params);
    const sessionId = getStr(result, "sessionId");
    if (!sessionId) {
      throw ACPError.invalidResponse("Missing sessionId in session/new response");
    }

    const configOptions = (getArr(result, "configOptions") ?? []).map(parseConfigOption);

    let models: AIModel[] = [];
    let currentModelId: string | undefined;
    const modelsData = get(result, "models");
    if (modelsData) {
      const available = getArr(modelsData, "availableModels") ?? getArr(modelsData, "available_models") ?? [];
      models = available.map(parseAIModel);
      currentModelId = getStr(modelsData, "currentModelId") ?? getStr(modelsData, "current_model_id");
    }

    let modes: AIMode[] = [];
    let currentModeId: string | undefined;
    const modesData = get(result, "modes");
    if (modesData) {
      const available = getArr(modesData, "availableModes") ?? getArr(modesData, "available_modes") ?? [];
      modes = available.map(parseAIMode);
      currentModeId = getStr(modesData, "currentModeId") ?? getStr(modesData, "current_mode_id");
    }

    return new ACPSession({
      id: sessionId,
      client: this,
      configOptions,
      models,
      modes,
      currentModelId,
      currentModeId,
    });
  }

  async loadSession(id: string, mcpServers: MCPServer[] = []): Promise<ACPSession> {
    if (!this.agentCapabilities?.loadSession) {
      throw ACPError.methodNotFound("session/load not supported by agent");
    }

    const params: Record<string, JSONValue> = { sessionId: id };
    if (this.workingDirectory) {
      params["cwd"] = this.workingDirectory;
    }
    if (mcpServers.length > 0) {
      params["mcpServers"] = mcpServers.map(mcpServerToJSON);
    }

    await this.sendRequest("session/load", params);

    return new ACPSession({
      id,
      client: this,
      configOptions: [],
    });
  }

  // -- Internal --

  sendRequest(method: string, params: JSONValue | undefined): Promise<JSONValue> {
    const id = this.nextRequestId();

    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const data = Buffer.from(JSON.stringify(request), "utf-8");

    return new Promise<JSONValue>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.transport.send(data).catch((err) => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(err);
        }
      });
    });
  }

  async sendNotification(method: string, params: JSONValue | undefined): Promise<void> {
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      method,
      params,
    };
    const data = Buffer.from(JSON.stringify(request), "utf-8");
    await this.transport.send(data);
  }

  async respondToRequest(id: number, result: JSONValue): Promise<void> {
    const response: Record<string, JSONValue> = {
      jsonrpc: "2.0",
      id,
      result,
    };
    const data = Buffer.from(JSON.stringify(response), "utf-8");
    await this.transport.send(data);
  }

  setNotificationHandler(handler: ((method: string, params: JSONValue | undefined) => void) | null): void {
    this.notificationHandler = handler;
  }

  setPermissionRequestHandler(handler: ((requestId: number, params: JSONValue) => void) | null): void {
    this.incomingRequestHandler = handler;
  }

  // -- Private --

  private async initialize(): Promise<void> {
    const params: JSONValue = {
      protocolVersion: 1,
      clientInfo: clientInfoToJSON(this.clientInfo),
      capabilities: clientCapabilitiesToJSON(this.clientCapabilities),
    };

    const result = await this.sendRequest("initialize", params);

    if (get(result, "protocolVersion") === undefined) {
      throw ACPError.initializationFailed("Missing protocolVersion in response");
    }

    const agentInfoJSON = get(result, "agentInfo");
    if (agentInfoJSON !== undefined) {
      this.agentInfo = parseAgentInfo(agentInfoJSON);
    }
    const capsJSON = get(result, "agentCapabilities");
    if (capsJSON !== undefined) {
      this.agentCapabilities = parseAgentCapabilities(capsJSON);
    }
  }

  private nextRequestId(): number {
    return ++this.requestId;
  }

  private handleIncomingData(data: Buffer): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString("utf-8"));
    } catch {
      return;
    }
    const msg = parsed as Record<string, unknown>;

    if (msg["method"] !== undefined && msg["id"] !== undefined) {
      const id = msg["id"] as number;
      const params = (msg["params"] ?? null) as JSONValue;
      console.log(`[ACP DEBUG] Incoming request: method=${msg["method"]} id=${id}`);
      this.incomingRequestHandler?.(id, params);
      return;
    }

    if (msg["id"] !== undefined) {
      const response = msg as unknown as JSONRPCResponse;
      const id = response.id;
      if (id !== undefined) {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          if (response.error) {
            pending.reject(this.mapRPCError(response.error));
          } else {
            pending.resolve((response.result ?? null) as JSONValue);
          }
        }
        return;
      }
    }

    if (msg["method"] !== undefined && msg["id"] === undefined) {
      const method = msg["method"] as string;
      const params = (msg["params"] ?? undefined) as JSONValue | undefined;
      this.notificationHandler?.(method, params);
    }
  }

  private mapRPCError(error: JSONRPCError): ACPError {
    switch (error.code) {
      case JSONRPCErrorCode.methodNotFound:
        return ACPError.methodNotFound(error.message);
      case JSONRPCErrorCode.invalidParams:
        return ACPError.invalidParams(error.message);
      case JSONRPCErrorCode.authenticationRequired:
        return ACPError.authenticationRequired();
      case JSONRPCErrorCode.resourceNotFound:
        return ACPError.sessionNotFound();
      default:
        return ACPError.rpcError(error.code, error.message);
    }
  }
}
