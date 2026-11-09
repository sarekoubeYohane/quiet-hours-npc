import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let executablePath=process.env.CHROMIUM_EXECUTABLE;
let args=['--no-sandbox','--disable-dev-shm-usage'];
if(process.env.CHROMIUM_MODULE){
 const chromiumModule=await import(pathToFileURL(process.env.CHROMIUM_MODULE).href);
 const chromium=chromiumModule.default;
 // Acceptance must retain browser origin/CORS behavior. Serverless presets
 // disable web security, which also suppresses Origin on same-origin writes.
 args=chromium.args.filter(arg=>arg!=='--disable-web-security');
 executablePath ||= await chromium.executablePath();
}
export const launchBrowser=()=>playwright.chromium.launch({...(executablePath?{executablePath}:{}),args,headless:true});
export const outputPath=(file)=>`${process.env.BROWSER_ARTIFACT_DIR||'/tmp'}/${file}`;
