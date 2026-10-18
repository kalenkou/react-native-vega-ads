import TestRenderer, { act } from 'react-test-renderer';
import { AdSurfaceLayers } from '../src/AdSurfaceLayers';
import type { AdSurfaces } from '../src/useVegaAds';

function surfaces(shown: string | null = null) {
  return {
    shown,
    onAdSurface: jest.fn(),
    onStandbySurface: jest.fn(),
    onContentSurface: jest.fn(),
  } satisfies AdSurfaces;
}

describe('AdSurfaceLayers (for apps that render their own content surface)', () => {
  it('renders the two ad surfaces only', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdSurfaceLayers surfaces={surfaces()} />);
    });
    const kinds = renderer.root.findAll((n) => (n.type as unknown) === 'KeplerVideoSurfaceView');
    expect(kinds).toHaveLength(2);
    expect(renderer.root.findAll((n) => n.props.testID === 'vega-ads-content')).toHaveLength(0);
  });

  it('tells the hook that the app owns the content surface', () => {
    const s = surfaces();
    act(() => {
      TestRenderer.create(<AdSurfaceLayers surfaces={s} />);
    });
    expect(s.onContentSurface).toHaveBeenCalledWith(expect.any(String));
  });

  it('reports the ad surface handles and shows A while an ad plays', () => {
    const s = surfaces();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdSurfaceLayers surfaces={s} />);
    });
    const [a] = renderer.root.findAll((n) => (n.type as unknown) === 'KeplerVideoSurfaceView');
    act(() => a?.props.onSurfaceViewCreated('a1'));
    expect(s.onAdSurface).toHaveBeenCalledWith('a1');
    act(() => {
      renderer.update(<AdSurfaceLayers surfaces={{ ...s, shown: 'a1' }} />);
    });
    const layerA = renderer.root.find((n) => n.props.testID === 'vega-ads-ad-a' && (n.type as unknown) === 'View');
    expect(Object.assign({}, ...[layerA.props.style].flat(3).filter(Boolean)).left).toBe(0);
  });

  it('sits above the content captions by default', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdSurfaceLayers surfaces={surfaces()} />);
    });
    const root = renderer.root.findAll((n) => (n.type as unknown) === 'View')[0];
    const style = Object.assign({}, ...[root?.props.style].flat(3).filter(Boolean));
    expect(style.zIndex).toBeGreaterThan(2);
  });
});
