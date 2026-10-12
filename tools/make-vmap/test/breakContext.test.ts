import {
  AD_CATEGORIES,
  breakContexts,
  SENSITIVITY_RULES,
  SIGNAL_DEFINITIONS,
  contextPrompt,
  contextSchema,
  dialogueBefore,
  frameArgs,
  frameTimes,
  llamaServerRequest,
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

  it('takes the frames at other offsets when asked', () => {
    expect(frameTimes(120, [28, 21, 14, 7, 2])).toEqual([92, 99, 106, 113, 118]);
  });
});

describe('frameArgs', () => {
  it('writes one frame 640 pixels wide by default, or as wide as asked', () => {
    expect(frameArgs('film.mp4', 92, 'f.jpg')).toContain('scale=640:-2');
    expect(frameArgs('film.mp4', 92, 'f.jpg', 1280)).toContain('scale=1280:-2');
  });
});

describe('dialogueBefore', () => {
  it('joins the lines of the minute before the break', () => {
    expect(dialogueBefore(LINES, 120)).toBe('(explosion) Get down!');
  });
});

describe('contextSchema and contextPrompt', () => {
  it('lets the model answer only with known moods and signals', () => {
    const schema = contextSchema() as {
      properties: { mood: { enum: string[] }; signals: { items: { properties: { signal: { enum: string[] } }; required: string[] } } };
    };
    expect(schema.properties.mood.enum).toEqual(['calm', 'happy', 'romantic', 'sad', 'tense', 'violent']);
    expect(schema.properties.signals.items.properties.signal.enum).toEqual(Object.keys(SENSITIVITY_RULES));
    expect(schema.properties.signals.items.required).toEqual(['signal', 'evidence']);
  });

  it('defines every signal once, the same words the labelling page shows', () => {
    expect(Object.keys(SIGNAL_DEFINITIONS)).toEqual(Object.keys(SENSITIVITY_RULES));
    expect(SIGNAL_DEFINITIONS.violence).toBe('Someone hits, shoots, fights or attacks; blasts in a fight.');
  });

  // The eval (eval/README.md) chose this on the selection set: F1 0.43 -> 0.51 with Qwen3.6.
  it('tells the model what counts as each signal, unless turned off', () => {
    const prompt = contextPrompt('', 3);
    Object.entries(SIGNAL_DEFINITIONS).forEach(([signal, meaning]) => expect(prompt).toContain(`${signal}: ${meaning}`));
    expect(contextPrompt('', 3, { definitions: false })).not.toContain(SIGNAL_DEFINITIONS.violence);
  });

  it('gives the model the dialogue and every signal, and no category codes', () => {
    const prompt = contextPrompt('Get down!', 3);
    expect(prompt).toContain('3 frames');
    expect(prompt).toContain('"Get down!"');
    Object.keys(SENSITIVITY_RULES).forEach((signal) => expect(prompt).toContain(signal));
    expect(prompt).not.toContain('1551');
    expect(prompt).toContain('evidence');
    expect(contextPrompt('', 2)).toContain('no dialogue');
  });

  it('blocks only categories with a name from the IAB list', () => {
    Object.values(SENSITIVITY_RULES).flat().forEach((code) => expect(AD_CATEGORIES[code]).toBeDefined());
  });
});

