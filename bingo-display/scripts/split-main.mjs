import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mainPath = path.join(root, "src/main.ts");
const lines = fs.readFileSync(mainPath, "utf8").split(/\r?\n/);
const markupIdx = lines.findIndex((l) => l.startsWith("const DISPLAY_MARKUP"));
if (markupIdx < 0) throw new Error("DISPLAY_MARKUP not found");
let markupEnd = markupIdx;
while (markupEnd < lines.length && !lines[markupEnd].startsWith("`;")) markupEnd++;
markupEnd++;

const head = lines.slice(0, markupIdx).join("\n");
const markupBlock = lines
  .slice(markupIdx, markupEnd)
  .join("\n")
  .replace("const DISPLAY_MARKUP", "export const DISPLAY_MARKUP");
const tail = lines.slice(markupEnd).join("\n");

fs.mkdirSync(path.join(root, "src/display"), { recursive: true });
fs.mkdirSync(path.join(root, "src/live"), { recursive: true });
fs.writeFileSync(path.join(root, "src/display/markup.ts"), `${markupBlock}\n`);
fs.writeFileSync(path.join(root, "src/live/controller.ts"), `${head}\n`);
const controllerPath = path.join(root, "src/live/controller.ts");
let controller = fs.readFileSync(controllerPath, "utf8");
if (!controller.includes('from "../display/markup.js"')) {
  controller = controller.replace(
    'import { setRoomSlug } from "../config.js";',
    'import { setRoomSlug } from "../config.js";\nimport { DISPLAY_MARKUP } from "../display/markup.js";',
  );
}
controller = controller.replace(/^import "\.\/style\.css";\n/m, "");
const bootFn = tail.replace(
  /^const app = document\.querySelector/,
  "export function bootDisplayApp(): void {\n  const app = document.querySelector",
).replace(/\nif \(roomMatch\) \{[\s\S]*$/, (block) => {
  return block + "\n}\n";
});
if (!controller.includes("export function bootDisplayApp")) {
  controller = `${controller.trimEnd()}\n\n${bootFn}`;
}
fs.writeFileSync(controllerPath, `${controller}\n`);
fs.writeFileSync(
  path.join(root, "src/main.ts"),
  `import "./style.css";\nimport { bootDisplayApp } from "./live/controller.js";\n\nbootDisplayApp();\n`,
);
console.log("split ok", { controllerLines: markupIdx, bootLines: lines.length - markupEnd });
