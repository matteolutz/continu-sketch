import { App, PluginSettingTab, Setting } from "obsidian";
import ContinuSketch from "./main";

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

    new Setting(containerEl)
      .setName("Account")
      .setDesc(
        `You are currently ${this.plugin.settings.auth ? `logged in as ${this.plugin.settings.auth.username}` : "not logged in"}`,
      )
      .addButton((button) =>
        button
          .setButtonText(this.plugin.settings.auth ? "Logout" : "Login")
          .onClick(async () => {
            if (this.plugin.settings.auth) {
              this.plugin.settings.auth = null;
            } else {
              window.open("http://127.0.0.1:3000/oauth/start");
            }

            await this.plugin.saveSettings();
          }),
      );
  }
}
