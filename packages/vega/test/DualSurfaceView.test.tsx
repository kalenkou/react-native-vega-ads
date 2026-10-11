import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { DualSurfaceView } from '../src/DualSurfaceView';
import type { AdSurfaces } from '../src/useVegaAds';

function surfaces(shown: string | null = null): AdSurfaces & { onAdSurface: jest.Mock; onStandbySurface: jest.Mock } {
  return { shown, onAdSurface: jest.fn(), onStandbySurface: jest.fn() };
}

function render(s: AdSurfaces, onContent = jest.fn(), onContentGone = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DualSurfaceView surfaces={s} onContentSurfaceCreated={onContent} onContentSurfaceDestroyed={onContentGone} />,
    );
  });
  const layer = (id: string): ReactTestInstance => renderer.root.find((n) => n.props.testID === id && (n.type as unknown) === 'View');
  const surface = (id: string): ReactTestInstance => layer(id).find((n) => (n.type as unknown) === 'KeplerVideoSurfaceView');
  const style = (id: string): Record<string, unknown> => Object.assign({}, ...[layer(id).props.style].flat(3).filter(Boolean));
  const update = (next: AdSurfaces): void => {
    act(() => {
      renderer.update(<DualSurfaceView surfaces={next} onContentSurfaceCreated={onContent} />);
    });
  };
  return { renderer, layer, surface, style, update };
}

describe('DualSurfaceView', () => {
  it('stacks content, ad A and ad B (R11)', () => {
    const { style } = render(surfaces());
    expect(style('vega-ads-content').zIndex).toBe(1);
    expect(style('vega-ads-ad-a').zIndex).toBe(2);
    expect(style('vega-ads-ad-b').zIndex).toBe(3);
  });

  it('reports each surface handle to its owner', () => {
    const s = surfaces();
    const onContent = jest.fn();
    const onContentGone = jest.fn();
    const { surface } = render(s, onContent, onContentGone);
    act(() => surface('vega-ads-content').props.onSurfaceViewCreated('c1'));
    act(() => surface('vega-ads-ad-a').props.onSurfaceViewCreated('a1'));
    act(() => surface('vega-ads-ad-b').props.onSurfaceViewCreated('b1'));
    expect(onContent).toHaveBeenCalledWith('c1');
    expect(s.onAdSurface).toHaveBeenCalledWith('a1');
    expect(s.onStandbySurface).toHaveBeenCalledWith('b1');

    act(() => surface('vega-ads-content').props.onSurfaceViewDestroyed('c1'));
    act(() => surface('vega-ads-ad-a').props.onSurfaceViewDestroyed('a1'));
    act(() => surface('vega-ads-ad-b').props.onSurfaceViewDestroyed('b1'));
    expect(onContentGone).toHaveBeenCalledWith('c1');
    expect(s.onAdSurface).toHaveBeenLastCalledWith(null);
    expect(s.onStandbySurface).toHaveBeenLastCalledWith(null);
  });

  it('keeps both ad surfaces off screen between breaks', () => {
    const { style } = render(surfaces(null));
    expect(style('vega-ads-ad-a').left).toBeLessThan(-1920);
    expect(style('vega-ads-ad-b').left).toBeLessThan(-1920);
  });

  it('shows only ad A while A plays; a prebuffered B stays hidden (its still frame)', () => {
    const s = surfaces();
    const { surface, update, style } = render(s);
    act(() => surface('vega-ads-ad-a').props.onSurfaceViewCreated('a1'));
    act(() => surface('vega-ads-ad-b').props.onSurfaceViewCreated('b1'));
    update({ ...s, shown: 'a1' });
    expect(style('vega-ads-ad-a').left).toBe(0);
    expect(style('vega-ads-ad-b').left).toBeLessThan(-1920);
  });

  it('shows B on top when the snapshot names it', () => {
    const s = surfaces();
    const { surface, update, style } = render(s);
    act(() => surface('vega-ads-ad-a').props.onSurfaceViewCreated('a1'));
    act(() => surface('vega-ads-ad-b').props.onSurfaceViewCreated('b1'));
    update({ ...s, shown: 'b1' });
    expect(style('vega-ads-ad-b').left).toBe(0);
    expect(style('vega-ads-ad-a').left).toBe(0);
  });

  it('connects the content surface to the content player in either order', () => {
    const s = surfaces();
    const calls: string[] = [];
    const player = { setSurfaceHandle: (h: string) => calls.push(`set:${h}`), clearSurfaceHandle: (h: string) => calls.push(`clear:${h}`) };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<DualSurfaceView surfaces={s} contentPlayer={null} />);
    });
    const content = (): ReactTestInstance =>
      renderer.root.find((n) => n.props.testID === 'vega-ads-content' && (n.type as unknown) === 'View').find((n) => (n.type as unknown) === 'KeplerVideoSurfaceView');
    act(() => content().props.onSurfaceViewCreated('c1'));
    expect(calls).toEqual([]);
    act(() => {
      renderer.update(<DualSurfaceView surfaces={s} contentPlayer={player} />);
    });
    expect(calls).toEqual(['set:c1']);
    act(() => content().props.onSurfaceViewDestroyed('c1'));
    expect(calls).toEqual(['set:c1', 'clear:c1']);
  });

  it('connects a content surface created after the player', () => {
    const calls: string[] = [];
    const player = { setSurfaceHandle: (h: string) => calls.push(`set:${h}`), clearSurfaceHandle: () => undefined };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<DualSurfaceView surfaces={surfaces()} contentPlayer={player} />);
    });
    const content = renderer.root.find((n) => n.props.testID === 'vega-ads-content' && (n.type as unknown) === 'View').find((n) => (n.type as unknown) === 'KeplerVideoSurfaceView');
    act(() => content.props.onSurfaceViewCreated('c2'));
    expect(calls).toEqual(['set:c2']);
  });

  it('passes the scaling mode to every surface', () => {
    const { surface } = render(surfaces());
    expect(surface('vega-ads-content').props.scalingmode).toBe('fit');
    expect(surface('vega-ads-ad-b').props.scalingmode).toBe('fit');
  });
});
