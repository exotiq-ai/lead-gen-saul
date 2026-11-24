type CreateUser = (input: { email: string; email_confirm: false }) => Promise<{ error: { code?: string } | null }>

/** Service-side preparation only. Email ownership still requires the requested OTP. */
export async function prepareApprovedAuthUser(email: string, approved: boolean, createUser: CreateUser) {
  if (!approved) throw new Error('Email is not approved')
  const { error } = await createUser({ email, email_confirm: false })
  if (error && !['email_exists', 'user_already_exists'].includes(error.code ?? '')) {
    throw new Error('Could not prepare approved account')
  }
}
