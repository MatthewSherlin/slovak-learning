/** Codes the backend puts in an error body; api.ts throws the body as the message. */
const TUTOR_ERROR_MESSAGES: Record<string, string> = {
  tutor_out_of_credits: 'The tutor is out of AI credits.',
  tutor_unavailable: 'The tutor could not build this lesson. Please try again.',
};

/** The sentence to show for a tutor error the backend named, or null when it named none. */
export function tutorErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  for (const [code, message] of Object.entries(TUTOR_ERROR_MESSAGES)) {
    if (error.message.includes(code)) return message;
  }
  return null;
}
