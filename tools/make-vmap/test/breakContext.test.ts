import {
  AD_CATEGORIES,
  breakContexts,
  contextPrompt,
  contextSchema,
  dialogueBefore,
  frameTimes,
  llamaVisionArgs,
  parseContext,
} from '../src/breakContext';

const LINES = [
  { startMs: 10_000, endMs: 12_000, text: 'Too early.' },
  { startMs: 90_000, endMs: 92_000, text: '(explosion)' },
  { startMs: 118_000, endMs: 119_500, text: 'Get down!' },
  { startMs: 121_000, endMs: 122_000, text: 'After the break.' },
];

describe('frameTimes', () => {
  it('takes three frames from the half minute before the break, none before the start', () => {
    expect(frameTimes(120)).toEqual([92, 105, 118]);
    expect(frameTimes(20)).toEqual([5, 18]);
  });
});

describe('dialogueBefore', () => {
  it('joins the lines of the minute before the break', () => {
    expect(dialogueBefore(LINES, 120)).toBe('(explosion) Get down!');
  });
});

describe('contextSchema and contextPrompt', () => {
  it('lets the model answer only with known moods and category codes', () => {
    const schema = contextSchema() as { properties: { mood: { enum: string[] }; avoid: { items: { enum: string[] } } } };
    expect(schema.properties.mood.enum).toEqual(['calm', 'happy', 'romantic', 'sad', 'tense', 'violent']);
    expect(schema.properties.avoid.items.enum).toEqual(AD_CATEGORIES.map((c) => c.code));
  });

  it('gives the model the dialogue and every category with its name', () => {
    const prompt = contextPrompt('Get down!', 3);
    expect(prompt).toContain('3 frames');
    expect(prompt).toContain('"Get down!"');
    AD_CATEGORIES.forEach((c) => expect(prompt).toContain(`${c.code} ${c.name}`));
    expect(contextPrompt('', 2)).toContain('no dialogue');
  });
});

describe('parseContext', () => {
  it('reads the JSON answer and adds the child categories of a blocked one', () => {
    const answer = 'loading model...\n{ "scene": "Robots fire at soldiers.", "mood": "violent", "avoid": ["1551"] }\n';
    expect(parseContext(answer)).toEqual({ scene: 'Robots fire at soldiers.', mood: 'violent', blockedAdCategories: ['1551', '1571'] });
  });

  it('lists a category once when the model names it and its parent', () => {
    expect(parseContext('{ "scene": "Crash.", "mood": "tense", "avoid": ["1571", "1551"] }')?.blockedAdCategories).toEqual(['1571', '1551']);
  });

  it('is null for an answer it cannot trust', () => {
    expect(parseContext('no json here')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "angry", "avoid": [] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "avoid": ["9999"] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "avoid": "1551" }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm" ')).toBeNull();
  });

  it('keeps a short scene line', () => {
    const long = 'a'.repeat(400);
    expect(parseContext(`{ "scene": "${long}", "mood": "calm", "avoid": [] }`)?.scene).toHaveLength(200);
  });
});

describe('llamaVisionArgs', () => {
  it('runs llama-mtmd-cli with the images, the schema file and no randomness', () => {
    expect(llamaVisionArgs({ model: 'm.gguf', mmproj: 'p.gguf' }, 'PROMPT', ['a.jpg', 'b.jpg'], 'schema.json')).toEqual([
      '-m', 'm.gguf', '--mmproj', 'p.gguf', '--image', 'a.jpg', '--image', 'b.jpg',
      '-p', 'PROMPT', '-jf', 'schema.json', '--temp', '0', '-n', '256',
    ]);
  });
});

describe('breakContexts', () => {
  it('asks the model about each break and keeps going when one answer fails', async () => {
    const asked: Array<{ images: string[]; prompt: string }> = [];
    const answers = ['{ "scene": "Calm talk.", "mood": "calm", "avoid": [] }', 'garbage'];
    const result = await breakContexts([120, 300, 500], {
      frames: async (at) => frameTimes(at).map((t) => `f${t}.jpg`),
      lines: LINES,
      ask: async (prompt, images) => {
        asked.push({ prompt, images });
        if (asked.length === 3) throw new Error('model crashed');
        return answers[asked.length - 1] as string;
      },
    });
    expect(result).toEqual([{ scene: 'Calm talk.', mood: 'calm', blockedAdCategories: [] }, null, null]);
    expect(asked[0]?.images).toEqual(['f92.jpg', 'f105.jpg', 'f118.jpg']);
    expect(asked[0]?.prompt).toContain('"(explosion) Get down!"');
  });
});
