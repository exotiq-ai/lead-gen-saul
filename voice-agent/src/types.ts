export interface Env {
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_SHARED_SECRET?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PRIMARY_MODEL?: string;
  ESCALATION_MODEL?: string;
  DEFAULT_TENANT_ID?: string;
  DEFAULT_TENANT_SLUG?: string;
  APP_BASE_URL?: string;
  GHL_LOCAL_SERVICES_API_KEY?: string;
  GHL_LOCAL_SERVICES_LOCATION_ID?: string;
  GHL_API_VERSION?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_MESSAGE_THREAD_ID?: string;
}

export interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string }> | null;
}

export interface OAIChatRequest {
  model?: string;
  messages: OAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  metadata?: Record<string, unknown>;
  extra_body?: Record<string, unknown>;
  dynamic_variables?: Record<string, unknown>;
  user?: string;
}

export interface LeadCaptureInput {
  caller_name?: string;
  caller_first_name?: string;
  caller_last_name?: string;
  caller_phone: string;
  caller_email?: string;
  business_name?: string;
  business_type?: string;
  city_state?: string;
  current_call_handling?: string;
  pain_points?: string;
  interested: boolean;
  interest_level?: 'cold' | 'curious' | 'warm' | 'hot';
  fit_summary?: string;
  notes?: string;
}

export interface FollowupInput extends LeadCaptureInput {
  consent_confirmed: boolean;
  preferred_time_window: string;
  outstanding_questions?: string;
  custom_solution_needs?: string;
}
