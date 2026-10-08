import { aiErrorMessage, parseAiSettings } from './ai.service';

describe('ai.service helpers', () => {
  it('treats missing or non-true settings as off', () => {
    expect(parseAiSettings(undefined)).toEqual({ summaries: false, translation: false, chat: false, semanticSearch: false });
    expect(parseAiSettings({ chat: true, summaries: 'true', translation: 1 })).toEqual({
      summaries: false,
      translation: false,
      chat: true,
      semanticSearch: false,
    });
  });

  it('shows server messages for limit errors and a generic one otherwise', () => {
    expect(aiErrorMessage({ code: 'functions/resource-exhausted', message: 'Daily limit reached.' })).toBe('Daily limit reached.');
    expect(aiErrorMessage({ code: 'functions/internal', message: 'boom stack' })).toBe('The AI is not available right now. Please try again later.');
    expect(aiErrorMessage({ code: 'functions/unauthenticated' })).toContain('not available from this browser');
  });
});
