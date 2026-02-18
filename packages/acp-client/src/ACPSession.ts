import type { JSONValue } from "./protocol/JSONRPCMessage.js";
import { getStr, getArr, get } from "./protocol/JSONRPCMessage.js";
import type {
  ConfigOption,
  AIModel,
  AIMode,
  ContentBlock,
  StopReason,
  SessionUpdate,
  PromptResult,
  PlanEntry,
  PermissionOption,
} from "./protocol/ACPTypes.js";
import {
  contentBlockToJSON,
  parseConfigOption,
  parsePlanEntry,
  parsePermissionOption,
  ToolCall,
} from "./protocol/ACPTypes.js";
import type { ACPClient } from "./ACPClient.js";

interface UpdateQueueItem {
  value: SessionUpdate;
  resolve: () => void;
}

export class ACPSession {
  readonly id: string;
  configOptions: ConfigOption[];
  models: AIModel[];
  modes: AIMode[];
  currentModelId: string | undefined;
  currentModeId: string | undefined;
  toolCalls: ToolCall[] = [];
  lastStopReason: StopReason | undefined;

  private readonly client: ACPClient;
  private updateQueue: UpdateQueueItem[] = [];
  private updateWaiters: ((item: UpdateQueueItem | null) => void)[] = [];
  private streamFinished = false;

  constructor(opts: {
    id: string;
    client: ACPClient;
    configOptions: ConfigOption[];
    models?: AIModel[];
    modes?: AIMode[];
    currentModelId?: string;
    currentModeId?: string;
  }) {
    this.id = opts.id;
    this.client = opts.client;
    this.configOptions = opts.configOptions;
    this.models = opts.models ?? [];
    this.modes = opts.modes ?? [];
    this.currentModelId = opts.currentModelId;
    this.currentModeId = opts.currentModeId;
  }

  async setModel(modelId: string): Promise<void> {
    const params: JSONValue = { sessionId: this.id, modelId };
    await this.client.sendRequest("session/set_model", params);
    this.currentModelId = modelId;
  }

  async setMode(modeId: string): Promise<void> {
    const params: JSONValue = { sessionId: this.id, modeId };
    await this.client.sendRequest("session/set_mode", params);
    this.currentModeId = modeId;
  }

  async setConfig(configId: string, value: string): Promise<void> {
    const params: JSONValue = { sessionId: this.id, configId, value };
    const result = await this.client.sendRequest("session/set_config_option", params);
    const options = getArr(result, "configOptions");
    if (options) {
      this.configOptions = options.map(parseConfigOption);
    }
  }

  prompt(text: string): AsyncIterable<SessionUpdate>;
  prompt(content: ContentBlock[]): AsyncIterable<SessionUpdate>;
  prompt(input: string | ContentBlock[]): AsyncIterable<SessionUpdate> {
    const content: ContentBlock[] =
      typeof input === "string" ? [{ type: "text", text: input }] : input;

    this.toolCalls = [];
    this.lastStopReason = undefined;
    this.streamFinished = false;
    this.updateQueue = [];
    this.updateWaiters = [];

    this.client.setNotificationHandler((method, params) => {
      this.handleNotification(method, params);
    });

    this.client.setPermissionRequestHandler((requestId, params) => {
      this.handlePermissionRequest(requestId, params);
    });

    const promptParams: JSONValue = {
      sessionId: this.id,
      prompt: content.map(contentBlockToJSON),
    };

    this.client
      .sendRequest("session/prompt", promptParams)
      .then((result) => {
        const reason = (getStr(result, "stopReason") as StopReason | undefined) ?? "end_turn";
        this.lastStopReason = reason;
      })
      .catch((error: unknown) => {
        if (error instanceof Error && "code" in error && (error as { code: string }).code === "cancelled") {
          this.lastStopReason = "cancelled";
        }
      })
      .finally(() => {
        setTimeout(() => {
          this.finishStream();
        }, 500);
      });

    return this.createAsyncIterable();
  }

  async promptAndWait(text: string): Promise<PromptResult> {
    let fullText = "";
    const allToolCalls: ToolCall[] = [];

    for await (const update of this.prompt(text)) {
      switch (update.type) {
        case "text":
          fullText += update.text;
          break;
        case "toolCall":
          if (!allToolCalls.some((tc) => tc.id === update.toolCall.id)) {
            allToolCalls.push(update.toolCall);
          }
          break;
      }
    }

    return {
      text: fullText,
      toolCalls: allToolCalls,
      stopReason: this.lastStopReason ?? "end_turn",
    };
  }

  cancel(): void {
    this.lastStopReason = "cancelled";
    this.finishStream();
    this.client.setNotificationHandler(null);
    this.client.setPermissionRequestHandler(null);

    this.client
      .sendNotification("session/cancel", { sessionId: this.id })
      .catch(() => {});
  }

