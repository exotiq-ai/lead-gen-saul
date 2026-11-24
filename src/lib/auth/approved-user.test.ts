import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
async function load(){assert(fs.existsSync('src/lib/auth/approved-user.ts'),'approved-user preparation is missing');return import('./approved-user')}
test('unapproved emails never reach the auth admin API',async()=>{const {prepareApprovedAuthUser}=await load();let calls=0;await assert.rejects(()=>prepareApprovedAuthUser('bad@example.test',false,async()=>{calls++;return {error:null}}),/approved/);assert.equal(calls,0)})
test('approved account is created unconfirmed without an invitation',async()=>{const {prepareApprovedAuthUser}=await load();const calls:unknown[]=[];await prepareApprovedAuthUser('rep@example.test',true,async p=>{calls.push(p);return {error:null}});assert.deepEqual(calls,[{email:'rep@example.test',email_confirm:false}])})
test('existing-user provider codes are safe retries, not profile updates',async()=>{const {prepareApprovedAuthUser}=await load();for(const code of ['email_exists','user_already_exists'])await prepareApprovedAuthUser('rep@example.test',true,async()=>({error:{code}}))})
test('unexpected provider failures do not proceed to sign-in',async()=>{const {prepareApprovedAuthUser}=await load();await assert.rejects(()=>prepareApprovedAuthUser('rep@example.test',true,async()=>({error:{code:'unexpected_failure'}})),/prepare/)})
test('login keeps public signup closed and prepares only the verified membership email',()=>{const source=fs.readFileSync('src/app/api/auth/magic-link/route.ts','utf8');assert.match(source,/prepareApprovedAuthUser\(member\.email/);assert.match(source,/shouldCreateUser: false/);assert.doesNotMatch(source,/email_confirm: true/)})
