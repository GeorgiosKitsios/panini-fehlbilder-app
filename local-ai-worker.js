import {
  AutoProcessor,
  AutoModelForVision2Seq,
  TextStreamer,
  load_image,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';

const MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';
let processorPromise = null;
let modelPromise = null;
let dtype = 'q4';

function post(status, data = {}) {
  self.postMessage({ status, ...data });
}

async function detectDtype() {
  if (!self.navigator?.gpu) throw new Error('WebGPU wird auf diesem Gerät nicht unterstützt.');
  const adapter = await self.navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Kein WebGPU-Adapter verfügbar.');
  dtype = adapter.features.has('shader-f16') ? 'q4f16' : 'q4';
  return dtype;
}

async function getModel() {
  if (!processorPromise || !modelPromise) {
    await detectDtype();
    const progress_callback = (event) => post('progress', { event });
    processorPromise = AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    modelPromise = AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      device: 'webgpu',
      dtype,
      progress_callback,
    });
  }
  return Promise.all([processorPromise, modelPromise]);
}

const CODE_PROMPT = `Look only at the photographed Panini team double-page.
Identify the team from the large team heading and the same three-letter code repeated inside that team's empty sticker placeholders.
Ignore codes in group tables, schedules, flags and side panels.
Output only the actual three-letter team code as exactly three uppercase letters. No label, punctuation, explanation or markdown.`;

function statePrompt(code) {
  return `Look only at the photographed Panini team double-page for team ${code}.
There are exactly 20 numbered sticker positions, in numeric order 1 through 20.
For every position output one letter:
F if a sticker covers the printed placeholder.
E if the printed empty placeholder is visible and no sticker covers it.
U only if the position is cropped, unreadable or genuinely ambiguous.
Output exactly 20 letters total, one per position from 1 to 20, with no spaces, label, punctuation, explanation or markdown.`;
}

async function generateText(processor, model, image, prompt, maxNewTokens) {
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', image },
      { type: 'text', text: prompt },
    ],
  }];
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(text, [image], { do_image_splitting: true });
  let generated = '';
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      generated += String(chunk || '');
    },
  });
  await model.generate({
    ...inputs,
    do_sample: false,
    repetition_penalty: 1.05,
    max_new_tokens: maxNewTokens,
    streamer,
  });
  return generated.trim();
}

function parseCode(text) {
  const matches = String(text || '').toUpperCase().match(/[A-Z]{3}/g) || [];
  if (!matches.length) throw new Error(`Kein Teamcode in der KI-Antwort: ${String(text || '').slice(0, 80)}`);
  return matches[matches.length - 1];
}

function parseState(text) {
  const raw = String(text || '').toUpperCase().trim();
  const direct = raw.match(/(?:^|[^FEU])([FEU]{20})(?![FEU])/);
  if (direct) return direct[1];

  const afterEquals = raw.includes('=') ? raw.slice(raw.lastIndexOf('=') + 1) : raw;
  const compact = afterEquals.replace(/[^FEU]/g, '');
  if (compact.length === 20) return compact;

  throw new Error(`Keine vollständige 20-Felder-Antwort: ${raw.slice(0, 100)}`);
}

async function analyse(imageDataUrl) {
  const [processor, model] = await getModel();
  const image = await load_image(imageDataUrl);

  post('analysing-code');
  const rawCode = await generateText(processor, model, image, CODE_PROMPT, 12);
  const code = parseCode(rawCode);

  post('analysing-fields', { code });
  const rawState = await generateText(processor, model, image, statePrompt(code), 32);
  const state = parseState(rawState);

  post('complete', { output: { code, state, rawCode, rawState } });
}

self.addEventListener('message', async (event) => {
  try {
    if (event.data?.type === 'load') {
      post('loading');
      await getModel();
      post('ready', { dtype });
    } else if (event.data?.type === 'analyse') {
      await analyse(event.data.image);
    }
  } catch (error) {
    post('error', { error: error instanceof Error ? error.message : String(error) });
  }
});
