import { NextRequest, NextResponse } from 'next/server'
import { authenticatedDashboardUser } from './server'
type Authorization = {ok:true} | {ok:false;reason:string}
type Authorize = (req:NextRequest,response:NextResponse)=>Promise<Authorization>
/** The injected authorizer is for isolated tests, never selected by request data. */
export function protectExport(handler:(req:NextRequest)=>Promise<Response>,authorize:Authorize=authenticatedDashboardUser){
 return async(req:NextRequest):Promise<Response>=>{
  const authResponse=NextResponse.next({request:req})
  let auth:Authorization
  try{auth=await authorize(req,authResponse)}catch{return NextResponse.json({error:'Authentication unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
  if(!auth.ok)return NextResponse.json({error:auth.reason},{status:auth.reason==='not_authenticated'?401:403,headers:{'Cache-Control':'private, no-store'}})
  const result=await handler(req)
  result.headers.set('Cache-Control','private, no-store')
  for(const cookie of authResponse.cookies.getAll()){
   const jar=NextResponse.next();jar.cookies.set(cookie)
   const value=jar.headers.get('set-cookie');if(value)result.headers.append('set-cookie',value)
  }
  return result
 }
}
