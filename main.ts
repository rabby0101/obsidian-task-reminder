// main.ts
import { App, ItemView, Plugin, WorkspaceLeaf, TFile, moment, setIcon } from "obsidian";
import { TaskModal } from "./TaskModal";
import { EditTaskModal } from "./EditTaskModal";
import { 
    AppleReminderSettings, 
    DEFAULT_SETTINGS, 
    AppleReminderSettingTab 
} from './settings';

declare module "obsidian" {
    interface App {
        plugins: {
            getPlugin(id: string): any;
            enablePlugin(id: string): Promise<void>;
            disablePlugin(id: string): Promise<void>;
            plugins: Record<string, any>;
        };
    }
}

interface TaskData {
  name: string;
  date: string;
  checklist: boolean;
  tags: string[];
  project?: string;
  fileId?: string;
  priority?: number; // Add this line - using number for priority levels (e.g., 1, 2, 3)
}

export default class AppleReminderPlugin extends Plugin {
  settings: AppleReminderSettings;
  private data: { tasks: TaskData[] } = { tasks: [] };

  async onload() {
    await this.loadSettings();
    
    // Add settings tab
    this.addSettingTab(new AppleReminderSettingTab(this.app, this));
    
    this.data = await this.loadData() || { tasks: [] };
    
    // Ensure existing tasks have tags array
    this.data.tasks = this.data.tasks.map(task => ({
      ...task,
      tags: Array.isArray(task.tags) ? task.tags : []
    }));

    console.log("Apple Reminder Plugin loaded");

    const ribbonIcon = this.addRibbonIcon("check-circle", "Apple Reminder", () => {
      this.openReminderPanel();
    });
    ribbonIcon.addClass("apple-reminder-ribbon");

    this.registerView("apple-reminder-view", (leaf: WorkspaceLeaf) => 
      new ReminderView(leaf, this.data.tasks, async (tasks: TaskData[]) => {
        this.data.tasks = tasks;
        await this.saveData(this.data);
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    console.log("Apple Reminder Plugin unloaded");
    if (this.app.workspace) {
      this.app.workspace.detachLeavesOfType("apple-reminder-view");
    }
  }

  async openReminderPanel() {
    if (!this.app.workspace) {
      console.error("Workspace is not available");
      return;
    }

    const leaves = this.app.workspace.getLeavesOfType("apple-reminder-view");
    if (leaves.length === 0) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: "apple-reminder-view",
        });
      }
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }
}

class ReminderView extends ItemView {
  private tasks: TaskData[];
  private buttonContainer: HTMLElement;
  private tasksContainer: HTMLElement;
  private saveCallback: (tasks: TaskData[]) => Promise<void>;
  private expandedTabId: string | null = null;
  private plugin: AppleReminderPlugin;  // Add this line
  private projectFiles: TFile[]; // Add this line

  constructor(
    leaf: WorkspaceLeaf, 
    initialTasks: TaskData[],
    saveCallback: (tasks: TaskData[]) => Promise<void>
  ) {
    super(leaf);
    this.plugin = this.app.plugins.getPlugin("apple-reminder") as AppleReminderPlugin;
    this.tasks = initialTasks;
    this.saveCallback = saveCallback;
  }

  getViewType(): string {
    return "apple-reminder-view";
  }

  getDisplayText(): string {
    return "Apple Reminder";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Keep only the top "New Task" button
    const topButtonContainer = contentEl.createDiv("nav-action-button");
    const topAddButton = topButtonContainer.createEl("button", {
        text: "New Task",
        cls: "mod-cta"
    });
    
    topAddButton.addEventListener("click", async () => {
        const modal = new TaskModal(this.app, async (task: TaskData) => {
            await this.addTask(task);
        });
        await modal.openModal();
    });

    // Create container only for tasks
    this.tasksContainer = contentEl.createEl("div", { cls: "reminder-tasks-container" });
    this.tasksContainer.style.padding = "10px";

    this.renderTabs();
    // Remove the projects section call
  }

  private getCompletedTasks(): TaskData[] {
    return this.tasks.filter(task => task.checklist);
  }

  private getTodayTasks(): TaskData[] {
    const today = moment().format('YYYY-MM-DD');
    return this.tasks.filter(task => 
        task.date === today && !task.checklist
    );
  }

