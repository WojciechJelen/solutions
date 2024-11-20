import { join } from "path";
import { readdir } from "fs/promises";
import { OpenaiClient } from "../utils";
import { writeFile } from "fs/promises";
import { UtilsService } from "../utils/utils-service";

const DIR_NAME = "files";

const ALLOWED_EXTENSIONS = ["mp3", "txt", "png", "unknown"] as const;
type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

const cacheFilePath = join(__dirname, "cache.json");
const client = new OpenaiClient("gpt-4o");

const initializeCache = async () => {
  try {
    await Bun.file(cacheFilePath).text();
  } catch (error) {
    await writeFile(cacheFilePath, JSON.stringify({}, null, 2));
  }
};

const cacheInJson = async (key: string, value: string) => {
  const cache = JSON.parse(await Bun.file(cacheFilePath).text());
  cache[key] = {
    content: value,
    isHuman: null,
  };
  writeFile(cacheFilePath, JSON.stringify(cache, null, 2));
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

async function main() {
  await initializeCache();
  const files = await readdir(join(__dirname, DIR_NAME));
  const cache = JSON.parse(await Bun.file(cacheFilePath).text());

  for (const file of files) {
    if (cache[file]) {
      continue;
    }

    const content = await getContentFromFile(file);
    if (content) {
      await cacheInJson(file, content);
      console.log(content);
    }
  }
}

main();
