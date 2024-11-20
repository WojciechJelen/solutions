import { join } from "path";
import { readdir } from "fs/promises";
import { OpenaiClient } from "../utils";

const context = {};

const DIR_NAME = "files";

const ALLOWED_EXTENSIONS = ["mp3", "txt", "png", "unknown"] as const;
type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

const groupFilesByExtension = (
  files: string[]
): Record<AllowedExtension, string[]> => {
  return files.reduce((acc, file) => {
    const [name, extension] = file.split(".");
    const safeExtension = ALLOWED_EXTENSIONS.includes(
      extension as AllowedExtension
    )
      ? (extension as AllowedExtension)
      : "unknown";
    return {
      ...acc,
      [safeExtension]: [...(acc[safeExtension] || []), name],
    };
  }, {} as Record<AllowedExtension, string[]>);
};

import { writeFile } from "fs/promises";

async function main() {
  const client = new OpenaiClient();
  const files = await readdir(join(__dirname, DIR_NAME));
  const groupedFiles = groupFilesByExtension(files);

  console.log(groupedFiles);

  const audioFiles = groupedFiles.mp3;
  const textFiles = groupedFiles.txt;
  const pngFiles = groupedFiles.png;
  const unknownFiles = groupedFiles.unknown;

  const transcriptions: Record<string, string> = {};
  // Read existing transcriptions
  const transcriptionsPath = join(__dirname, DIR_NAME, "transcriptions.json");
  let existingTranscriptions: Record<string, string> = {};
  try {
    const data = await Bun.file(transcriptionsPath).text();
    existingTranscriptions = JSON.parse(data);
  } catch (error) {
    console.log("No existing transcriptions found, starting fresh.");
  }

  for (const file of audioFiles) {
    if (existingTranscriptions[file]) {
      console.log(`File ${file} already transcribed, skipping.`);
      continue;
    }

    const audioPath = join(__dirname, DIR_NAME, `${file}.mp3`);

    // Create a File object from the BunFile
    const audioBlob = await Bun.file(audioPath).arrayBuffer();
    const audioFile = new File([audioBlob], `${file}.mp3`, {
      type: "audio/mpeg",
    });

    const response = await client.getVoiceToText(audioFile);
    transcriptions[file] = response.text;
  }

  console.log("Audio files processed.");

  // Process text files and add to transcriptions
  for (const file of textFiles) {
    if (existingTranscriptions[file]) {
      console.log(`File ${file} already processed, skipping.`);
      continue;
    }

    const textPath = join(__dirname, DIR_NAME, `${file}.txt`);
    const text = await Bun.file(textPath).text();
    transcriptions[file] = text;
  }

  console.log("Text files processed.");

  for (const file of pngFiles) {
    const imagePath = join(__dirname, DIR_NAME, `${file}.png`);
    const image = await Bun.file(imagePath).arrayBuffer();
    const base64Image = Buffer.from(image).toString("base64");

    const response = await client.getImageToText(
      base64Image,
      "You are the advanced OCR system. Extract the text from the image."
    );

    transcriptions[file] = response.choices[0].message.content as string;
  }

  console.log("Image files processed.");

  // Merge new transcriptions with existing ones
  const updatedTranscriptions = {
    ...existingTranscriptions,
    ...transcriptions,
  };

  await writeFile(
    transcriptionsPath,
    JSON.stringify(updatedTranscriptions, null, 2)
  );
}

main();
