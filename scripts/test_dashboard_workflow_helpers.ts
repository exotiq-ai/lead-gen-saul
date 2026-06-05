import { buildContactLinks } from '../src/lib/leads/contactLinks'
import { filterOutreachItems } from '../src/lib/outreach/filter'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const links = buildContactLinks({
  email: 'owner@example.com',
  phone: '(305) 555-1212',
  company_domain: 'example.com',
  score_breakdown: { company_ig_handle: '@eliteclubmia' },
})

assert(links.email?.href === 'mailto:owner@example.com', 'email should become mailto link')
assert(links.phone?.href.startsWith('tel:+1') && links.phone.href.endsWith('1212'), 'phone should normalize to tel link')
assert(links.website?.href === 'https://example.com', 'domain should become https link')
assert(links.instagram?.href === 'https://www.instagram.com/eliteclubmia/', 'IG handle should become instagram URL')

const filtered = filterOutreachItems([
  {
    id: 'q1',
    lead_id: 'l1',
    channel: 'email',
    message_draft: 'Miami renters move fast',
    status: 'approved',
    leads: { company_name: 'Elite Club Miami', email: 'info@eliteclubmia.com', phone: '(305) 111-2222', company_domain: 'eliteclubmia.com', company_location: 'Miami', first_name: null, last_name: null, score: 80, assigned_to: null, linkedin_url: null, score_breakdown: null },
  },
  {
    id: 'q2',
    lead_id: 'l2',
    channel: 'instagram_dm',
    message_draft: 'Orlando booking workflow',
    status: 'approved',
    leads: { company_name: 'Corza Luxury', email: 'reservations@corzaluxury.com', phone: null, company_domain: 'corzaluxury.com', company_location: 'Orlando', first_name: null, last_name: null, score: 80, assigned_to: null, linkedin_url: null, score_breakdown: null },
  },
], 'elite')

assert(filtered.length === 1 && filtered[0].id === 'q1', 'outreach search should match lead company')
assert(filterOutreachItems(filtered, '').length === 1, 'empty search should preserve visible items')

console.log('dashboard workflow helper tests passed')
