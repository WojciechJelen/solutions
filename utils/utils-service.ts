export class UtilsService {
  private apiKey: string | undefined;
  private baseUrl: string = "https://centrala.ag3nts.org/report";

  constructor() {
    this.apiKey = Bun.env.CENTRALE_API_KEY;
  }

  async sendAnswer(task: string, answer: string | object): Promise<any | null> {
    if (!this.apiKey) {
      throw new Error("API key is not set");
    }

    const payload = {
      task,
      apikey: this.apiKey,
      answer: answer,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Response body: ${errorBody}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error sending answer to Centrala: ${error}`);
      if (error instanceof Error) {
        console.error(`Request URL: ${this.baseUrl}`);
        console.error(`Request payload: ${JSON.stringify(payload, null, 2)}`);
      }
      return null;
    }
  }
}
