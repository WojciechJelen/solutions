import OpenAI from "openai";
import type { Uploadable } from "openai/uploads.mjs";

export class OpenaiClient {
  private systemMessage: string;
  private openai: OpenAI;

  constructor(private model: string = "gpt-4o-mini", systemMessage?: string) {
    this.openai = new OpenAI();
    this.model = model;
    this.systemMessage = systemMessage || "";
  }

  async getCompletion(prompt: string) {
    return await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemMessage },
        { role: "user", content: prompt },
      ],
    });
  }

  async getVoiceToText(audio: Uploadable) {
    return await this.openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
    });
  }

  async getImageToText(base64Image: string, prompt: string) {
    return await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });
  }
}
