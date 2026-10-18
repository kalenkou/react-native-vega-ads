import {
  audioArgs,
  parseWhisperJson,
  parseWhisperLines,
  whisperArgs,
  whisperSpeech,
  WhisperTools,
} from '../src/whisperSpeech';

// Real whisper.cpp 1.9.5 output (`-ojf`, ggml-base.en, Tears of Steel), trimmed to six segments
// and to the token fields this tool reads.
const JSON_OUTPUT = `{
  "result": { "language": "en" },
  "transcription": [
    {"offsets":{"from":49400,"to":54400},"text":" Robots, memories, synced and locked.","tokens":[{"text":" Robots","offsets":{"from":49400,"to":49400}},{"text":",","offsets":{"from":49400,"to":49400}},{"text":" memories","offsets":{"from":49430,"to":49750}},{"text":",","offsets":{"from":49840,"to":50290}},{"text":" syn","offsets":{"from":50290,"to":51100}},{"text":"ced","offsets":{"from":51110,"to":51910}},{"text":" and","offsets":{"from":51910,"to":52720}},{"text":" locked","offsets":{"from":52720,"to":54400}},{"text":".","offsets":{"from":54400,"to":54400}},{"text":"[_TT_1350]","offsets":{"from":54400,"to":54400}}]},
    {"offsets":{"from":57400,"to":59980},"text":" (somber music)","tokens":[{"text":"[_BEG_]","offsets":{"from":57400,"to":57400}},{"text":" (","offsets":{"from":57420,"to":57600}},{"text":"s","offsets":{"from":57620,"to":57790}},{"text":"om","offsets":{"from":57810,"to":58180}},{"text":"ber","offsets":{"from":58180,"to":58770}},{"text":" music","offsets":{"from":58860,"to":59760}},{"text":")","offsets":{"from":59760,"to":59980}},{"text":"[_TT_129]","offsets":{"from":59980,"to":59980}}]},
    {"offsets":{"from":61000,"to":62880},"text":" This is pretty freaky.","tokens":[{"text":" This","offsets":{"from":61000,"to":61000}},{"text":" is","offsets":{"from":61000,"to":61000}},{"text":" pretty","offsets":{"from":61220,"to":61560}},{"text":" fre","offsets":{"from":61560,"to":61960}},{"text":"aky","offsets":{"from":61960,"to":62380}},{"text":".","offsets":{"from":62380,"to":62880}},{"text":"[_TT_274]","offsets":{"from":62880,"to":62880}}]},
    {"offsets":{"from":191480,"to":192760},"text":" - Are you ready?","tokens":[{"text":" -","offsets":{"from":191480,"to":191480}},{"text":" Are","offsets":{"from":191480,"to":191480}},{"text":" you","offsets":{"from":191480,"to":191480}},{"text":" ready","offsets":{"from":191480,"to":191480}},{"text":"?","offsets":{"from":191960,"to":192760}},{"text":"[_TT_768]","offsets":{"from":192760,"to":192760}}]},
    {"offsets":{"from":192760,"to":193640},"text":" - Of course you're ready.","tokens":[{"text":" -","offsets":{"from":192780,"to":192790}},{"text":" Of","offsets":{"from":192790,"to":192830}},{"text":" course","offsets":{"from":192940,"to":193080}},{"text":" you","offsets":{"from":193080,"to":193190}},{"text":"'re","offsets":{"from":193190,"to":193300}},{"text":" ready","offsets":{"from":193300,"to":193490}},{"text":".","offsets":{"from":193490,"to":193640}},{"text":"[_TT_812]","offsets":{"from":193640,"to":193640}}]},
    {"offsets":{"from":435280,"to":437280},"text":" *screams* You've been up!","tokens":[{"text":"[_BEG_]","offsets":{"from":435280,"to":435280}},{"text":" *","offsets":{"from":435300,"to":435500}},{"text":"sc","offsets":{"from":435590,"to":435940}},{"text":"ream","offsets":{"from":435940,"to":436820}},{"text":"s","offsets":{"from":436820,"to":437040}},{"text":"*","offsets":{"from":437040,"to":437280}},{"text":" You","offsets":{"from":437280,"to":437280}},{"text":"'ve","offsets":{"from":437280,"to":437280}},{"text":" been","offsets":{"from":437280,"to":437280}},{"text":" up","offsets":{"from":437280,"to":437280}},{"text":"!","offsets":{"from":437280,"to":437280}},{"text":"[_TT_100]","offsets":{"from":437280,"to":437280}}]}
  ]
}`;

describe('parseWhisperLines', () => {
  it('keeps the text of each segment with its time, sound labels included', () => {
    expect(parseWhisperLines(JSON_OUTPUT).slice(0, 3)).toEqual([
      { startMs: 49400, endMs: 54400, text: 'Robots, memories, synced and locked.' },
      { startMs: 57400, endMs: 59980, text: '(somber music)' },
      { startMs: 61000, endMs: 62880, text: 'This is pretty freaky.' },
    ]);
  });

  it('skips empty segments', () => {
    expect(parseWhisperLines(JSON.stringify({ transcription: [{ offsets: { from: 0, to: 1 }, text: '  ' }] }))).toEqual(
      [],
    );
  });
});