  private getScheduledTasks(): TaskData[] {
    const today = moment().format('YYYY-MM-DD');
    return this.tasks.filter(task => 
        task.date > today && !task.checklist
    );
  }

  private renderTabs() {
    // Clear only the tabs container instead of the entire tasks container
    const existingTabsContainer = this.tasksContainer.querySelector(".reminder-tabs");
    if (existingTabsContainer) {
        existingTabsContainer.remove();
    }
    
    const tabsContainer = this.tasksContainer.createEl("div", { cls: "reminder-tabs" });

    // Today's Tasks Tab
    const todayTasks = this.getTodayTasks();
    this.createTab(
        tabsContainer,
        "Today",
        todayTasks,
        "today-tab",
        "sun",
        "today-icon"
    );

    // Scheduled Tasks Tab
    const scheduledTasks = this.getScheduledTasks();
    this.createTab(
        tabsContainer,
        "Scheduled",
        scheduledTasks,
        "scheduled-tab",
        "calendar",
        "scheduled-icon"
    );

    // Completed Tasks Tab
    const completedTasks = this.getCompletedTasks();
    this.createTab(
        tabsContainer,
        "Completed",
        completedTasks,
        "completed-tab",
        "check-circle",
        "completed-icon"
    );

    // Insert tabs at the beginning of the container
    this.tasksContainer.insertBefore(tabsContainer, this.tasksContainer.firstChild);
}

  private createTab(
    container: HTMLElement,
    title: string,
    tasks: TaskData[],
    id: string,
    iconName: string,
    iconClass: string
  ): HTMLElement {
    const tabContainer = container.createEl("div", { 
        cls: `reminder-tab ${id}`
    });
    
    const header = tabContainer.createEl("div", {
        cls: "reminder-tab-header"
    });
    
    // Add collapse indicator
    const collapseIndicator = header.createEl("div", {
        cls: "nav-folder-collapse-indicator collapse-icon"
    });
    
    // Create header content wrapper
    const headerContent = header.createEl("div", {
        cls: "reminder-tab-header-content"
    });

    // Add icon
    const icon = headerContent.createEl("span");
    // Use calendar-clock for Today tab, otherwise use the provided icon
    setIcon(icon, id === 'today-tab' ? "calendar-clock" : iconName);
    icon.addClass("tab-icon", iconClass);
    
    headerContent.createEl("span", { text: title });
    headerContent.createEl("span", {
        text: String(tasks.length),
        cls: "task-count"
    });
    
    const content = tabContainer.createEl("div", {
        cls: "reminder-tab-content"
    });
    content.style.display = "none";
    
    header.addEventListener("click", () => {
        const isExpanded = content.style.display !== "none";
        const otherTab = id === 'today-tab' 
            ? container.querySelector('.scheduled-tab') as HTMLElement
            : container.querySelector('.today-tab') as HTMLElement;
        
        // Toggle current tab
        content.style.display = isExpanded ? "none" : "block";
        tabContainer.classList.toggle('is-expanded', !isExpanded);
        collapseIndicator.classList.toggle("is-collapsed", isExpanded);

        // Handle layout adjustment
        if (otherTab) {
            if (!isExpanded) {
                // When expanding, make sure other tab is full width but not expanded
                otherTab.classList.remove('is-expanded');
                const otherContent = otherTab.querySelector('.reminder-tab-content') as HTMLElement;
                if (otherContent) {
                    otherContent.style.display = "none";
                }
                const otherCollapseIndicator = otherTab.querySelector('.nav-folder-collapse-indicator') as HTMLElement;
                if (otherCollapseIndicator) {
                    otherCollapseIndicator.classList.add('is-collapsed');
                }
            } else {
                // When collapsing, check if other tab is expanded
                const otherIsExpanded = otherTab.classList.contains('is-expanded');
                if (!otherIsExpanded) {
                    // If other tab isn't expanded, reset to side by side
                    otherTab.classList.remove('is-expanded');
                }
            }
        }
    });

    if (tasks.length === 0) {
        content.createEl("p", {
            text: "No tasks",
            cls: "nav-file"
        });
    } else {
        tasks.forEach(task => {
            const taskItem = content.createEl("div", { 
                cls: "nav-file",
                attr: { 'data-task-id': task.fileId || '' }
            });
            
            const taskContent = taskItem.createEl("div", {
                cls: "nav-file-title",
                attr: {
                    'aria-label': 'Click to edit task',
                    'data-task-completed': task.checklist
                }
            });
            
            const checkbox = taskContent.createEl("input", {
                type: "checkbox",
                cls: "task-checkbox"
            });
            checkbox.checked = task.checklist;
            
            const taskDetails = taskContent.createEl("div", {
                cls: "nav-file-title-content"
            });

            // Task name
            taskDetails.createEl("strong", { text: task.name });
            
            // Project tag
            if (task.project) {
                const projectSpan = taskDetails.createEl("span", { 
                    cls: "task-project"
                });
                projectSpan.createEl("span", {
                    cls: "lucide-folder project-icon"
                });
                projectSpan.appendText(task.project);
            }

            // Tags
            if (task.tags && task.tags.length > 0) {
                const tagsContainer = taskDetails.createEl("span", { 
                    cls: "task-tags"
                });
                task.tags.forEach(tag => {
                    tagsContainer.createEl("span", {
                        text: tag,
                        cls: "preview-tag"
                    });
                });
            }
            
            // Date
            const dateSpan = taskDetails.createEl("span", {
                cls: "task-date"
            });
            dateSpan.createEl("span", {
                cls: "lucide-calendar-days date-icon"
            });
            dateSpan.appendText(task.date);

            // Add event listeners
            checkbox.addEventListener("change", async (e) => {
                e.stopPropagation();
                task.checklist = checkbox.checked;
                await this.saveCallback(this.tasks);
                if (task.project) await this.updateTaskInProjectFile(task);
                if (task.fileId) await this.updateTaskInFile(task);
                this.renderTabs();
            });

            taskContent.addEventListener("click", async (e) => {
                if (e.target === checkbox) return;
                e.stopPropagation();
                const modal = new EditTaskModal(this.app, task, async (updatedTask: TaskData | null) => {
                    if (updatedTask === null) {
                        await this.handleTaskDeletion(task);
                    } else {
                        const taskIndex = this.tasks.findIndex(t => 
                            t.name === task.name && t.date === task.date
                        );
                        if (taskIndex > -1) {
                            this.tasks[taskIndex] = updatedTask;
                        }
                    }
                    await this.saveCallback(this.tasks);
                    if (task.project) await this.updateTaskInProjectFile(task);
                    this.renderTabs();
                });
                await modal.openModal();
            });
        });
    }
    
    return tabContainer;
}

