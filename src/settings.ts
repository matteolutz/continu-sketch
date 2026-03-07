import { App, PluginSettingTab, Setting } from "obsidian";
import ContinuSketch, { SERVER_BASE_URL } from "./main";

export type ContinuSketchAuthParams = {
  token: string;
  username: string;
};

export interface ContinuSketchSettings {
  auth: ContinuSketchAuthParams | null;
}

export const DEFAULT_SETTINGS: ContinuSketchSettings = {
  auth: null,
};

export class ContinuSketchSettingsTab extends PluginSettingTab {
  plugin: ContinuSketch;

  constructor(app: App, plugin: ContinuSketch) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    const buttonText = (auth: ContinuSketchAuthParams | null) =>
      auth !== null ? "Logout" : "Login";
    const desc = (auth: ContinuSketchAuthParams | null) =>
      `You are currently ${auth !== null ? `logged in as ${auth.username}` : "not logged in"}`;

    new Setting(containerEl)
      .setName("Account")
      .setDesc(desc(this.plugin.settings.auth))
      .addButton((button) =>
        button
          .setButtonText(buttonText(this.plugin.settings.auth))
          .onClick(async () => {
            if (this.plugin.settings.auth) {
              this.plugin.settings.auth = null;
            } else {
              window.open(`${SERVER_BASE_URL}/oauth/start`);
            }

            await this.plugin.saveSettings();

            this.display();
          }),
      );
  }
}
