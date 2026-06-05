import { buildLeadSearchOrFilter } from '../src/lib/leads/search'
import { normalizeCallNote } from '../src/lib/leads/callNotes'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const filter = buildLeadSearchOrFilter(' Select Elite, Miami ')
assert(filter.includes('company_name.ilike.%Select Elite Miami%'), 'search should trim and sanitize commas for company')
assert(filter.includes('email.ilike.%Select Elite Miami%'), 'search should include email')
assert(filter.includes('phone.ilike.%Select Elite Miami%'), 'search should include phone')
assert(filter.includes('company_domain.ilike.%Select Elite Miami%'), 'search should include domain')

const note = normalizeCallNote('  Spoke with owner\n\nWants more info.  ')
assert(note === 'Spoke with owner\n\nWants more info.', 'call note should trim but preserve meaningful newlines')

let rejected = false
try { normalizeCallNote('   ') } catch { rejected = true }
assert(rejected, 'blank call notes should be rejected')

console.log('lead helper tests passed')
