import { App, Modal, Plugin, TFile } from "obsidian";
import {
  DEFAULT_SETTINGS,
  ContinuSketchSettings,
  ContinuSketchSettingsTab,
} from "./settings";
import {
  ContinuSketchWebSocket,
  WebRTCDataChannelObsidianMessage,
  WebRTCDataChannelRemoteMessage,
} from "ws";
import {
  ContinuSketchFormatStrategy,
  ExcalidrawFormatStrategy,
  FallbackStrategy,
} from "continu-sketch-diff";

export const SERVER_BASE_URL = "http://localhost:3000";
export const SERVER_BASE_WS_URL = `ws://localhost:3000`;

export default class ContinuSketch extends Plugin {
  settings: ContinuSketchSettings;
  settingsTab: ContinuSketchSettingsTab;

  statusBar: HTMLElement;

  websocket: ContinuSketchWebSocket;

  async onload() {
    await this.loadSettings();

    this.websocket = new ContinuSketchWebSocket(this);
    if (this.settings.auth !== null) await this.websocket.connect();

    this.registerObsidianProtocolHandler(
      "continu-sketch-auth",
      async (params) => {
        if ("token" in params) {
          this.settings.auth = { token: params.token, username: params.name! };

          await this.saveSettings();
          this.settingsTab.display();

          this.websocket.connect();
        }
      },
    );

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    this.statusBar = this.addStatusBarItem();

    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: "handoff-file",
      name: "Handoff file",
      callback: () => {
        new HandoffFileModal(this.app, this).open();
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        menu.addSeparator().addItem((item) => {
          item
            .setTitle("Handoff")
            .setIcon("hand")
            .onClick(() => {
              if (file instanceof TFile) {
                console.log(file);
                new HandoffFileModal(this.app, this, file).open();
              }
            });
        });
      }),
    );

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(
      (this.settingsTab = new ContinuSketchSettingsTab(this.app, this)),
    );
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ContinuSketchSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class HandoffFileModal extends Modal {
  private handoffConnection: {
    pc: RTCPeerConnection;
    handoffId: number;
  } | null = null;

  private readonly file: TFile | null;

  constructor(
    app: App,
    private readonly plugin: ContinuSketch,
    file: TFile | null = null,
  ) {
    super(app);
    this.file = file ?? this.app.workspace.getActiveFile();
  }

  private async sendHandoffRequest() {
    if (this.plugin.settings.auth === null) {
      return;
    }

    const activeFile = this.file;
    if (activeFile === null) {
      return;
    }

    const fileName = activeFile.basename;
    const fileType = activeFile.extension;
    const initialFileContents = await this.app.vault.cachedRead(activeFile);

    const { handoffId } = await fetch(`${SERVER_BASE_URL}/api/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.plugin.settings.auth.token}`,
      },
      body: JSON.stringify({
        fileName,
        fileType,
      }),
    }).then((res) => res.json());

    await this.plugin.websocket.connect();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.handoffConnection = { pc, handoffId };

    // let the server know, we're ready to accept ICE candidates (no, not that one)
    const send = await this.plugin.websocket.register(
      handoffId,
      async (message, send) => {
        switch (message.type) {
          case "offer": {
            await pc.setRemoteDescription(
              new RTCSessionDescription(message.offer),
            );

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            send({ type: "answer", answer });

            break;
          }
          case "answer": {
            await pc.setRemoteDescription(message.answer);
            break;
          }
          case "candidate": {
            await pc.addIceCandidate(message.candidate);
            break;
          }
          case "closed": {
            console.log("closing pc");
            pc.close();
            this.handoffConnection = null; // prevent from sending a close message in onClose

            this.close();
            break;
          }
        }
      },
    );

    let strategy: ContinuSketchFormatStrategy<unknown, unknown, string> =
      new FallbackStrategy();
    if (fileType === "md" && fileName.endsWith(".excalidraw")) {
      strategy = new ExcalidrawFormatStrategy();
    }

    pc.onicecandidate = (event) => {
      if (event.candidate)
        send({ type: "candidate", candidate: event.candidate });
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;

      channel.onmessage = async (event) => {
        const message = JSON.parse(
          event.data,
        ) as WebRTCDataChannelRemoteMessage;

        console.log("got ptp message", message);

        switch (message.type) {
          case "diff":
            const fileContents = await this.app.vault.cachedRead(activeFile);
            const newFileContents = strategy.apply(fileContents, message.diff);
            await this.app.vault.modify(activeFile, newFileContents);
            break;
        }
      };

      channel.send(
        JSON.stringify({
          type: "file",
          fileName,
          fileType,
          fileData: initialFileContents,
        } satisfies WebRTCDataChannelObsidianMessage),
      );
    };
  }

  onOpen() {
    this.sendHandoffRequest();

    let { contentEl } = this;

    contentEl.setText(
      "Your file has been handed off. Please do not close this dialog.",
    );
  }

  onClose() {
    if (this.handoffConnection) {
      this.handoffConnection.pc.close();
      this.plugin.websocket.closeHandoff(this.handoffConnection.handoffId);
      this.handoffConnection = null;
    }

    const { contentEl } = this;
    contentEl.empty();
  }
}
