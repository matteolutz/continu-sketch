import ContinuSketch, { SERVER_BASE_WS_URL } from "main";

type WebRTCSignalingMessage =
  | {
      type: "offer";
      offer: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      answer: RTCSessionDescriptionInit;
    }
  | {
      type: "candidate";
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "closed";
    };

type WebSocketClientMessage =
  | {
      type: "ready";
      handoffId: number;
    }
  | {
      type: "webrtc";
      handoffId: number;
      message: WebRTCSignalingMessage;
    }
  | {
      type: "close";
      handoffId: number;
    };

type WebSocketServerMessage =
  | {
      type: "webrtc";
      handoffId: number;
      message: WebRTCSignalingMessage;
    }
  | {
      type: "closed"; // the handoff has been closed
      handoffId: number;
    };

export type WebRTCDataChannelRemoteMessage = {};

export type WebRTCDataChannelObsidianMessage = {
  type: "file";
  fileName: string;
  fileType: string;
  fileData: string;
};

type HandoffCallback = (
  message: WebRTCSignalingMessage,
  send: HandoffSend,
) => Promise<void> | void;
type HandoffSend = (message: WebRTCSignalingMessage) => void;

export class ContinuSketchWebSocket {
  private websocket: WebSocket | null = null;

  private handoffWebRTCCalbacks: Map<number, HandoffCallback> = new Map();

  constructor(private readonly plugin: ContinuSketch) {}

  private handleClose() {
    this.websocket = null;
    this.handoffWebRTCCalbacks.clear();
  }

  async connect(): Promise<WebSocket> {
    if (this.websocket !== null) {
      return this.websocket;
    }

    if (this.plugin.settings.auth === null) {
      throw new Error("No auth credentials available");
    }

    this.websocket = new WebSocket(
      `${SERVER_BASE_WS_URL}/ws/obsidian?token=${this.plugin.settings.auth.token}`,
    );
    const websocket = this.websocket;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timed out"));
      }, 5000);

      websocket.addEventListener("open", () => {
        clearTimeout(timeout);

        websocket.addEventListener("close", this.handleClose.bind(this));

        websocket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data) as WebSocketServerMessage;

          switch (message.type) {
            case "closed": {
              const callback = this.handoffWebRTCCalbacks.get(
                message.handoffId,
              );
              if (callback) callback({ type: "closed" }, () => {});

              this.handoffWebRTCCalbacks.delete(message.handoffId);
              break;
            }
            case "webrtc": {
              this.handoffWebRTCCalbacks.get(message.handoffId)?.(
                message.message,

                (msg) => {
                  this.websocket?.send(
                    JSON.stringify({
                      type: "webrtc",
                      handoffId: message.handoffId,
                      message: msg,
                    } satisfies WebSocketClientMessage),
                  );
                },
              );
              break;
            }
          }
        });

        resolve(websocket);
      });
    });
  }

  async disconnect() {
    if (this.websocket === null) return;

    this.websocket.close();
  }

  async register(
    handoffId: number,
    callback: HandoffCallback,
  ): Promise<HandoffSend> {
    if (!this.websocket) throw new Error("WebSocket not connected");
    const ws = this.websocket;

    this.handoffWebRTCCalbacks.set(handoffId, callback);
    const message: WebSocketClientMessage = {
      type: "ready",
      handoffId,
    };

    ws.send(JSON.stringify(message));

    return (msg) => {
      ws.send(
        JSON.stringify({
          type: "webrtc",
          handoffId,
          message: msg,
        } satisfies WebSocketClientMessage),
      );
    };
  }

  async closeHandoff(handoffId: number) {
    const message: WebSocketClientMessage = {
      type: "close",
      handoffId,
    };

    this.websocket?.send(JSON.stringify(message));
    this.handoffWebRTCCalbacks.delete(handoffId);
  }
}
