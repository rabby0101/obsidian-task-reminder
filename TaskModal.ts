// TaskModal.ts
import { App, Modal, Setting, TextComponent, moment, TFolder, TFile } from "obsidian";
import { getProjectFiles } from './main';

interface TaskData {
  name: string;
  tags: string[];
  date: string;
  checklist: boolean;
  project?: string; // Make optional to maintain compatibility
  fileId?: string;
}

export class TaskModal extends Modal {
  protected taskName: string = "";
  protected taskTags: string[] = [];
  protected taskDate: string = moment().format("YYYY-MM-DD");
  protected taskChecklist: boolean = false;
  protected taskProject: string = "";
  protected existingTags: Set<string>;
  protected addTaskCallback: (task: TaskData) => void;
  protected previewEl: HTMLElement;
  protected tagListEl: HTMLElement;
  protected projects: string[] = [];
  protected fileId: string;
  private dataLoaded: boolean = false;
  protected isDataLoading: boolean = true;
  protected projectFiles: TFile[] = [];

  constructor(
    app: App, 
    addTaskCallback: (task: TaskData) => void,
    existingTasks: TaskData[] = []
  ) {
    super(app);
    this.addTaskCallback = addTaskCallback;
    this.existingTags = new Set<string>();
  }

  async openModal() {
    try {
      this.isDataLoading = true;
      await this.loadInitialData();
      this.isDataLoading = false;
      this.open();
    } catch (error) {
      console.error("Failed to load modal data:", error);
    }
  }

