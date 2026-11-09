/** Account authoring is distinct from opening/save-management raw-owner scopes. */
export const authoringScope=(owner:string)=>'account-operations:'+owner;
export const matchesScope=(expected:string,submitted:unknown)=>submitted===expected;
export const accountScopeMismatch={error:'登入帳號已變更或缺少原帳號識別；原輸入未同步，請回到原帳號核對。',scopeMismatch:true};
export function matchesReadScope(expected:string,request?:Request){const scope=request&&new URL(request.url).searchParams.get('accountScope');return scope===undefined||scope===null||matchesScope(expected,scope);}
