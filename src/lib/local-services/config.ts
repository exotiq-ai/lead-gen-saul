export const LOCAL_SERVICES_TENANT_ID = '22222222-2222-2222-2222-222222222222'
export const LOCAL_SERVICES_TENANT_SLUG = 'ask-saul'

export type LocalServiceVerticalKey =
  | 'hvac'
  | 'garage_doors'
  | 'driveways'
  | 'aging_in_place'

export type LocalServiceVertical = {
  key: LocalServiceVerticalKey
  label: string
  shortLabel: string
  serviceType: string
  ghlTag: string
  queries: string[]
  defaultMaxResults: number
  routeToSafeToStay?: boolean
  outreach: {
    firstTouch: string
    yesReply: string
    demoReply: string
  }
}

export const LOCAL_SERVICE_VERTICALS: Record<LocalServiceVerticalKey, LocalServiceVertical> = {
  hvac: {
    key: 'hvac',
    label: 'HVAC',
    shortLabel: 'HVAC',
    serviceType: 'HVAC',
    ghlTag: 'vertical-hvac',
    defaultMaxResults: 50,
    queries: [
      'HVAC contractor',
      'air conditioning repair',
      'furnace repair',
      'heating contractor',
      'AC repair',
    ],
    outreach: {
      firstTouch: 'Hey, quick question — are you still taking HVAC jobs in {city}?\n\nThanks,\nGregory',
      yesReply:
        'Awesome. I set up 24/7 phone agents for local HVAC companies so missed calls still turn into leads.\n\nFree setup, no contract, and you only pay $50 if you close a job from one of those calls.\n\nWant to call one and hear it?',
      demoReply:
        'Perfect. Try this number: {demo_number}\n\nCall like you are a customer needing HVAC help. If it sounds useful, I can set one up around your services, hours, and service area.',
    },
  },
  garage_doors: {
    key: 'garage_doors',
    label: 'Garage Doors',
    shortLabel: 'Garage Doors',
    serviceType: 'garage door',
    ghlTag: 'vertical-garage-doors',
    defaultMaxResults: 50,
    queries: [
      'garage door repair',
      'garage door installation',
      'garage door supplier',
      'overhead door company',
      'garage door opener repair',
    ],
    outreach: {
      firstTouch: 'Hey, quick question — are you still taking garage door jobs in {city}?\n\nThanks,\nGregory',
      yesReply:
        'Awesome. I set up 24/7 phone agents for local garage door companies so broken spring, opener, and repair calls still get captured after hours.\n\nFree setup, no contract, and you only pay $50 if you close a job from one of those calls.\n\nWant to call one and hear it?',
      demoReply:
        'Perfect. Try this number: {demo_number}\n\nCall like you are a customer with a broken garage door. If it sounds useful, I can set one up around your services, hours, and service area.',
    },
  },
  driveways: {
    key: 'driveways',
    label: 'Driveways',
    shortLabel: 'Driveways',
    serviceType: 'driveway',
    ghlTag: 'vertical-driveways',
    defaultMaxResults: 50,
    queries: [
      'driveway contractor',
      'concrete driveway contractor',
      'asphalt paving contractor',
      'paving contractor',
      'concrete contractor driveway',
    ],
    outreach: {
      firstTouch: 'Hey, quick question — are you still taking driveway jobs in {city}?\n\nThanks,\nGregory',
      yesReply:
        'Awesome. I set up 24/7 phone agents for local driveway companies so estimate calls still get captured when you are on a job or after hours.\n\nFree setup, no contract, and you only pay $50 if you close a job from one of those calls.\n\nWant to call one and hear it?',
      demoReply:
        'Perfect. Try this number: {demo_number}\n\nCall like you are a customer needing a driveway estimate. If it sounds useful, I can set one up around your services, hours, and service area.',
    },
  },
  aging_in_place: {
    key: 'aging_in_place',
    label: 'Aging-in-Place Contractors',
    shortLabel: 'Aging-in-Place',
    serviceType: 'aging-in-place modification',
    ghlTag: 'vertical-aging-in-place',
    defaultMaxResults: 50,
    routeToSafeToStay: true,
    queries: [
      'aging in place contractor',
      'home modification contractor',
      'bathroom accessibility remodeler',
      'walk in shower installer',
      'wheelchair ramp contractor',
      'ADA home modifications',
      'senior home remodeling',
      'grab bar installation',
      'accessibility remodeling',
    ],
    outreach: {
      firstTouch: 'Hey, quick question — are you still taking home accessibility or aging-in-place jobs in {city}?\n\nThanks,\nGregory',
      yesReply:
        'Awesome. I set up 24/7 phone agents for local home modification contractors so families asking about ramps, grab bars, showers, or safety work get answered quickly.\n\nFree setup, no contract, and you only pay $50 if you close a job from one of those calls.\n\nWant to call one and hear it?',
      demoReply:
        'Perfect. Try this number: {demo_number}\n\nCall like you are a family member asking about accessibility work. If it sounds useful, I can set one up around your services, hours, and service area.',
    },
  },
}

export const LOCAL_SERVICES_PIPELINE_STAGES = [
  { name: 'New Lead', slug: 'new', position: 1, color: '#64748b', is_terminal: false, terminal_type: null },
  { name: 'Ready for GHL', slug: 'ready_for_ghl', position: 2, color: '#2563eb', is_terminal: false, terminal_type: null },
  { name: 'Outreach Approved', slug: 'outreach_approved', position: 3, color: '#7c3aed', is_terminal: false, terminal_type: null },
  { name: 'Contacted', slug: 'contacted', position: 4, color: '#f59e0b', is_terminal: false, terminal_type: null },
  { name: 'Replied', slug: 'replied', position: 5, color: '#10b981', is_terminal: false, terminal_type: null },
  { name: 'Demo/Test Call', slug: 'demo_test_call', position: 6, color: '#06b6d4', is_terminal: false, terminal_type: null },
  { name: 'Converted', slug: 'converted', position: 7, color: '#22c55e', is_terminal: true, terminal_type: 'won' },
  { name: 'Not Interested', slug: 'not_interested', position: 8, color: '#ef4444', is_terminal: true, terminal_type: 'lost' },
]
