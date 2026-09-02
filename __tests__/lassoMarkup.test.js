import {
  parseLassoMarkup,
  clientPriorityToApi,
  extractBracketZones,
} from '../src/utils/lassoMarkup';

describe('clientPriorityToApi', () => {
  it('maps !!1 (highest) to API 4', () => {
    expect(clientPriorityToApi(1)).toBe(4);
  });
  it('maps !!4 (lowest) to API 1', () => {
    expect(clientPriorityToApi(4)).toBe(1);
  });
  it('rejects out of range', () => {
    expect(clientPriorityToApi(0)).toBeNull();
    expect(clientPriorityToApi(5)).toBeNull();
  });
});

describe('extractBracketZones', () => {
  it('pulls inner text and strips spans', () => {
    expect(extractBracketZones('Call dentist [tomorrow !!1]')).toEqual({
      body: 'Call dentist',
      zone: 'tomorrow !!1',
      hadBrackets: true,
    });
  });

  it('supports multiple pairs', () => {
    expect(extractBracketZones('Task [tomorrow] [!!1]')).toEqual({
      body: 'Task',
      zone: 'tomorrow !!1',
      hadBrackets: true,
    });
  });

  it('leaves unclosed brackets in the body', () => {
    expect(extractBracketZones('Task [tomorrow')).toEqual({
      body: 'Task [tomorrow',
      zone: '',
      hadBrackets: false,
    });
  });
});

describe('parseLassoMarkup', () => {
  it('strips !!1 and maps to API priority 4 (outside brackets)', () => {
    expect(parseLassoMarkup('Call dentist !!1')).toMatchObject({
      content: 'Call dentist',
      dueString: null,
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: false,
    });
  });

  it('accepts !! with a space', () => {
    expect(parseLassoMarkup('Buy milk !! 2 tomorrow')).toMatchObject({
      content: 'Buy milk',
      dueString: 'tomorrow',
      priority: 3,
      clientPriority: 2,
    });
  });

  it('accepts p1–p4 whole tokens', () => {
    expect(parseLassoMarkup('Ship it p1')).toMatchObject({
      content: 'Ship it',
      priority: 4,
      clientPriority: 1,
    });
  });

  it('does not treat page suffix as priority', () => {
    expect(parseLassoMarkup('Call dentist @ | upper |')).toMatchObject({
      content: 'Call dentist @ | upper |',
      dueString: null,
      priority: null,
      clientPriority: null,
    });
  });

  it('extracts tomorrow at time', () => {
    expect(parseLassoMarkup('Meeting tomorrow at 5pm')).toMatchObject({
      content: 'Meeting',
      dueString: 'tomorrow at 5pm',
      priority: null,
      clientPriority: null,
    });
  });

  it('extracts next Monday', () => {
    expect(parseLassoMarkup('Review next Monday')).toMatchObject({
      content: 'Review',
      dueString: 'next Monday',
    });
  });

  it('extracts month day', () => {
    expect(parseLassoMarkup('Pay rent Aug 30')).toMatchObject({
      content: 'Pay rent',
      dueString: 'Aug 30',
    });
  });

  it('extracts numeric and ISO dates', () => {
    expect(parseLassoMarkup('Due 8/30/2026')).toMatchObject({
      content: 'Due',
      dueString: '8/30/2026',
    });
    expect(parseLassoMarkup('Due 2026-08-30')).toMatchObject({
      content: 'Due',
      dueString: '2026-08-30',
    });
  });

  it('extracts every weekday and in N days', () => {
    expect(parseLassoMarkup('Standup every Monday')).toMatchObject({
      content: 'Standup',
      dueString: 'every Monday',
    });
    expect(parseLassoMarkup('Follow up in 3 days')).toMatchObject({
      content: 'Follow up',
      dueString: 'in 3 days',
    });
  });

  it('leaves misspelled dates outside brackets in content', () => {
    expect(parseLassoMarkup('Call tommorrow')).toMatchObject({
      content: 'Call tommorrow',
      dueString: null,
      priority: null,
      clientPriority: null,
    });
  });

  it('handles due + priority together outside brackets', () => {
    expect(parseLassoMarkup('Call dentist tomorrow !!1')).toMatchObject({
      content: 'Call dentist',
      dueString: 'tomorrow',
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: false,
    });
  });

  it('parses preferred [tomorrow !!1] brackets', () => {
    expect(parseLassoMarkup('Call dentist [tomorrow !!1]')).toMatchObject({
      content: 'Call dentist',
      dueString: 'tomorrow',
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: true,
    });
  });

  it('applies loose OCR aliases inside brackets including I1', () => {
    const result = parseLassoMarkup('Call dentist [tommorrow I1]');
    expect(result).toMatchObject({
      content: 'Call dentist',
      dueString: 'tomorrow',
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: true,
    });
    expect(result.corrections).toEqual(
      expect.arrayContaining([
        {from: 'tommorrow', to: 'tomorrow'},
        {from: 'I1', to: '!!1'},
      ]),
    );
  });

  it('does not treat l1 outside brackets as priority', () => {
    expect(parseLassoMarkup('Call l1 meeting')).toMatchObject({
      content: 'Call l1 meeting',
      dueString: null,
      priority: null,
      clientPriority: null,
      markupFromBrackets: false,
    });
  });

  it('maps single-bang !1 outside brackets', () => {
    const result = parseLassoMarkup('Ship it !1');
    expect(result).toMatchObject({
      content: 'Ship it',
      priority: 4,
      clientPriority: 1,
    });
    expect(result.corrections).toEqual(
      expect.arrayContaining([{from: '!1', to: '!!1'}]),
    );
  });

  it('leaves unknown bracket leftovers in the title', () => {
    expect(parseLassoMarkup('Buy milk [xyzzy]')).toMatchObject({
      content: 'Buy milk xyzzy',
      dueString: null,
      priority: null,
      markupFromBrackets: false,
    });
  });
});
