import { describe, it, expect } from 'vitest';
import { tutorErrorMessage } from '../errors';

describe('tutorErrorMessage', () => {
  it('names an empty AI account', () => {
    const e = new Error('{"detail":"The tutor is out of AI credits.","code":"tutor_out_of_credits"}');
    expect(tutorErrorMessage(e)).toBe('The tutor is out of AI credits.');
  });

  it('names a lesson the tutor could not build', () => {
    const e = new Error('{"detail":"AI service temporarily unavailable","code":"tutor_unavailable"}');
    expect(tutorErrorMessage(e)).toBe('The tutor could not build this lesson. Please try again.');
  });

  it('returns null for anything else', () => {
    expect(tutorErrorMessage(new Error('network'))).toBeNull();
    expect(tutorErrorMessage('tutor_unavailable')).toBeNull();
    expect(tutorErrorMessage(undefined)).toBeNull();
  });
});
