import React from 'react';
import TestRenderer from 'react-test-renderer';
import {Timeline} from '../src/components/Timeline';

const styleOf = (node: TestRenderer.ReactTestInstance) =>
  Object.assign({}, ...[node.props.style].flat(2).filter(Boolean));

describe('Timeline', () => {
  it('marks each ad break where it is, and fades the ones already played', () => {
    const renderer = TestRenderer.create(
      <Timeline
        position={150}
        duration={600}
        marks={[
          {id: 'a', time: 140, done: true},
          {id: 'b', time: 441, done: false},
        ]}
      />,
    );
    const played = renderer.root.findByProps({testID: 'timeline-played'});
    expect(styleOf(played).width).toBe('25%');
    const a = styleOf(renderer.root.findByProps({testID: 'timeline-mark-a'}));
    const b = styleOf(renderer.root.findByProps({testID: 'timeline-mark-b'}));
    expect(a.left).toBe(`${(140 / 600) * 100}%`);
    expect(a.opacity).toBe(0.35);
    expect(b.left).toBe('73.5%');
    expect(b.opacity).toBeUndefined();
  });

  it('draws no marks before the duration is known', () => {
    const renderer = TestRenderer.create(
      <Timeline
        position={0}
        duration={0}
        marks={[{id: 'a', time: 140, done: false}]}
      />,
    );
    expect(
      renderer.root.findAllByProps({testID: 'timeline-mark-a'}),
    ).toHaveLength(0);
  });
});