  protected async loadInitialData() {
    try {
        // Load projects first and store full file references
        this.projectFiles = await getProjectFiles(this.app);
        this.projects = this.projectFiles.map(file => file.basename);
        console.log("Projects loaded:", this.projects);

        // Then load tags
        await this.loadExistingTags();
        
        // Get active file
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.fileId = activeFile.path;
        }
    } catch (error) {
        console.error("Error loading initial data:", error);
    }
  }

  public async initializeData() {
    return this.loadInitialData();
  }

  private async loadExistingTags() {
    // Collect tags from vault
    const files = this.app.vault.getMarkdownFiles();
    const tags = new Set<string>();
    
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.tags) {
        cache.tags.forEach(tag => {
          // Remove # from beginning and add to set
          tags.add(tag.tag.replace('#', ''));
        });
      }
    }
    
    this.existingTags = tags;
  }

  private async loadProjects() {
    try {
        console.log("Loading projects...");
        const projectFiles = await getProjectFiles(this.app);
        console.log("Project files:", projectFiles);
        this.projects = projectFiles.map(file => file.basename);
        console.log("Projects loaded for dropdown:", this.projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        this.projects = [];
    }
  }

  onOpen() {
    if (this.isDataLoading) {
      this.contentEl.empty();
      this.contentEl.createEl("div", { text: "Loading..." });
      return;
    }

    this.contentEl.empty();
    this.renderModalContent();
  }

  protected renderModalContent() {
    // Header
    this.contentEl.createEl("h2", { 
      text: "Add a new task",
      cls: "modal-title" 
    });

    // Project Selector
    new Setting(this.contentEl)
      .setName("Project")
      .setDesc("Select a project")
      .addDropdown(dropdown => {
        console.log("Creating dropdown with projects:", this.projects);
        dropdown.addOption("", "Select a project");
        this.projects.forEach(project => {
            dropdown.addOption(project, project);
        });
        dropdown.setValue(this.taskProject);
        dropdown.onChange(value => this.taskProject = value);
      });

    // Task Name
    new Setting(this.contentEl)
      .setName("Task Name")
      .setDesc("Enter the name of the task")
      .addText(text => text
        .setPlaceholder("Task name")
        .setValue(this.taskName)
        .onChange(value => {
          this.taskName = value;
          this.updatePreview();
        }));

    // Tags Section
    const tagContainer = this.contentEl.createDiv("tag-container");
    new Setting(tagContainer)
      .setName("Tags")
      .setDesc("Enter tags (press Enter to add)")
      .addText(text => {
        text.setPlaceholder("Add tag...");
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.addTag(text.getValue());
            text.setValue("");
          }
        });
        
        // Add tag suggestions
        const datalist = text.inputEl.createEl("datalist", {
          attr: { id: "existing-tags" }
        });
        this.existingTags.forEach(tag => {
          datalist.createEl("option", { value: tag });
        });
        text.inputEl.setAttribute("list", "existing-tags");
      });

    // Tag List
    this.tagListEl = tagContainer.createDiv("tag-list");
    this.renderTags();

    // Date Picker
    new Setting(this.contentEl)
      .setName("Due Date")
      .setDesc("Select due date")
      .addText(text => {
        text.inputEl.type = "date";  // Convert to date input
        text
          .setValue(this.taskDate)
          .onChange(value => {
            this.taskDate = value;
            this.updatePreview();
          });
      });

    // Checklist Toggle
    new Setting(this.contentEl)
      .setName("Add to Checklist")
      .setDesc("Mark as a checklist item")
      .addToggle(toggle => {
        toggle.setValue(this.taskChecklist)
          .onChange(value => {
            this.taskChecklist = value;
            this.updatePreview();
          });
      });

    // Preview Section
    const previewSection = this.contentEl.createDiv("preview-section");
    previewSection.createEl("h3", { text: "Preview" });
    this.previewEl = previewSection.createDiv("preview-content");
    this.updatePreview();

    // Buttons
    const buttonContainer = this.contentEl.createDiv("button-container");
    const submitBtn = buttonContainer.createEl("button", {
      text: "Add Task",
      cls: "mod-cta"
    });
    submitBtn.addEventListener("click", () => this.submitTask());

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel"
    });
    cancelBtn.addEventListener("click", () => this.close());

    this.addStyles();
  }

  /**
   * Adds a new tag to the task
   * @param tag - The tag to be added
   */
  protected addTag(tag: string): void {
    if (tag && !this.taskTags.includes(tag)) {
      this.taskTags.push(tag.replace('#', '')); // Remove # if present
      this.renderTags();
      this.updatePreview();
    }
  }

  protected renderTags() {
    if (!this.tagListEl) return;
    
    this.tagListEl.empty();
    this.taskTags.forEach(tag => {
      const tagEl = this.tagListEl.createEl("span", { 
        text: `#${tag}`,
        cls: "tag"
      });
      const removeBtn = tagEl.createEl("span", {
        text: "×",
        cls: "tag-remove"
      });
      removeBtn.addEventListener("click", () => {
        this.taskTags = this.taskTags.filter(t => t !== tag);
        this.renderTags();
        this.updatePreview();
      });
    });
  }

  protected updatePreview() {
    if (!this.previewEl) return;
    
    this.previewEl.empty();
    const preview = this.previewEl.createEl("div", { cls: "task-preview" });
    
    if (this.taskChecklist) {
      preview.createEl("input", { 
        type: "checkbox",
        cls: "task-checkbox"
      });
    }
    
    preview.createEl("span", { 
      text: this.taskName || "Task name",
      cls: "preview-name"
    });
    
    if (this.taskProject) {
      preview.createEl("span", { 
        text: `[${this.taskProject}]`,
        cls: "preview-project"
      });
    }

    if (this.taskTags.length > 0) {
      const tags = preview.createEl("span", { cls: "preview-tags" });
      this.taskTags.forEach(tag => {
        tags.createEl("span", { 
          text: `#${tag}`,
          cls: "preview-tag"
        });
      });
    }
    
    if (this.taskDate) {
      preview.createEl("span", { 
        text: `(${this.taskDate})`,
        cls: "preview-date"
      });
    }
  }

  protected async submitTask() {
    if (!this.taskName) {
      const errorEl = this.contentEl.createEl("p", {
        text: "Task name is required",
        cls: "error-message"
      });
      setTimeout(() => errorEl.remove(), 3000);
      return;
    }

    const task: TaskData = {
      name: this.taskName,
      tags: this.taskTags,
      date: this.taskDate,
      checklist: this.taskChecklist,
      project: this.taskProject || undefined,
      fileId: this.fileId
    };

    // If task has a project, append it to project file first
    if (task.project) {
        await this.appendToProjectFile(task);
    }

    await this.addTaskCallback(task);
    this.close();
}

