export const debugPlugin = {
  name: "debug",
  description: "Tools for debugging agent runtime",
  async onEvent(runtime: any, event: any) {
    if (
      event.type === "message" &&
      event.message.role === "user" &&
      event.message.content.toLowerCase().includes("debug")
    ) {
    
      const char = runtime.character;
      await runtime.api.sendMessage({
        role: "assistant",
        content: `🛠 Debug Info:
- ID: ${char.id}
- Name: ${char.name}
- Description: ${char.description || "N/A"}
- System Prompt: ${char.systemPrompt ? "yes" : "no"}
- Plugins: ${char.plugins?.length ?? 0}`
      });
    }
  }
};
