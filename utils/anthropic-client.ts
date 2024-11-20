import Anthropic from "@anthropic-ai/sdk";

export class AnthropicClient {
  private client: Anthropic;
  private systemPrompt: string | undefined;

  constructor(systemPrompt?: string) {
    const apiKey = Bun.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not found in environment variables");
    }

    this.client = new Anthropic({
      apiKey: apiKey,
    });
    this.systemPrompt = systemPrompt;
  }

  async getCompletion(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 2048,
      system: this.systemPrompt ?? "You are a helpful assistant.",
      messages: [{ role: "user", content: prompt }],
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  }
}
