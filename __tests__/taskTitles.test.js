import {
  fileBaseName,
  localRelativePath,
  buildParentTitle,
  normalizeLassoText,
  buildSubtaskContent,
  buildSubtaskFromOcr,
  formatPageLocationSuffix,
} from '../src/utils/taskTitles';

describe('fileBaseName', () => {
  it('strips path and .note suffix', () => {
    expect(fileBaseName('/Note/Projects/Meeting Notes.note')).toBe('Meeting Notes');
  });

  it('falls back when empty', () => {
    expect(fileBaseName('')).toBe('note');
  });
});

describe('localRelativePath', () => {
  it('builds folder breadcrumb without the file name', () => {
    expect(
      localRelativePath(
        '/storage/emulated/0/Note/CHP - Professional/Service Weeks/8-24-26 CON/RTL.note',
      ),
    ).toBe('Note>CHP - Professional>Service Weeks>8-24-26 CON');
  });

  it('strips /sdcard/ prefix', () => {
    expect(localRelativePath('/sdcard/Note/Folder/file.note')).toBe('Note>Folder');
  });

  it('keeps Note root for files directly under Note', () => {
    expect(localRelativePath('/storage/emulated/0/Note/Alone.note')).toBe('Note');
  });

  it('returns empty when path is missing or file-only', () => {
    expect(localRelativePath('')).toBe('');
    expect(localRelativePath('RTL.note')).toBe('');
  });
});

describe('buildParentTitle', () => {
  it('is file name | folder breadcrumb | page N', () => {
    expect(
      buildParentTitle(
        '/storage/emulated/0/Note/CHP - Professional/Service Weeks/8-24-26 CON/RTL.note',
        3,
      ),
    ).toBe('RTL | Note>CHP - Professional>Service Weeks>8-24-26 CON | page 3');
  });

  it('includes Note root for files directly under Note', () => {
    expect(buildParentTitle('/storage/emulated/0/Note/Meeting Notes.note', 2)).toBe(
      'Meeting Notes | Note | page 2',
    );
  });

  it('falls back to file name | page when there is no folder path', () => {
    expect(buildParentTitle('Meeting Notes.note', 1)).toBe('Meeting Notes | page 1');
    expect(buildParentTitle('', 4)).toBe('note | page 4');
    expect(buildParentTitle('  ', 1)).toBe('note | page 1');
  });

  it('treats page 0 as page 1', () => {
    expect(buildParentTitle('RTL.note', 0)).toBe('RTL | page 1');
  });
});

describe('normalizeLassoText', () => {
  it('joins OCR lines into one subtask body', () => {
    expect(normalizeLassoText('Call dentist\n\n  buy milk  ')).toBe('Call dentist buy milk');
  });
});

describe('formatPageLocationSuffix', () => {
  it('uses @ | lowercase quarter | without page', () => {
    expect(formatPageLocationSuffix(3, 'Upper')).toBe('@ | upper |');
  });
});

describe('buildSubtaskContent', () => {
  it('appends location suffix at the end', () => {
    expect(buildSubtaskContent('Call dentist', 3, 'Upper')).toBe(
      'Call dentist @ | upper |',
    );
  });

  it('still works when page is 0 (location only)', () => {
    expect(buildSubtaskContent('Task', 0, 'Top')).toBe('Task @ | top |');
  });
});

describe('buildSubtaskFromOcr', () => {
  it('strips due and priority from title and returns fields', () => {
    expect(buildSubtaskFromOcr('Call dentist tomorrow !!1', 3, 'Upper')).toMatchObject({
      content: 'Call dentist @ | upper |',
      body: 'Call dentist',
      dueString: 'tomorrow',
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: false,
    });
  });

  it('parses bracket markup and keeps location suffix', () => {
    expect(buildSubtaskFromOcr('Call dentist [tommorrow I1]', 3, 'Upper')).toMatchObject({
      content: 'Call dentist @ | upper |',
      body: 'Call dentist',
      dueString: 'tomorrow',
      priority: 4,
      clientPriority: 1,
      markupFromBrackets: true,
    });
  });

  it('does not treat location suffix as priority', () => {
    const result = buildSubtaskFromOcr('Ship it', 3, 'Lower');
    expect(result.content).toBe('Ship it @ | lower |');
    expect(result.priority).toBeNull();
  });
});
