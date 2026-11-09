/** Independent browser assertion for an account-bound page destination. */
export const boundPageURL=(origin,owner,pathname,params={})=>value=>{
 const url=new URL(String(value),origin);
 return url.origin===origin&&url.pathname===pathname&&url.searchParams.get('owner')===owner&&Object.entries(params).every(([key,expected])=>url.searchParams.get(key)===expected);
};
