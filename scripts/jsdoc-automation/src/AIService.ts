import { ChatOpenAI } from "@langchain/openai";
import dotenv from 'dotenv';
import { ASTQueueItem, EnvUsage, OrganizedDocs, PluginDocumentation, TodoItem, TodoSection } from "./types/index.js";
import path from "path";
import { promises as fs } from 'fs';
import { Configuration } from "./Configuration.js";
import { TypeScriptParser } from './TypeScriptParser.js';
import { PROMPT_TEMPLATES } from "./utils/prompts.js";

// ToDo
// - Vet readme tomorrow
// - Debugging Tips - reference discord and eliz.gg
// - gh workflow - jsdoc & plugin docs - conditionally run either, dont write to files
// - bash script cleaner - check if compile, bash, AI





dotenv.config();

interface FileDocsGroup {
    filePath: string;
    classes: ASTQueueItem[];
    methods: ASTQueueItem[];
    interfaces: ASTQueueItem[];
    types: ASTQueueItem[];
    functions: ASTQueueItem[];
  }

/**
 * Service for interacting with OpenAI chat API.
 */
export class AIService {
    private chatModel: ChatOpenAI;

    /**
     * Constructor for initializing the ChatOpenAI instance.
     *
     * @param {Configuration} configuration - The configuration instance to be used
     * @throws {Error} If OPENAI_API_KEY environment variable is not set
     */
    constructor(private configuration: Configuration) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set');
        }
        this.chatModel = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    /**
     * Generates a comment based on the specified prompt by invoking the chat model.
     * @param {string} prompt - The prompt for which to generate a comment
     * @returns {Promise<string>} The generated comment
     */
    public async generateComment(prompt: string): Promise<string> {
        try {
            const response = await this.chatModel.invoke(prompt);
            return response.content as string;
        } catch (error) {
            this.handleAPIError(error as Error);
            return '';
        }
    }

    public async generatePluginDocumentation({
        existingDocs,
        packageJson,
        readmeContent,
        todoItems,
        envUsages
    }: {
        existingDocs: ASTQueueItem[];
        packageJson: any;
        readmeContent?: string;
        todoItems: TodoItem[];
        envUsages: EnvUsage[];
    }): Promise<PluginDocumentation & { todos: string }> {
        const organizedDocs = this.organizeDocumentation(existingDocs);

        // Read the index.ts file
        // Read the index.ts file
        const indexPath = path.join(this.configuration.absolutePath, 'src', 'index.ts');
        const typeScriptParser = new TypeScriptParser();
        const exports = typeScriptParser.extractExports(indexPath);

        // Extract actions, providers, and evaluators from the index.ts content
        // Generate documentation for actions
        const actionsDocumentation = await this.generateActionsDocumentation(exports.actions);

        // Generate documentation for providers
        const providersDocumentation = await this.generateProvidersDocumentation(exports.providers);

        // Generate documentation for evaluators
        const evaluatorsDocumentation = await this.generateEvaluatorsDocumentation(exports.evaluators);


        // write organizedDocs into a json in /here directory
        const jsonPath = path.join(this.configuration.absolutePath, 'here', 'organizedDocs.json');
        fs.writeFile(jsonPath, JSON.stringify(organizedDocs, null, 2));

        const [overview, installation, configuration, usage, apiRef, troubleshooting, todoSection] = await Promise.all([
            this.generateOverview(organizedDocs, packageJson),
            this.generateInstallation(packageJson),
            this.generateConfiguration(envUsages),
            this.generateUsage(organizedDocs, packageJson),
            this.generateApiReference(organizedDocs),
            this.generateTroubleshooting(organizedDocs, packageJson),
            this.generateTodoSection(todoItems)
        ]);

        return {
            overview,
            installation,
            configuration,
            usage,
            apiReference: apiRef,
            troubleshooting,
            todos: todoSection.todos,
            actionsDocumentation, // Added actions documentation
            providersDocumentation, // Added providers documentation
            evaluatorsDocumentation // Added evaluators documentation
          };
    }

    private async generateOverview(docs: OrganizedDocs, packageJson: any): Promise<string> {
        const prompt = PROMPT_TEMPLATES.overview(packageJson, docs);
        try {
            const overview = await this.generateComment(prompt);
            return overview;
        } catch (error) {
            console.error('Error generating overview:', error);
            return `# ${packageJson.name}\n\nNo overview available. Please check package documentation.`;
        }
    }

    private async generateInstallation(packageJson: any): Promise<string> {
        const indexPath = path.join(this.configuration.absolutePath, 'src/index.ts');
        let mainExport = 'plugin';
        let exportName = packageJson.name.split('/').pop() + 'Plugin';

        try {
            const indexContent = await fs.readFile(indexPath, { encoding: 'utf8' });
            const exportMatch = indexContent.match(/export const (\w+):/);
            if (exportMatch) {
                exportName = exportMatch[1];
            }

            const prompt = `Generate installation and integration instructions for this ElizaOS plugin:

            Plugin name: ${packageJson.name}
            Main export: ${exportName}
            Index file exports:
            ${indexContent}
            Dependencies: ${JSON.stringify(packageJson.dependencies || {}, null, 2)}
            Peer dependencies: ${JSON.stringify(packageJson.peerDependencies || {}, null, 2)}

            This is a plugin for the ElizaOS agent system. Generate comprehensive installation instructions that include:

            1. How to add the plugin to your ElizaOS project:
               - First, explain that users need to add the following to their agent/package.json dependencies:
                 \`\`\`json
                 {
                   "dependencies": {
                     "${packageJson.name}": "workspace:*"
                   }
                 }
                 \`\`\`
               - Then, explain they need to:
                 1. cd into the agent/ directory
                 2. Run pnpm install to install the new dependency
                 3. Run pnpm build to build the project with the new plugin

            2. After installation, show how to import and use the plugin:
               - Import syntax using: import { ${exportName} } from "${packageJson.name}";
               - How to add it to the AgentRuntime plugins array

            3. Integration example showing the complete setup:
               \`\`\`typescript
               import { ${exportName} } from "${packageJson.name}";

               return new AgentRuntime({
                   // other configuration...
                   plugins: [
                       ${exportName},
                       // other plugins...
                   ],
               });
               \`\`\`

            4. Verification steps to ensure successful integration
                - for this step just tell the user to ensure they see ["✓ Registering action: <plugin actions>"] in the console

            Format the response in markdown, with clear section headers and step-by-step instructions. Emphasize that this is a workspace package that needs to be added to agent/package.json and then built.`;

            return await this.generateComment(prompt);
        } catch (error) {
            console.error('Error reading index.ts:', error);
            return this.generateBasicInstallPrompt(packageJson);
        }
    }

    private async generateBasicInstallPrompt(packageJson: any): Promise<string> {
        console.log('AIService::generateInstallation threw an error, generating basic install prompt');
        const prompt = `Generate basic installation instructions for this ElizaOS plugin:

        Plugin name: ${packageJson.name}
        Dependencies: ${JSON.stringify(packageJson.dependencies || {}, null, 2)}
        Peer dependencies: ${JSON.stringify(packageJson.peerDependencies || {}, null, 2)}

        This is a plugin for the ElizaOS agent system. Include basic setup instructions.`;

        return await this.generateComment(prompt);
    }

    private async generateConfiguration(envUsages: EnvUsage[]): Promise<string> {
        const prompt = `Generate configuration documentation based on these environment variable usages:
        ${envUsages.map(item => `
        Environment Variable: ${item.code}
        Full Context: ${item.fullContext}
        `).join('\n')}
        Create comprehensive configuration documentation that:
        1. Lists all required environment variables and their purpose
        2. Return a full .env example file

        Inform the user that the configuration is done in the .env file.
        And to ensure the .env is set in the .gitignore file so it is not committed to the repository.

        Format the response in markdown with proper headings and code blocks.`;

        return await this.generateComment(prompt);
    }

    private async generateUsage(docs: OrganizedDocs, packageJson: any): Promise<string> {
        const fileGroups = this.groupDocsByFile(docs);
        const sections: string[] = [];

        // Generate documentation for each file without individual intros
        for (const fileGroup of fileGroups) {
          const fileDoc = await this.generateFileUsageDoc(fileGroup);
          if (fileDoc.trim()) {
            sections.push(fileDoc);
          }
        }

        return sections.join('\n\n');
      }

      private async generateApiReference(docs: OrganizedDocs): Promise<string> {
        const fileGroups = this.groupDocsByFile(docs);
        const sections: string[] = [];

        // Generate documentation for each file without individual intros
        for (const fileGroup of fileGroups) {
          const fileDoc = await this.generateFileApiDoc(fileGroup);
          if (fileDoc.trim()) {
            sections.push(fileDoc);
          }
        }

        return sections.join('\n\n');
      }

