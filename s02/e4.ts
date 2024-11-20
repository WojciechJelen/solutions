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
    const fileKey = `${file}.mp3`;
    if (existingTranscriptions[fileKey]) {
      console.log(`File ${fileKey} already transcribed, skipping.`);
      continue;
    }

    const audioPath = join(__dirname, DIR_NAME, fileKey);

    // Create a File object from the BunFile
    const audioBlob = await Bun.file(audioPath).arrayBuffer();
    const audioFile = new File([audioBlob], fileKey, {
      type: "audio/mpeg",
    });

    const response = await client.getVoiceToText(audioFile);
    transcriptions[fileKey] = response.text;
  }

  console.log("Audio files processed.");

  // Process text files and add to transcriptions
  for (const file of textFiles) {
    const fileKey = `${file}.txt`;
    if (existingTranscriptions[fileKey]) {
      console.log(`File ${fileKey} already processed, skipping.`);
      continue;
    }

    const textPath = join(__dirname, DIR_NAME, fileKey);
    const text = await Bun.file(textPath).text();
    transcriptions[fileKey] = text;
  }

  console.log("Text files processed.");

  for (const file of pngFiles) {
    const fileKey = `${file}.png`;
    const imagePath = join(__dirname, DIR_NAME, fileKey);
    const image = await Bun.file(imagePath).arrayBuffer();
    const base64Image = Buffer.from(image).toString("base64");

    const response = await client.getImageToText(
      base64Image,
      "You are the advanced OCR system. Extract the text from the image."
    );

    transcriptions[fileKey] = response.choices[0].message.content as string;
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

  // get the content of the transcriptions.json file
  const transcriptionsContent = await Bun.file(transcriptionsPath).text();
  const transcriptionsObject = JSON.parse(transcriptionsContent);
  for (const [file, content] of Object.entries(transcriptionsObject)) {
    console.log(`${file}: ${content}`);
  }

  // sort files

  // sort files
  // client.getCompletion(
  //   `You are the advanced human detection system. You will get the content of the file, and you will need to determine
  //   if the content contains information about a human or a robot.

  //   If it is about the human, you will return "human".
  //   If it is about the robot, you will return "robot".
  //   If it is not about the human or the robot, you will return "unknown".

  //   Here is the content of the file:
  //   ${JSON.stringify(updatedTranscriptions, null, 2)}
  //   `
  //);
}

main();
