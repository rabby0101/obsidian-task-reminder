// EditTaskModal.ts
import { App, Modal, Setting, TFile, getAllTags } from 'obsidian';
import { TaskModal } from "./TaskModal";

interface TaskData {
  name: string;
  tags: string[];
  date: string;
  checklist: boolean;
  project?: string;
  fileId?: string; // Add fileId
}

export class EditTaskModal extends TaskModal {
  protected originalTask: TaskData;
  protected updateCallback: (task: TaskData | null) => Promise<void>;
  private allVaultTags: string[] = [];

  constructor(
    app: App,
    task: TaskData,
    updateCallback: (task: TaskData | null) => Promise<void>
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
  }

  // Add method to fetch tags from vault
  private async loadVaultTags() {
    const tags = new Set<string>();
    
    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();
    
    for (const file of files) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.tags) {
            cache.tags.forEach(tag => {
                // Remove # from tag
                tags.add(tag.tag.replace('#', ''));
            });
        }
    }
    
    this.allVaultTags = Array.from(tags);
  }

  async openModal() {
    try {
      this.isDataLoading = true;
      await this.loadVaultTags();
      await this.loadInitialData();
      this.isDataLoading = false;
      this.open();
    } catch (error) {
      console.error("Failed to load modal data:", error);
    }
  }

  protected renderModalContent() {
    if (this.isDataLoading) {
      this.contentEl.empty();
      this.contentEl.createEl("div", { text: "Loading..." });
      return;
    }

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("edit-task-modal");

    // Header with back button
    const headerEl = contentEl.createEl("div", { cls: "modal-header" });
    const titleEl = headerEl.createEl("h2", { text: "Edit Task", cls: "modal-title" });

    // Main form container
    const formEl = contentEl.createEl("div", { cls: "modal-form" });

    // Project selector at the top
    new Setting(formEl)
        .setClass("project-selector")
        .setName("Project")
        .addDropdown(dropdown => {
            dropdown.addOption("", "No Project");
            this.projects.forEach(project => dropdown.addOption(project, project));
            dropdown.setValue(this.taskProject);
            dropdown.onChange(async value => {
                this.taskProject = value;
                this.updatePreview();
            });
        });

    // Task name with validation
    new Setting(formEl)
        .setClass("task-name-input")
        .setName("Task")
        .addText(text => {
            text.setValue(this.taskName)
                .setPlaceholder("What needs to be done?")
                .onChange(value => {
                    this.taskName = value;
                    this.updatePreview();
                });
        });

    // Tags with autocomplete
    this.renderTagSection(formEl);

    // Date picker with calendar
    new Setting(formEl)
        .setClass("date-picker")
        .setName("Due Date")
        .addText(text => {
            text.setPlaceholder("YYYY-MM-DD")
                .setValue(this.taskDate)
                .then(() => {
                    text.inputEl.type = "date";
                    text.inputEl.classList.add("task-date-input");
                });
            text.onChange(value => {
                this.taskDate = value;
                this.updatePreview();
            });
        });

    // Completion status
    new Setting(formEl)
        .setClass("completion-toggle")
        .setName("Status")
        .addToggle(toggle => {
            toggle.setValue(this.taskChecklist)
                .setTooltip("Mark as complete")
                .onChange(value => {
                    this.taskChecklist = value;
                    this.updatePreview();
                });
        });

    // Preview section
    const previewEl = contentEl.createEl("div", { cls: "preview-section" });
    previewEl.createEl("h3", { text: "Preview", cls: "preview-header" });
    this.previewEl = previewEl.createEl("div", { cls: "preview-content" });
    this.updatePreview();

    // Action buttons
    const buttonContainer = contentEl.createEl("div", { cls: "modal-button-container" });

    // Add delete button
    const deleteBtn = buttonContainer.createEl("button", {
        text: "Delete Task",
        cls: "mod-warning"
    });
    deleteBtn.addEventListener("click", () => this.deleteTask());

    // Update and Cancel buttons
    const updateBtn = buttonContainer.createEl("button", {
        text: "Update Task",
        cls: "mod-cta"
    });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });

    updateBtn.addEventListener("click", () => this.submitTask());
    cancelBtn.addEventListener("click", () => this.close());
  }

  private renderTagSection(container: HTMLElement) {
    const tagContainer = container.createDiv({ cls: "tag-section" });
    
    new Setting(tagContainer)
        .setClass("tag-input-container")
        .setName("Tags")
        .addText(text => {
            text.setPlaceholder("Add tags...")
                .onChange(value => {
                    const suggestionsContainer = tagContainer.querySelector(".tag-suggestions");
                    if (suggestionsContainer) {
                        this.updateTagSuggestions(value, suggestionsContainer as HTMLElement);
                    }
                });

            // Add suggestions container
            const suggestionsContainer = tagContainer.createDiv({ cls: "tag-suggestions" });
            
            // Handle tag input keydown
            text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const value = text.getValue().trim();
                    if (value) {
                        this.addTag(value);
                        text.setValue("");
                        suggestionsContainer.empty();
                    }
                }
            });
        });

    // Render existing tags
    const tagListEl = tagContainer.createDiv({ cls: "tag-list" });
    this.renderExistingTags(tagListEl);
  }

  private updateTagSuggestions(inputValue: string, container: HTMLElement) {
    // Clear previous suggestions
    container.empty();
    
    if (!inputValue) {
        return;
    }

    // Filter tags that match input
    const suggestions = this.allVaultTags
        .filter(tag => 
            tag.toLowerCase().includes(inputValue.toLowerCase()) && 
            !this.taskTags.includes(tag)
        )
        .slice(0, 5); // Limit to 5 suggestions

    // Create suggestion elements
    suggestions.forEach(tag => {
        const suggestionEl = container.createDiv({ 
            cls: "tag-suggestion",
            text: tag 
        });
        
        suggestionEl.addEventListener("click", () => {
            this.addTag(tag);
            // Clear input and suggestions
            const inputEl = container.parentElement?.querySelector("input");
            if (inputEl) {
                (inputEl as HTMLInputElement).value = "";
            }
            container.empty();
        });
    });
  }

  private renderExistingTags(container: HTMLElement) {
    // Clear existing tags
    container.empty();
    
    // Create and render tag elements
    this.taskTags.forEach(tag => {
        const tagEl = container.createDiv({ cls: "tag-item" });
        
        // Create tag text
        tagEl.createSpan({ text: tag });
        
        // Create remove button
        const removeBtn = tagEl.createSpan({
            cls: "tag-remove",
            text: "×"
        });
        
        // Add click handler to remove tag
        removeBtn.addEventListener("click", () => {
            this.taskTags = this.taskTags.filter(t => t !== tag);
            this.renderExistingTags(container);
            this.updatePreview();
        });
    });
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

    const updatedTask: TaskData = {
      name: this.taskName,
      tags: this.taskTags,
      date: this.taskDate,
      checklist: this.taskChecklist,
      project: this.taskProject || undefined,
      fileId: this.fileId
    };

    try {
        // Handle project changes
        if (updatedTask.project !== this.originalTask.project) {
            // Remove from old project if it existed
            if (this.originalTask.project) {
                await this.removeFromProjectFile(this.originalTask);
            }
            // Add to new project if selected
            if (updatedTask.project) {
                await this.appendToProjectFile(updatedTask);
            }
        } else if (updatedTask.project) {
            // Update existing project task if project hasn't changed
            await this.updateInProjectFile(updatedTask);
        }

        // Update in plugin data
        await this.updateCallback(updatedTask);
        this.close();
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

protected async removeFromProjectFile(task: TaskData): Promise<void> {
    if (!task.project) return;
    
    const projectFile = this.projectFiles.find(file => file.basename === task.project);
    if (!projectFile) return;

    try {
        const content = await this.app.vault.read(projectFile);
        const lines = content.split('\n');
        const escapedTaskName = task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskRegex = new RegExp(`^- \\[.\\] ${escapedTaskName}(?:[^\\n]*)`);
        
        // Find the tasks section
        const tasksIndex = lines.findIndex(line => line.trim() === '## Tasks');
        if (tasksIndex === -1) return;

        // Remove task only from Tasks section
        const filteredLines = lines.filter((line, index) => {
            if (index <= tasksIndex) return true; // Keep everything before Tasks section
            if (line.startsWith('#')) return true; // Keep other sections
            return !taskRegex.test(line); // Remove matching task
        });
        
        if (lines.length !== filteredLines.length) {
            await this.app.vault.modify(projectFile, filteredLines.join('\n'));
        }
    } catch (error) {
        console.error('Error removing task from project file:', error);
    }
}

protected async updateInProjectFile(task: TaskData): Promise<void> {
    if (!task.project) return;
    
    const projectFile = this.projectFiles.find(file => file.basename === task.project);
    if (!projectFile) return;

    try {
        const content = await this.app.vault.read(projectFile);
        const lines = content.split('\n');
        const escapedTaskName = this.originalTask.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskRegex = new RegExp(`^- \\[.\\] ${escapedTaskName}(?:[^\\n]*)`);
        
        // Find the tasks section
        const tasksIndex = lines.findIndex(line => line.trim() === '## Tasks');
        if (tasksIndex === -1) {
            console.error('No "## Tasks" section found in project file');
            return;
        }

        // Find the task within the Tasks section
        let updated = false;
        for (let i = tasksIndex + 1; i < lines.length; i++) {
            if (lines[i].startsWith('#')) break; // Stop at next section
            if (taskRegex.test(lines[i])) {
                lines[i] = this.formatTaskLine(task).trim();
                updated = true;
                break;
            }
        }

        if (updated) {
            await this.app.vault.modify(projectFile, lines.join('\n'));
        }
    } catch (error) {
        console.error('Error updating task in project file:', error);
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

protected formatTaskLine(task: TaskData): string {
    return `- [${task.checklist ? 'x' : ' '}] ${task.name}${
        task.tags.length ? ` ${task.tags.map(tag => `#${tag}`).join(' ')}` : ''
    }${task.date ? ` (${task.date})` : ''}\n`;
}

private async deleteTask() {
    try {
        // Remove from project file if it exists
        if (this.originalTask.project) {
            await this.removeFromProjectFile(this.originalTask);
        }

        // Remove from original file if it exists
        if (this.originalTask.fileId) {
            await this.removeFromSourceFile(this.originalTask);
        }

        // Call the handler to sync the UI
        await this.updateCallback(null);
        this.close();
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

private async removeFromSourceFile(task: TaskData): Promise<void> {
    if (!task.fileId) return;
    
    const file = this.app.vault.getAbstractFileByPath(task.fileId);
    if (!(file instanceof TFile)) return;

    try {
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const escapedTaskName = task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskRegex = new RegExp(`^- \\[.\\] ${escapedTaskName}(?:[^\\n]*)`);
        
        const filteredLines = lines.filter(line => !taskRegex.test(line));
        
        if (lines.length !== filteredLines.length) {
            await this.app.vault.modify(file, filteredLines.join('\n'));
        }
    } catch (error) {
        console.error('Error removing task from source file:', error);
    }
}
}