/**
 * Generates troubleshooting guide based on documentation and common patterns
 */
    // toDo - integrate w/ @Jin's discord scraper to pull solutions for known issues
    private async generateTroubleshooting(docs: OrganizedDocs, packageJson: any): Promise<string> {
        const prompt = `${PROMPT_TEMPLATES.troubleshooting}\n\nFor package: ${packageJson.name}\n\nWith content:\n${JSON.stringify(docs, null, 2)}`;
        return await this.generateComment(prompt);
    }

    /**
     * Generates TODO section documentation from found TODO comments
     */
    // toDo - integrate w/ @Jin's discord scraper to auto create GH issues/bounties
    private async generateTodoSection(todoItems: TodoItem[]): Promise<TodoSection> {
        if (todoItems.length === 0) {
            return { todos: "No TODO items found.", todoCount: 0 };
        }

        const prompt = `${PROMPT_TEMPLATES.todos}\n\nWith items:\n${todoItems.map(item =>
            `- Comment: ${item.comment}\n  Context: ${item.fullContext}`
        ).join('\n')}`;

        const todos = await this.generateComment(prompt);
        return { todos, todoCount: todoItems.length };
    }

    // should be moved to utils
    private organizeDocumentation(docs: ASTQueueItem[]): OrganizedDocs {
        return docs.reduce((acc: OrganizedDocs, doc) => {
            // Use nodeType to determine the category
            switch (doc.nodeType) {
                case 'ClassDeclaration':
                    acc.classes.push(doc);
                    break;
                case 'MethodDefinition':
                case 'TSMethodSignature':
                    acc.methods.push(doc);
                    break;
                case 'TSInterfaceDeclaration':
                    acc.interfaces.push(doc);
                    break;
                case 'TSTypeAliasDeclaration':
                    acc.types.push(doc);
                    break;
                case 'FunctionDeclaration':
                    acc.functions.push(doc);
                    break;
            }
            return acc;
        }, { classes: [], methods: [], interfaces: [], types: [], functions: [] });
    }

    private async generateActionsDocumentation(actionsFiles: string[]): Promise<string> {
        let documentation = '';

        for (const file of actionsFiles) {
            // Remove ./ prefix and ensure path includes src directory and .ts extension
            const relativePath = file.replace(/^\.\//, '');
            const filePath = path.join(this.configuration.absolutePath, 'src', relativePath + '.ts');

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                // Create an action object with relevant information
                const action = {
                    fileName: relativePath,
                    content: content,
                    // Extract action properties like name, similes, etc.
                    // You might want to parse the content to extract these
                    name: relativePath.split('/').pop()?.replace('.ts', ''),
                };

                const actionDocumentation = await this.generateActionDoc(action);
                if (actionDocumentation.trim()) {
                    documentation += actionDocumentation + '\n\n';
                }
            } catch (error) {
                console.warn(`Warning: Could not read action file ${filePath}:`, error);
                continue;
            }
        }

        if (!documentation.trim()) {
            return 'No actions documentation available.';
        }

        return documentation;
    }

    private async generateProvidersDocumentation(providersFiles: string[]): Promise<string> {
        let documentation = '';

        for (const file of providersFiles) {
            // Remove ./ prefix and ensure path includes src directory and .ts extension
            const relativePath = file.replace(/^\.\//, '');
            const filePath = path.join(this.configuration.absolutePath, 'src', relativePath + '.ts');

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                // Create a provider object with relevant information
                const provider = {
                    fileName: relativePath,
                    content: content,
                    // Extract provider properties
                    name: relativePath.split('/').pop()?.replace('.ts', ''),
                };

                const providerDocumentation = await this.generateProviderDoc(provider);
                if (providerDocumentation.trim()) {
                    documentation += providerDocumentation + '\n\n';
                }
            } catch (error) {
                console.warn(`Warning: Could not read provider file ${filePath}:`, error);
                continue;
            }
        }

        if (!documentation.trim()) {
            return 'No providers documentation available.';
        }

        return documentation;
    }

    private async generateEvaluatorsDocumentation(evaluatorsFiles: string[]): Promise<string> {
        let documentation = '';

        for (const file of evaluatorsFiles) {
            // Remove ./ prefix and ensure path includes src directory and .ts extension
            const relativePath = file.replace(/^\.\//, '');
            const filePath = path.join(this.configuration.absolutePath, 'src', relativePath + '.ts');

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const prompt = `Generate documentation for the following Evaluator:
                    \`\`\`typescript
                    ${content}
                    \`\`\`

                    Provide an overview of the evaluator's purpose and functionality.
                    Format in markdown without adding any additional headers.`;

                const evaluatorDocumentation = await this.generateComment(prompt);
                if (evaluatorDocumentation.trim()) {
                    documentation += `### ${relativePath}\n\n${evaluatorDocumentation}\n\n`;
                }
            } catch (error) {
                console.warn(`Warning: Could not read evaluator file ${filePath}:`, error);
                continue;
            }
        }

        if (!documentation.trim()) {
            return 'No evaluators documentation available.';
        }

        return documentation;
    }


      private groupDocsByFile(docs: OrganizedDocs): FileDocsGroup[] {
        // Get unique file paths
        const filePaths = new Set<string>();
        [...docs.classes, ...docs.methods, ...docs.interfaces, ...docs.types, ...docs.functions]
          .forEach(item => filePaths.add(item.filePath));

        // Create groups for each file path
        return Array.from(filePaths).map(filePath => {
          return {
            filePath,
            classes: docs.classes.filter(c => c.filePath === filePath),
            methods: docs.methods.filter(m => m.filePath === filePath),
            interfaces: docs.interfaces.filter(i => i.filePath === filePath),
            types: docs.types.filter(t => t.filePath === filePath),
            functions: docs.functions.filter(f => f.filePath === filePath)
          };
        });
      }

      private formatFilePath(filePath: string): string {
        // Get relative path from src directory
        const srcIndex = filePath.indexOf('/src/');
        if (srcIndex === -1) return filePath;

        const relativePath = filePath.slice(srcIndex + 5); // +5 to skip '/src/'
        return relativePath;
      }

      private async generateFileUsageDoc(fileGroup: FileDocsGroup): Promise<string> {
        const filePath = this.formatFilePath(fileGroup.filePath);
        const prompt = `${PROMPT_TEMPLATES.fileUsageDoc}\n\nFor file: ${filePath}\n\nWith components:\n${this.formatComponents(fileGroup)}`;
        const doc = await this.generateComment(prompt);
        return `### ${filePath}\n\n${doc}`;
    }

    private async generateFileApiDoc(fileGroup: FileDocsGroup): Promise<string> {
        const filePath = this.formatFilePath(fileGroup.filePath);
        const prompt = `${PROMPT_TEMPLATES.fileApiDoc}\n\nFor file: ${filePath}\n\nWith components:\n${this.formatComponents(fileGroup)}`;
        const doc = await this.generateComment(prompt);
        return `### ${filePath}\n\n${doc}`;
    }

    private formatComponents(fileGroup: FileDocsGroup): string {
        const sections: string[] = [];

        if (fileGroup.classes.length > 0) {
            sections.push('Classes:', fileGroup.classes.map(c => `- ${c.name}: ${c.jsDoc}`).join('\n'));
        }

        if (fileGroup.methods.length > 0) {
            sections.push('Methods:', fileGroup.methods.map(m => `- ${m.name}: ${m.jsDoc}`).join('\n'));
        }

        if (fileGroup.interfaces.length > 0) {
            sections.push('Interfaces:', fileGroup.interfaces.map(i => `- ${i.name}: ${i.jsDoc}`).join('\n'));
        }

        if (fileGroup.types.length > 0) {
            sections.push('Types:', fileGroup.types.map(t => `- ${t.name}: ${t.jsDoc}`).join('\n'));
        }

        if (fileGroup.functions.length > 0) {
            sections.push('Functions:', fileGroup.functions.map(f => `- ${f.name}: ${f.jsDoc}`).join('\n'));
        }

        return sections.join('\n\n');
    }

    private async generateActionDoc(action: any): Promise<string> {
        const prompt = `${PROMPT_TEMPLATES.actionDoc}\n\nWith content:\n${JSON.stringify(action, null, 2)}`;
        return await this.generateComment(prompt);
    }

    private async generateProviderDoc(provider: any): Promise<string> {
        const prompt = `${PROMPT_TEMPLATES.providerDoc}\n\nWith content:\n${JSON.stringify(provider, null, 2)}`;
        return await this.generateComment(prompt);
    }








    /**
     * Handle API errors by logging the error message and throwing the error.
     *
     * @param {Error} error The error object to handle
     * @returns {void}
     */
    public handleAPIError(error: Error): void {
        console.error('API Error:', error.message);
        throw error;
    }
}