describe('parseWhisperJson', () => {
  it('turns word timings into stretches of speech and skips sound labels', () => {
    expect(parseWhisperJson(JSON_OUTPUT)).toEqual([
      // "Robots, memories, synced and locked."
      { startMs: 49400, endMs: 54400 },
      // "(somber music)" is not speech; "This is pretty freaky." is.
      { startMs: 61000, endMs: 62880 },
      // "Are you ready?" ends at 192.76 s (its words have no length, the "?" carries the time);
      // "Of course you're ready." starts 30 ms later: one stretch.
      { startMs: 191480, endMs: 193640 },
      // "*screams*" is a label; "You've been up!" is speech.
      { startMs: 437280, endMs: 437280 },
    ]);
  });

  it('keeps stretches more than 0.4 s apart separate and sorts them', () => {
    const segment = (from: number, to: number, word: string) => ({
      offsets: { from, to },
      tokens: [{ text: word, offsets: { from, to } }],
    });
    const json = JSON.stringify({
      transcription: [segment(5000, 6000, ' Two'), segment(1000, 2000, ' One'), segment(2300, 2500, ' more')],
    });
    expect(parseWhisperJson(json)).toEqual([
      { startMs: 1000, endMs: 2500 },
      { startMs: 5000, endMs: 6000 },
    ]);
  });

  it('counts sung words but not the music notes or special tokens around them', () => {
    const json = JSON.stringify({
      transcription: [
        {
          offsets: { from: 0, to: 3000 },
          tokens: [
            { text: '[_BEG_]', offsets: { from: 0, to: 0 } },
            { text: ' ♪', offsets: { from: 0, to: 1000 } },
            { text: ' la', offsets: { from: 1000, to: 2000 } },
            { text: ' ♪', offsets: { from: 2000, to: 3000 } },
            { text: '[_TT_150]', offsets: { from: 3000, to: 3000 } },
          ],
        },
      ],
    });
    expect(parseWhisperJson(json)).toEqual([{ startMs: 1000, endMs: 2000 }]);
  });

  it('ends a stretch at a label: punctuation after the label is not speech', () => {
    const json = JSON.stringify({
      transcription: [
        {
          offsets: { from: 0, to: 5000 },
          tokens: [
            { text: ' Run', offsets: { from: 0, to: 1000 } },
            { text: ' [', offsets: { from: 1000, to: 1200 } },
            { text: 'GUNSHOT', offsets: { from: 1200, to: 3000 } },
            { text: ']', offsets: { from: 3000, to: 3200 } },
            { text: '.', offsets: { from: 3200, to: 5000 } },
          ],
        },
      ],
    });
    expect(parseWhisperJson(json)).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it('rejects output without a transcription', () => {
    expect(() => parseWhisperJson('{"result":{}}')).toThrow(/transcription/);
  });
});

describe('whisperSpeech', () => {
  function fakeTools(output = JSON_OUTPUT) {
    const calls: string[] = [];
    const tools: WhisperTools = {
      makeTempDir: async () => (calls.push('mkdir'), '/tmp/make-vmap-1'),
      runFfmpeg: async (args) => (calls.push(`ffmpeg ${args.join(' ')}`), ''),
      runWhisper: async (args) => void calls.push(`whisper ${args.join(' ')}`),
      readFile: async (path) => (calls.push(`read ${path}`), output),
      removeDir: async (path) => void calls.push(`rm ${path}`),
    };
    return { tools, calls };
  }

  it('extracts the audio, runs whisper on it, reads the JSON and removes the temporary files', async () => {
    const { tools, calls } = fakeTools();
    const speech = await whisperSpeech('film.mp4', 'ggml-base.en.bin', tools);
    expect(speech).toHaveLength(4);
    expect(calls).toEqual([
      'mkdir',
      `ffmpeg ${audioArgs('film.mp4', '/tmp/make-vmap-1/audio.wav').join(' ')}`,
      `whisper ${whisperArgs('ggml-base.en.bin', '/tmp/make-vmap-1/audio.wav', '/tmp/make-vmap-1/speech').join(' ')}`,
      'read /tmp/make-vmap-1/speech.json',
      'rm /tmp/make-vmap-1',
    ]);
  });

  it('removes the temporary files when whisper fails', async () => {
    const { tools, calls } = fakeTools();
    tools.runWhisper = () => Promise.reject(new Error('whisper-cli failed'));
    await expect(whisperSpeech('film.mp4', 'model.bin', tools)).rejects.toThrow('whisper-cli failed');
    expect(calls[calls.length - 1]).toBe('rm /tmp/make-vmap-1');
  });
});

describe('arguments', () => {
  it('extracts 16 kHz mono 16-bit audio, the input whisper.cpp needs', () => {
    expect(audioArgs('in.mp4', 'out.wav')).toEqual(
      expect.arrayContaining(['-i', 'in.mp4', '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'out.wav']),
    );
  });

  it('asks whisper for full JSON without carried-over context', () => {
    const args = whisperArgs('model.bin', 'audio.wav', 'out');
    expect(args).toEqual(expect.arrayContaining(['-m', 'model.bin', '-f', 'audio.wav', '-ojf', '-of', 'out']));
    // With context from earlier windows whisper repeats lines over music ("no, no, no, ..." for minutes).
    expect(args.join(' ')).toContain('-mc 0');
  });
});
