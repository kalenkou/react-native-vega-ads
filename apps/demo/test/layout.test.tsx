/** The demo's styles are written for 1920x1080 and keep their look on React Native 0.83. */
describe('layoutStyles', () => {
  const styles = {title: {fontSize: 48, marginBottom: 24, color: '#fff'}};

  /**
   * layoutStyles with a window of this width. React Native reads Dimensions lazily from the
   * module registry in use, so the call stays inside the fresh one.
   */
  const layoutStylesAt = (width: number) => {
    let out: unknown;
    jest.isolateModules(() => {
      const {Dimensions} =
        require('react-native') as typeof import('react-native');
      jest.spyOn(Dimensions, 'get').mockReturnValue({
        width,
        height: (width * 9) / 16,
        scale: 1,
        fontScale: 1,
      });
      const theme = require('../src/theme') as typeof import('../src/theme');
      out = theme.layoutStyles(styles);
    });
    return out;
  };

  it('keeps the lengths on the 1920x1080 layout of React Native 0.72', () => {
    expect(layoutStylesAt(1920)).toEqual(styles);
  });

  it('halves them on the 960x540 dp canvas of React Native 0.83', () => {
    expect(layoutStylesAt(960)).toEqual({
      title: {fontSize: 24, marginBottom: 12, color: '#fff'},
    });
  });
});