describe('parseContext', () => {
  it('reads the JSON answer and lets the rules turn its signals into blocked categories', () => {
    const answer =
      'loading model...\n{ "scene": "A car hits a wall.", "mood": "tense", "signals": [{ "signal": "vehicle crash", "evidence": "A car hits a wall." }] }\n';
    expect(parseContext(answer)).toEqual({
      scene: 'A car hits a wall.',
      mood: 'tense',
      signals: [{ name: 'vehicle crash', evidence: 'A car hits a wall.' }],
      blockedAdCategories: ['1551', '1571'],
    });
  });

  const said = (signal: string, evidence: string) => ({ signal, evidence });
  const answer = (...signals: Array<{ signal: string; evidence: string }>) => JSON.stringify({ scene: 'x', mood: 'sad', signals });

  it('lists a signal and a category once', () => {
    const context = parseContext(answer(said('death', 'A body lies on the floor.'), said('grief', 'She cries over him.'), said('death', 'He is dead.')));
    expect(context?.signals).toEqual([
      { name: 'death', evidence: 'A body lies on the floor.' },
      { name: 'grief', evidence: 'She cries over him.' },
    ]);
    expect(context?.blockedAdCategories).toEqual(['1343', '1248', '1002', '1003', '1004', '1005', '1006', '1007']);
  });

  it('drops a signal whose evidence is a guess, or empty', () => {
    const context = parseContext(
      answer(
        said('death', 'The weapon suggests a potential death.'),
        said('grief', 'He appears distressed, possibly grieving.'),
        said('injury', 'Someone could be hurt.'),
        said('child in danger', 'The robot arm resembles a weapon.'),
        said('violence', ' '),
        said('weapons', 'A soldier aims a rifle.'),
      ),
    );
    expect(context?.signals).toEqual([{ name: 'weapons', evidence: 'A soldier aims a rifle.' }]);
    expect(context?.blockedAdCategories).toEqual(['1248']);
  });

  it('drops a signal whose evidence says it is not there', () => {
    const context = parseContext(
      answer(
        said('vehicle crash', 'There is no evidence of a vehicle crash in the scene.'),
        said('weapons', 'No weapons are visible in the frames.'),
        said('drinking', 'Drinking is not shown.'),
        said('injury', 'There are no signs of injury.'),
        said('grief', 'None.'),
        said('death', 'He is not breathing and she closes his eyes.'),
      ),
    );
    expect(context?.signals).toEqual([{ name: 'death', evidence: 'He is not breathing and she closes his eyes.' }]);
  });

  it('is null for an answer it cannot trust', () => {
    expect(parseContext('no json here')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "angry", "signals": [] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "signals": [{ "signal": "explosions", "evidence": "boom" }] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "signals": [{ "signal": "death" }] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "signals": ["death"] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm", "signals": "death" }')).toBeNull();
    expect(parseContext('{ "scene": 7, "mood": "calm", "signals": [] }')).toBeNull();
    expect(parseContext('{ "scene": "x", "mood": "calm" ')).toBeNull();
  });

  it('keeps a short scene line', () => {
    const long = 'a'.repeat(400);
    expect(parseContext(`{ "scene": "${long}", "mood": "calm", "signals": [] }`)?.scene).toHaveLength(200);
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

describe('llamaServerRequest', () => {
  // llama-server, not llama-mtmd-cli: models with a thinking channel (Gemma 4, Qwen3.6) answer
  // with plain JSON only when the server is started with --reasoning off.
  it('sends the frames as JPEG data URLs, then the prompt, bound to the schema with no randomness', () => {
    const body = llamaServerRequest('PROMPT', [Buffer.from('jpeg-1'), Buffer.from('jpeg-2')], { type: 'object' });
    expect(body).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-1').toString('base64')}` } },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-2').toString('base64')}` } },
            { type: 'text', text: 'PROMPT' },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 256,
      response_format: { type: 'json_schema', json_schema: { name: 'break_context', schema: { type: 'object' } } },
    });
  });
});

describe('breakContexts', () => {
  it('asks the model about each break and keeps going when one answer fails', async () => {
    const asked: Array<{ images: string[]; prompt: string }> = [];
    const answers = ['{ "scene": "Calm talk.", "mood": "calm", "signals": [] }', 'garbage'];
    const result = await breakContexts([120, 300, 500], {
      frames: async (at) => frameTimes(at).map((t) => `f${t}.jpg`),
      lines: LINES,
      ask: async (prompt, images) => {
        asked.push({ prompt, images });
        if (asked.length === 3) throw new Error('model crashed');
        return answers[asked.length - 1] as string;
      },
    });
    expect(result).toEqual([{ scene: 'Calm talk.', mood: 'calm', signals: [], blockedAdCategories: [] }, null, null]);
    expect(asked[0]?.images).toEqual(['f92.jpg', 'f105.jpg', 'f118.jpg']);
    expect(asked[0]?.prompt).toContain('"(explosion) Get down!"');
  });

  it('passes the prompt options to every question', async () => {
    const prompts: string[] = [];
    await breakContexts([120], {
      frames: async () => ['f.jpg'],
      lines: [],
      prompt: { definitions: false },
      ask: async (prompt) => (prompts.push(prompt), '{}'),
    });
    expect(prompts[0]).not.toContain(SIGNAL_DEFINITIONS.weapons);
  });
});