  toolCall(toolCallId: string): ToolCall | undefined {
    return this.toolCalls.find((tc) => tc.id === toolCallId);
  }

  // -- Private: async iterable plumbing --

  private createAsyncIterable(): AsyncIterable<SessionUpdate> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<SessionUpdate>> {
            const item = await self.dequeue();
            if (item === null) return { done: true, value: undefined };
            return { done: false, value: item.value };
          },
        };
      },
    };
  }

  private enqueue(update: SessionUpdate): void {
    if (this.streamFinished) return;
    const waiter = this.updateWaiters.shift();
    if (waiter) {
      const item: UpdateQueueItem = { value: update, resolve: () => {} };
      waiter(item);
    } else {
      const item: UpdateQueueItem = { value: update, resolve: () => {} };
      this.updateQueue.push(item);
    }
  }

  private dequeue(): Promise<UpdateQueueItem | null> {
    const item = this.updateQueue.shift();
    if (item) return Promise.resolve(item);
    if (this.streamFinished) return Promise.resolve(null);
    return new Promise<UpdateQueueItem | null>((resolve) => {
      this.updateWaiters.push(resolve);
    });
  }

  private finishStream(): void {
    if (this.streamFinished) return;
    this.streamFinished = true;
    for (const waiter of this.updateWaiters) {
      waiter(null);
    }
    this.updateWaiters = [];
    this.client.setNotificationHandler(null);
    this.client.setPermissionRequestHandler(null);
  }

  // -- Notification handling --

  private handleNotification(method: string, params: JSONValue | undefined): void {
    if (method !== "session/update") return;
    const sessionId = getStr(params, "sessionId");
    if (!sessionId || sessionId !== this.id) return;

    const update = get(params, "update");
    if (!update) return;
    const updateType = getStr(update, "sessionUpdate");
    if (!updateType) return;

    switch (updateType) {
      case "agent_message_chunk": {
        const text = getStr(get(update, "content"), "text");
        if (text !== undefined) this.enqueue({ type: "text", text });
        break;
      }
      case "thought_chunk": {
        const text = getStr(get(update, "content"), "text");
        if (text !== undefined) this.enqueue({ type: "thinking", text });
        break;
      }
      case "user_message_chunk":
        break;
      case "tool_call": {
        const tool = new ToolCall(update);
        this.toolCalls.push(tool);
        this.enqueue({ type: "toolCall", toolCall: tool });
        break;
      }
      case "tool_call_update": {
        const toolId = getStr(update, "toolCallId");
        if (toolId) {
          const existing = this.toolCalls.find((tc) => tc.id === toolId);
          if (existing) {
            existing.applyUpdate(update);
            this.enqueue({ type: "toolCall", toolCall: existing });
          }
        }
        break;
      }
      case "plan": {
        const entries = getArr(update, "entries");
        if (entries) {
          const plan: PlanEntry[] = entries.map(parsePlanEntry);
          this.enqueue({ type: "plan", entries: plan });
        }
        break;
      }
      case "config_options_update": {
        const options = getArr(update, "configOptions");
        if (options) {
          this.configOptions = options.map(parseConfigOption);
          this.enqueue({ type: "configUpdate", configOptions: this.configOptions });
        }
        break;
      }
      default:
        break;
    }
  }

  // -- Permission handling --

  private handlePermissionRequest(requestId: number, params: JSONValue): void {
    const sessionId = getStr(params, "sessionId");
    if (!sessionId || sessionId !== this.id) return;

    const options: PermissionOption[] = (getArr(params, "options") ?? []).map(parsePermissionOption);
    const toolCallInfo = get(params, "toolCall");

    const request = new PermissionRequest({
      requestId,
      toolCallId: getStr(toolCallInfo, "toolCallId"),
      options,
      client: this.client,
    });

    this.enqueue({ type: "permissionRequest", request });
  }
}

// ---------- Permission Request ----------

export class PermissionRequest {
  readonly toolCallId: string | undefined;
  readonly options: PermissionOption[];

  private readonly requestId: number;
  private readonly client: ACPClient;
  private responded = false;

  constructor(opts: {
    requestId: number;
    toolCallId?: string;
    options: PermissionOption[];
    client: ACPClient;
  }) {
    this.requestId = opts.requestId;
    this.toolCallId = opts.toolCallId;
    this.options = opts.options;
    this.client = opts.client;
  }

  async respond(optionId: string): Promise<void> {
    if (this.responded) return;
    this.responded = true;
    await this.client.respondToRequest(this.requestId, {
      outcome: {
        outcome: "selected",
        optionId,
      },
    });
  }

  async cancel(): Promise<void> {
    if (this.responded) return;
    this.responded = true;
    await this.client.respondToRequest(this.requestId, {
      outcome: {
        outcome: "cancelled",
      },
    });
  }
}
