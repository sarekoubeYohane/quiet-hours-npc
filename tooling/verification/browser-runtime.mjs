import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let executablePath=process.env.CHROMIUM_EXECUTABLE;
let args=['--no-sandbox','--disable-dev-shm-usage'];
if(process.env.CHROMIUM_MODULE){
 const chromiumModule=await import(pathToFileURL(process.env.CHROMIUM_MODULE).href);
 const chromium=chromiumModule.default;
 args=chromium.args;
 executablePath ||= await chromium.executablePath();
}
export const launchBrowser=()=>playwright.chromium.launch({...(executablePath?{executablePath}:{}),args,headless:true});
export const outputPath=(file)=>`${process.env.BROWSER_ARTIFACT_DIR||'/tmp'}/${file}`;
