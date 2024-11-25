import { OpenaiClient } from "../utils/openai-client";
import path from "path";
import fs from "fs";
import { UtilsService } from "../utils/utils-service";

type ReportWithMeta = {
  reportName: string;
  text: string;
  connectedFacts: string;
};

type ReportWithMetaAndKeywords = ReportWithMeta & {
  keywords: string;
};

const REPORTS_DIR = path.join(__dirname, "reports");
const FACTS_DIR = path.join(__dirname, "facts");

const reports = fs.readdirSync(REPORTS_DIR);
const facts = fs.readdirSync(FACTS_DIR);

const buildFactsContext = () => {
  const factsContent = facts
    .map((fact) => fs.readFileSync(path.join(FACTS_DIR, fact), "utf-8"))
    .filter((content) => content.trim() !== "entry deleted");

  return factsContent.join("\n");
};

const buildReportsContext = () => {
  const reportsContent = reports.map((report) => {
    const content = fs.readFileSync(path.join(REPORTS_DIR, report), "utf-8");
    return `#### ${report}\n${content}`;
  });

  return reportsContent.join("\n\n");
};

const openaiClient = new OpenaiClient("gpt-4o");
const utilsService = new UtilsService();

const reportsContext = buildReportsContext();
const factsContext = buildFactsContext();

const reportsContent = reports.map((report) => {
  const content = fs.readFileSync(path.join(REPORTS_DIR, report), "utf-8");
  return `#### ${report}\n${content}`;
});

const getKeywordsPrompt = (reportContent: string, connectedFacts: string) => `
Przeanalizuj poniższy raport i powiązane fakty, a następnie wygeneruj listę słów kluczowych, które najlepiej opisują jego zawartość.

Raport:
<raport>
${reportContent}
</raport>

Powiązane fakty:
<fakty>
${connectedFacts}
</fakty>

Instrukcje:
1. Zidentyfikuj najważniejsze osoby, miejsca, organizacje, wydarzenia i tematy
2. Użyj wyłącznie form w mianowniku liczby pojedynczej (np. "polityk" zamiast "politycy", "organizacja" zamiast "organizacji")
3. Wybierz tylko najbardziej istotne i charakterystyczne słowa kluczowe
4. Pomiń słowa ogólne i niespecyficzne

Zwróć wyłącznie listę słów kluczowych oddzielonych przecinkami, bez dodatkowego tekstu czy formatowania.
`;

const reportFactsPrompt = (reportContent: string) => `
Dla treści poniższego raportu, wpisz wszystkie powiązane z nim fakty, na temat wspomnianych w raportach osób, miejsc i zdarzeń. 
Dokladnie przeanalizuj <fakty>, i podsumuj wszystkie powiązane z <raport> fakty w formie listy.

Treść raportu:
<raport>
${reportContent}
</raport>

Znanie fakty:
<fakty>
${factsContext}
</fakty>
 `;

const getReportsWithMeta = async (): Promise<ReportWithMeta[]> => {
  const reportsWithMeta = await Promise.all(
    reports.map(async (report) => {
      const content = fs.readFileSync(path.join(REPORTS_DIR, report), "utf-8");
      const result = await openaiClient.getCompletion(
        reportFactsPrompt(content)
      );
      const connectedFacts = result.choices[0].message.content ?? "";
      return {
        reportName: report,
        text: content,
        connectedFacts,
        keywords: "",
      };
    })
  );
  return reportsWithMeta;
};

const getKeywordsForReport = async (
  report: ReportWithMeta
): Promise<ReportWithMetaAndKeywords> => {
  const prompt = getKeywordsPrompt(report.text, report.connectedFacts);
  const result = await openaiClient.getCompletion(prompt);
  const keywords = result.choices[0].message.content ?? "";
  return { ...report, keywords };
};

const main = async (forceKeywordsUpdate: boolean = false) => {
  let reportsWithMeta;
  const cacheFile = "reports-cache.json";
  const cacheFilePath = path.join(__dirname, cacheFile);

  if (fs.existsSync(cacheFilePath)) {
    console.log("Using cached reports");
    reportsWithMeta = JSON.parse(fs.readFileSync(cacheFilePath, "utf-8"));
  } else {
    reportsWithMeta = await getReportsWithMeta();
  }

  let reportsWithKeywords;
  if (!forceKeywordsUpdate && reportsWithMeta[0]?.keywords) {
    console.log("Using cached keywords");
    reportsWithKeywords = reportsWithMeta;
  } else {
    console.log("Generating new keywords");
    reportsWithKeywords = await Promise.all(
      reportsWithMeta.map(getKeywordsForReport)
    );
    fs.writeFileSync(
      cacheFilePath,
      JSON.stringify(reportsWithKeywords, null, 2)
    );
  }

  console.log(reportsWithKeywords);
  // utilsService.sendAnswer("dokumenty", keywordsByFile);
};

main();
