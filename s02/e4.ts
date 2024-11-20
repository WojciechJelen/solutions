import { join } from "path";
import { readdir } from "fs/promises";
import { AnthropicClient, OpenaiClient } from "../utils";
import { writeFile } from "fs/promises";
import { UtilsService } from "../utils/utils-service";

type CacheEntry = {
  content: string;
  category: "people" | "hardware" | "software" | "other";
};

const ALLOWED_EXTENSIONS = ["mp3", "txt", "png", "unknown"] as const;
type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

const DIR_NAME = "files";

const cacheFilePath = join(__dirname, "cache.json");
const client = new OpenaiClient("gpt-4o");
const anthropicClient = new AnthropicClient("claude-3-5-sonnet-20240620");
const utilsService = new UtilsService();

const initializeCache = async () => {
  try {
    await Bun.file(cacheFilePath).text();
  } catch (error) {
    await writeFile(cacheFilePath, JSON.stringify({}, null, 2));
  }
};

const cacheInJson = async (key: string, value: string, category: string) => {
  const cache = JSON.parse(await Bun.file(cacheFilePath).text());
  cache[key] = {
    content: value,
    category,
  };
  writeFile(cacheFilePath, JSON.stringify(cache, null, 2));
};

const getCachedData = async () => {
  const cache = JSON.parse(await Bun.file(cacheFilePath).text());
  return cache;
};

const getContentFromFile = async (file: string) => {
  const filePath = join(__dirname, DIR_NAME, file);
  const extension = file.split(".")[1] || "unknown";

  if (extension === "txt") {
    return Bun.file(filePath).text();
  }

  if (extension === "mp3") {
    const audioBlob = await Bun.file(filePath).arrayBuffer();
    const audioFile = new File([audioBlob], `${file}.mp3`, {
      type: "audio/mpeg",
    });

    const llmResponse = await client.getVoiceToText(audioFile);
    return llmResponse.text;
  }

  if (extension === "png") {
    const image = await Bun.file(filePath).arrayBuffer();
    const base64Image = Buffer.from(image).toString("base64");
    const llmResponse = await client.getImageToText(
      base64Image,
      "You are the advanced and precise OCR system. Extract the text content from the image."
    );
    return llmResponse.choices[0].message.content;
  }
};

const categorizeContent = async (content: string) => {
  const prompt = `
You will be given the content of a note. Your task is to analyze this content and categorize it based on specific criteria. Here's what you need to do:

1. First, read the following note content carefully:
<note_content>
${content}
</note_content>

2. Your goal is to extract only the information related to:
   a) Captured people or traces of their presence
   b) Repaired hardware issues (ignore software-related issues)

3. Based on the extracted information, you need to categorize the note into one of these categories:
   - 'people': if the note contains information about captured individuals or evidence of human presence
   - 'hardware': if the note mentions repaired hardware issues
   - 'software': if the note only contains information about software issues
   - 'other': if the note doesn't fit into any of the above categories

4. To categorize the note:
   - If you find information about captured people or traces of their presence, categorize it as 'people'
   - If you find information about repaired hardware issues, categorize it as 'hardware'
   - If you only find information about software issues, categorize it as 'software'
   - If you don't find any relevant information or the note doesn't fit the above categories, categorize it as 'other'

5. Your output should be just one word: the category you've determined ('people', 'hardware', 'software', or 'other'). Do not include any explanations or extracted information in your response.

Provide your categorization in the following format:
<category>INSERT_CATEGORY_HERE</category>
  `;

  const llmResponse = await anthropicClient.getCompletion(prompt);

  const categoryMatch = llmResponse?.match(/<category>(.*?)<\/category>/);
  return categoryMatch?.[1] || "other";
};

async function main() {
  await initializeCache();
  const files = await readdir(join(__dirname, DIR_NAME));
  const cache = JSON.parse(await Bun.file(cacheFilePath).text());

  for (const file of files) {
    let content;
    if (cache[file]) {
      content = cache[file].content;
    } else {
      content = await getContentFromFile(file);

      if (content) {
        const category = await categorizeContent(content);
        await cacheInJson(file, content, category);
      }
    }
  }

  // send all notes to Centrala
  const cacheData = await getCachedData();

  const people = Object.entries(cacheData as Record<string, CacheEntry>)
    .filter(([_, note]) => note.category === "people")
    .map(([key]) => key);
  const hardware = Object.entries(cacheData as Record<string, CacheEntry>)
    .filter(([_, note]) => note.category === "hardware")
    .map(([key]) => key);

  console.log(people, hardware);

  await utilsService.sendAnswer("kategorie", {
    people: people.sort(),
    hardware: hardware.sort(),
  });
}

main();