protected async appendToProjectFile(task: TaskData): Promise<void> {
    if (!task.project) return;
    
    const projectFile = this.projectFiles.find(file => file.basename === task.project);
    
    if (!projectFile) {
        console.error(`Project file not found: ${task.project}`);
        return;
    }

    try {
        const content = await this.app.vault.read(projectFile);
        const lines = content.split('\n');
        const taskLine = this.formatTaskLine(task);
        
        // Find the "## Tasks" section
        const tasksIndex = lines.findIndex(line => line.trim() === '## Tasks');
        
        if (tasksIndex === -1) {
            console.error('No "## Tasks" section found in project file');
            return;
        }

        // Insert task right after the "## Tasks" line
        lines.splice(tasksIndex + 1, 0, taskLine);
        
        await this.app.vault.modify(projectFile, lines.join('\n'));
    } catch (error) {
        console.error('Error appending task to project file:', error);
    }
}

protected formatTaskLine(task: TaskData): string {
    return `- [${task.checklist ? 'x' : ' '}] ${task.name}${
        task.tags.length ? ` ${task.tags.map(tag => `#${tag}`).join(' ')}` : ''
    }${task.date ? ` (${task.date})` : ''}\n`;
}

protected async removeFromProjectFile(task: TaskData): Promise<void> {
    // existing implementation
}

  private addStyles() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .tag-container { margin: 1em 0; }
      .tag-list { display: flex; flex-wrap: wrap; gap: 0.5em; margin-top: 0.5em; }
      .tag { 
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        padding: 2px 8px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
      }
      .tag-remove {
        margin-left: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      .preview-section {
        margin: 1em 0;
        padding: 1em;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
      }
      .preview-tag {
        color: var(--text-accent);
        margin-right: 0.5em;
      }
      .preview-date {
        color: var(--text-muted);
        margin-left: 0.5em;
      }
      .error-message {
        color: var(--text-error);
        margin-top: 1em;
      }
      .button-container {
        display: flex;
        gap: 1em;
        justify-content: flex-end;
        margin-top: 1em;
      }
    `;
    document.head.appendChild(styleEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    document.head.querySelectorAll('style').forEach(style => {
      if (style.textContent?.includes('.tag-container')) {
        style.remove();
      }
    });
  }
}

// EditTaskModal.ts
export class EditTaskModal extends TaskModal {
  private originalTask: TaskData;  // Add this property declaration
  private updateCallback: (task: TaskData) => Promise<void>;  // Add this property declaration

  constructor(
    app: App,
    task: TaskData,
    updateCallback: (task: TaskData) => Promise<void>
  ) {
    super(app, () => {});
    this.originalTask = task;
    this.updateCallback = updateCallback;
    
    // Pre-fill task data
    this.taskName = task.name;
    this.taskTags = [...task.tags];
    this.taskDate = task.date;
    this.taskChecklist = task.checklist;
    this.taskProject = task.project || "";
    this.fileId = task.fileId || "";
    
    // Open modal
    this.openModal();
  }

  async openModal() {
    try {
      this.isDataLoading = true;
      await this.initializeData();
      this.isDataLoading = false;
      this.open();
    } catch (error) {
      console.error("Failed to load modal data:", error);
    }
  }

  protected renderModalContent() {
    super.renderModalContent();
    
    // Update title
    const titleEl = this.contentEl.querySelector('.modal-title');
    if (titleEl) {
      titleEl.textContent = "Edit Task";
    }

    // Update button
    const submitBtn = this.contentEl.querySelector('.mod-cta');
    if (submitBtn) {
      submitBtn.textContent = "Update Task";
    }
  }

  protected async appendToProjectFile(task: TaskData): Promise<void> {
    if (!task.project) return;
    
    const projectFile = this.projectFiles.find(file => file.basename === task.project);
    
    if (!projectFile) {
        console.error(`Project file not found: ${task.project}`);
        return;
    }

    try {
        const content = await this.app.vault.read(projectFile);
        const lines = content.split('\n');
        const taskLine = this.formatTaskLine(task);
        
        // Find the "## Tasks" section
        const tasksIndex = lines.findIndex(line => line.trim() === '## Tasks');
        
        if (tasksIndex === -1) {
            console.error('No "## Tasks" section found in project file');
            return;
        }

        // Insert task right after the "## Tasks" line
        lines.splice(tasksIndex + 1, 0, taskLine);
        
        await this.app.vault.modify(projectFile, lines.join('\n'));
    } catch (error) {
        console.error('Error appending task to project file:', error);
    }
}
}
