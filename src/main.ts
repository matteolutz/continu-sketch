import { App, Modal, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  ContinuSketchSettings,
  ContinuSketchSettingsTab,
} from "./settings";

export const SERVER_BASE_URL = "http://localhost:3000";

export default class ContinuSketch extends Plugin {
  settings: ContinuSketchSettings;
  settingsTab: ContinuSketchSettingsTab;

  async onload() {
    await this.loadSettings();

    this.registerObsidianProtocolHandler(
      "continu-sketch-auth",
      async (params) => {
        if ("token" in params) {
          this.settings.auth = { token: params.token, username: params.name! };

          await this.saveSettings();
          this.settingsTab.display();
        }
      },
    );

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText("Status bar text");

    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: "handoff-file",
      name: "Handoff file",
      checkCallback: (checking: boolean) => {
        if (!checking) {
          new HandoffFileModal(this.app, this).open();
        }

        return true;
      },
    });

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
  constructor(
    app: App,
    private readonly plugin: ContinuSketch,
  ) {
    super(app);
  }

  private async sendHandoffRequest() {
    if (this.plugin.settings.auth === null) {
      return;
    }

    await fetch(`${SERVER_BASE_URL}/api/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.plugin.settings.auth.token}`,
      },
      body: JSON.stringify({}),
    });
  }

  onOpen() {
    this.sendHandoffRequest();

    let { contentEl } = this;

    if (this.plugin.settings.auth === null) {
      contentEl.setText("Authentication required");
      return;
    }

    contentEl.setText("Hurray!!");
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
