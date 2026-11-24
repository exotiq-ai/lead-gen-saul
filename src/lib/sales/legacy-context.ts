import { createServerClient } from '@/lib/supabase/server'
import { EXOTIQ_TENANT, salesContextRow } from './model'
/** Admin-facing legacy surfaces reuse the same registry; original columns stay intact. */
export async function withSalesContext(rows:Record<string,unknown>[],tenantId:string){
 if(tenantId!==EXOTIQ_TENANT||!rows.length)return rows
 const db=createServerClient(),baseline:Record<string,unknown>[]=[],assignment:Record<string,unknown>[]=[]
 for(let offset=0;offset<rows.length;offset+=75){
  const ids=rows.slice(offset,offset+75).map(r=>String(r.id))
  const results=await Promise.all([
   db.from('sales_baseline_accounts').select('lead_id,source_review_required',{count:'exact'}).eq('tenant_id',tenantId).in('lead_id',ids).limit(1000),
   db.from('sales_account_assignments').select('lead_id,assigned_member_id,ownership_overridden',{count:'exact'}).eq('tenant_id',tenantId).in('lead_id',ids).limit(1000),
  ])
  for(const result of results){if(result.error)throw result.error;if(result.count!==result.data.length)throw new Error('Incomplete sales ownership read')}
  baseline.push(...results[0].data!);assignment.push(...results[1].data!)
 }
 const result=await db.from('sales_members').select('id,display_name',{count:'exact'}).eq('tenant_id',tenantId).limit(1000)
 if(result.error)throw result.error;if(result.count!==result.data.length)throw new Error('Incomplete sales membership read')
 return rows.map(row=>salesContextRow(row,baseline,assignment,result.data))
}
