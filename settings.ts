import { App, PluginSettingTab, Setting } from 'obsidian';
import AppleReminderPlugin from './main';

export interface AppleReminderSettings {
    taskSection: string;           // Default section to add tasks under
    dateFormat: string;           // Date format for tasks
    projectTemplate: string;      // Template for new projects
    showProjectIcons: boolean;    // Whether to show project icons
    showDateInTask: boolean;      // Whether to show dates in tasks
    enablePriorities: boolean;    // Enable priority levels
    priorityLevels: string[];     // Custom priority levels
    autoArchive: boolean;         // Auto-archive completed tasks
    archiveSection: string;       // Section for archived tasks
    customSections: string[];     // Additional sections besides Tasks
    defaultView: 'today' | 'scheduled' | 'all'; // Default view when opening
    taskSortOrder: 'priority' | 'date' | 'name'; // How to sort tasks
}

export const DEFAULT_SETTINGS: AppleReminderSettings = {
    taskSection: '## Tasks',
    dateFormat: 'YYYY-MM-DD',
    projectTemplate: `---\ntype: Project\n---\n## Tasks\n\n## Timelines\n## Resources\n## Contracts`,
    showProjectIcons: true,
    showDateInTask: true,
    enablePriorities: false,
    priorityLevels: ['High', 'Medium', 'Low'],
    autoArchive: false,
    archiveSection: '## Archived',
    customSections: [],
    defaultView: 'today',
    taskSortOrder: 'date'
};

export class AppleReminderSettingTab extends PluginSettingTab {
    plugin: AppleReminderPlugin;

    constructor(app: App, plugin: AppleReminderPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Apple Reminder Settings' });

        // General Settings
        containerEl.createEl('h3', { text: 'General Settings' });

        new Setting(containerEl)
            .setName('Task Section')
            .setDesc('Default section where tasks will be added in project files')
            .addText(text => text
                .setPlaceholder('## Tasks')
                .setValue(this.plugin.settings.taskSection)
                .onChange(async (value) => {
                    this.plugin.settings.taskSection = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Date Format')
            .setDesc('Format for displaying dates')
            .addDropdown(dropdown => dropdown
                .addOption('YYYY-MM-DD', 'YYYY-MM-DD')
                .addOption('DD-MM-YYYY', 'DD-MM-YYYY')
                .addOption('MM/DD/YYYY', 'MM/DD/YYYY')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                }));

        // Project Settings
        containerEl.createEl('h3', { text: 'Project Settings' });

        new Setting(containerEl)
            .setName('Project Template')
            .setDesc('Template for new project files')
            .addTextArea(text => text
                .setValue(this.plugin.settings.projectTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.projectTemplate = value;
                    await this.plugin.saveSettings();
                }));

        // Appearance Settings
        containerEl.createEl('h3', { text: 'Appearance' });

        new Setting(containerEl)
            .setName('Show Project Icons')
            .setDesc('Display icons next to project names')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showProjectIcons)
                .onChange(async (value) => {
                    this.plugin.settings.showProjectIcons = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Dates in Tasks')
            .setDesc('Display dates in task items')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDateInTask)
                .onChange(async (value) => {
                    this.plugin.settings.showDateInTask = value;
                    await this.plugin.saveSettings();
                }));

        // Task Management
        containerEl.createEl('h3', { text: 'Task Management' });

        new Setting(containerEl)
            .setName('Enable Priorities')
            .setDesc('Allow setting priority levels for tasks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePriorities)
                .onChange(async (value) => {
                    this.plugin.settings.enablePriorities = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-archive Completed Tasks')
            .setDesc('Automatically move completed tasks to archive section')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoArchive)
                .onChange(async (value) => {
                    this.plugin.settings.autoArchive = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default View')
            .setDesc('Default view when opening the plugin')
            .addDropdown(dropdown => dropdown
                .addOption('today', 'Today')
                .addOption('scheduled', 'Scheduled')
                .addOption('all', 'All Tasks')
                .setValue(this.plugin.settings.defaultView)
                .onChange(async (value: 'today' | 'scheduled' | 'all') => {
                    this.plugin.settings.defaultView = value;
                    await this.plugin.saveSettings();
                }));
    }
}
