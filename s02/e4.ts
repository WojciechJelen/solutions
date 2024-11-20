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
import { UtilsService } from "../utils/utils-service";

async function main() {
  const client = new OpenaiClient("gpt-4o");
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
    if (existingTranscriptions[fileKey]) {
      console.log(`File ${fileKey} already processed, skipping.`);
      continue;
    }

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

  // get the content of the transcriptions.json file and sort files
  const sortedFiles: Record<"people" | "hardware" | "unknown", string[]> = {
    people: [],
    hardware: [],
    unknown: [],
  };
  const transcriptionsContent = await Bun.file(transcriptionsPath).text();
  const transcriptionsObject = JSON.parse(transcriptionsContent);
  for (const [file, content] of Object.entries(transcriptionsObject)) {
    // sort files
    const response = await client.getCompletion(
      `You need to classify if  the provided note is about humans or about the machines. For the context, you will have all notes provided, so you can use them to make a decision.

    Note to analyze:
    <note>
    ${content}
    </note>

    All notes:
    <notes>
    ${Object.values(transcriptionsObject).join("\n")}
    </notes>

    Rules:
    - If the text primarily describes or refers to a human being/person, respond with exactly "human"
    - If the text primarily describes or refers to a machine, machine, or hardware system, respond with exactly "machine"
    - If the text is ambiguous or describes neither a human nor a machine, respond with exactly "unknown"
    - You have to be sure about your answer, there should be no doubt. If you are not sure, respond with "unknown".

    Think step by step before each answer and explain your decision. Your answer should be the thinking and one of the three words: "human", "machine", or "unknown". 
    
    <thinking>
    {your thinking}
    </thinking>

    <answer>
    {your answer}
    </answer>

`
    );

    const results = response.choices[0].message.content as string;
    console.log("results", results);
    const answer =
      results.match(/<answer>(.*?)<\/answer>/s)?.[1]?.trim() ?? "unknown";
    console.log("answer", answer);

    if (answer === "human") {
      sortedFiles.people.push(file);
    } else if (answer === "machine") {
      sortedFiles.hardware.push(file);
    } else {
      sortedFiles.unknown.push(file);
    }
  }

  // sort alphabetically
  sortedFiles.people.sort();
  sortedFiles.hardware.sort();
  sortedFiles.unknown.sort();
  console.log("Final sorted files:", sortedFiles);

  // save results JSON file with format fileName: type
  const results = Object.entries(sortedFiles).map(([type, files]) =>
    files.map((file) => ({ fileName: file, type }))
  );
  await Bun.write(
    join(__dirname, DIR_NAME, "results.json"),
    JSON.stringify(results, null, 2)
  );

  const utilsService = new UtilsService();
  utilsService.sendAnswer("kategorie", {
    hardware: sortedFiles.hardware,
    people: sortedFiles.people,
  });
}

main();
