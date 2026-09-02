import {lassoFingerprint, pickLassoSource} from '../src/utils/lassoSelect';

describe('lassoFingerprint', () => {
  it('joins sorted numInPage values', () => {
    expect(lassoFingerprint([{numInPage: 12}, {numInPage: 3}])).toBe('3,12');
  });

  it('is empty for no elements', () => {
    expect(lassoFingerprint([])).toBe('');
  });
});

describe('pickLassoSource', () => {
  const lastFp = '1,2,3';

  it('prefers this-press cache when it is a new selection', () => {
    expect(
      pickLassoSource({
        lastFp,
        cachedOk: true,
        cachedFp: '4,5',
        cachedIsThisPress: true,
        freshOk: true,
        freshFp: lastFp,
      }),
    ).toBe('cache');
  });

  it('uses a fresh selection when it differs from the last capture', () => {
    expect(
      pickLassoSource({
        lastFp,
        cachedOk: true,
        cachedFp: lastFp,
        cachedIsThisPress: true,
        freshOk: true,
        freshFp: '8,9',
      }),
    ).toBe('fresh');
  });

  it('rejects a replay of the last captured lasso', () => {
    expect(
      pickLassoSource({
        lastFp,
        cachedOk: true,
        cachedFp: lastFp,
        cachedIsThisPress: true,
        freshOk: true,
        freshFp: lastFp,
      }),
    ).toBe('already-captured');
  });

  it('reports empty when nothing is selected', () => {
    expect(pickLassoSource({lastFp: ''})).toBe('empty');
  });
});