  async onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async addTask(task: TaskData) {
    if (!Array.isArray(task.tags)) {
      task.tags = [];
    }
    
    this.tasks.push(task);
    await this.saveCallback(this.tasks);
    
    if (task.fileId) {
      await this.updateTaskInFile(task);
    }
    
    if (task.project) {
      const projectFile = this.projectFiles.find(file => file.basename === task.project);
      if (projectFile) {
        await this.updateTaskInProjectFile(task);
      }
    }
    
    // Only re-render the tabs
    this.renderTabs();
  }

  private async updateTaskInProjectFile(task: TaskData) {
    if (!task.project) return;
    
    const projectFiles = await getProjectFiles(this.app);
    const projectFile = projectFiles.find(file => file.basename === task.project);
    
    if (!projectFile) return;

    try {
        const content = await this.app.vault.read(projectFile);
        const lines = content.split('\n');
        
        // More precise task matching including tags and date
        const escapedTaskName = task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskRegex = new RegExp(`^- \\[.\\] ${escapedTaskName}(?:[^\\n]*)`);
        
        let updated = false;
        for (let i = 0; i < lines.length; i++) {
            if (taskRegex.test(lines[i])) {
                const checkbox = task.checklist ? 'x' : ' ';
                const tags = task.tags.length ? ` ${task.tags.map(tag => `#${tag}`).join(' ')}` : '';
                const date = task.date ? ` (${task.date})` : '';
                lines[i] = `- [${checkbox}] ${task.name}${tags}${date}`;
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

  private async updateTaskInFile(task: TaskData) {
    if (!task.fileId) return;
    
    const file = this.app.vault.getAbstractFileByPath(task.fileId);
    if (!(file instanceof TFile)) return;

    try {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      
      // More precise task matching including tags and date
      const escapedTaskName = task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const taskRegex = new RegExp(`^- \\[.\\] ${escapedTaskName}(?:[^\\n]*)`);
      
      let updated = false;
      for (let i = 0; i < lines.length; i++) {
        if (taskRegex.test(lines[i])) {
          const checkbox = task.checklist ? 'x' : ' ';
          const tags = task.tags.length ? ` ${task.tags.map(tag => `#${tag}`).join(' ')}` : '';
          const date = task.date ? ` (${task.date})` : '';
          lines[i] = `- [${checkbox}] ${task.name}${tags}${date}`;
          updated = true;
          break;
        }
      }

      if (updated) {
        await this.app.vault.modify(file, lines.join('\n'));
      }
    } catch (error) {
      console.error('Error updating task in file:', error);
    }
  }

  private createAddButton() {
    const taskAddButton = document.createElement('button');
    taskAddButton.setText('Add Task');
    taskAddButton.addEventListener('click', () => {
      // Your click handler logic
    });
    return taskAddButton;
  }

  private formatDate(date: string): string {
    return moment(date).format(this.plugin.settings.dateFormat);
  }

  private renderTask(task: TaskData, container: HTMLElement) {
    // Use settings for rendering
    if (this.plugin.settings.showProjectIcons && task.project) {
        // Add project icon
    }
    
    if (this.plugin.settings.showDateInTask && task.date) {
        // Show date
    }
    
    if (this.plugin.settings.enablePriorities && task.priority) {
        // Show priority
    }
  }

  // Keep this helper method as it's used by task operations
  private parseProjectTasks(content: string): TaskData[] {
    const tasks: TaskData[] = [];
    const lines = content.split('\n');
    let inTasksSection = false;

    for (const line of lines) {
        if (line.trim() === '## Tasks') {
            inTasksSection = true;
            continue;
        }
        
        if (inTasksSection) {
            if (line.startsWith('#')) {
                break; // Exit if we hit another section
            }
            
            const taskMatch = line.match(/^- \[([ x])\] (.+)$/);
            if (taskMatch) {
                const task: TaskData = {
                    name: taskMatch[2],
                    checklist: taskMatch[1] === 'x',
                    tags: [],
                    date: '',
                };
                
                // Extract tags if present
                const tags = task.name.match(/#[^\s]+/g);
                if (tags) {
                    task.tags = tags.map(tag => tag.substring(1));
                    task.name = task.name.replace(/#[^\s]+/g, '').trim();
                }
                
                // Extract date if present
                const dateMatch = task.name.match(/\((\d{4}-\d{2}-\d{2})\)/);
                if (dateMatch) {
                    task.date = dateMatch[1];
                    task.name = task.name.replace(/\(\d{4}-\d{2}-\d{2}\)/, '').trim();
                }
                
                tasks.push(task);
            }
        }
    }

    return tasks;
}

  // Remove these methods as they're no longer needed:
  // - renderProjectsSection()
  // - renderProjectTasks()
  // - parseProjectTasks()

  // Update task deletion to sync with project view
  private async handleTaskDeletion(task: TaskData) {
    // Remove from main tasks array
    this.tasks = this.tasks.filter(t => 
        !(t.name === task.name && t.date === task.date)
    );
    
    // Update project file if task was in a project
    if (task.project) {
        const projectFile = this.projectFiles.find(f => f.basename === task.project);
        if (!projectFile) return;  // Early return if project file not found
        
        // Remove task from project file
        await this.updateTaskInProjectFile(task);
    }
    
    await this.saveCallback(this.tasks);
    this.renderTabs();
}

}

export async function getProjectFiles(app: App): Promise<TFile[]> {
    const files = app.vault.getMarkdownFiles();
    return files.filter(file => {
        const metadata = app.metadataCache.getFileCache(file)?.frontmatter;
        return metadata?.type?.toLowerCase() === 'project' || 
               metadata?.type?.toLowerCase() === 'projects';
    });
}

