import {
  AutoProcessor,
  AutoModelForVision2Seq,
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

const PROMPT = `You are inspecting one photographed team double-page from the Panini album Road to FIFA World Cup 2026.

Inspect the actual photo and return exactly two short lines and nothing else.
First line: write the word CODE, an equals sign, and the actual three-letter team code visible on this page.
Second line: write the word STATE, an equals sign, and exactly 20 letters with no spaces. Character 1 is sticker position 1, character 20 is sticker position 20.
Use only these letters in STATE:
F = filled: a sticker covers the printed placeholder.
E = empty: the printed placeholder is visible and no sticker covers it.
U = unclear: the position is cropped, unreadable, or genuinely ambiguous.

Rules:
- Mentally orient the album page correctly even if the photo is rotated.
- Identify the team from the large team heading and the repeated three-letter code printed inside that team's sticker placeholders.
- Ignore codes in group tables, schedules, flags, or side panels belonging to other teams.
- Inspect all 20 sticker positions individually and preserve their numeric order from 1 to 20.
- Never invent a team code or position status.
- Do not explain the answer. Do not use markdown, JSON, punctuation lists, or extra text.`;

async function analyse(imageDataUrl) {
  const [processor, model] = await getModel();
  post('analysing');

  const image = await load_image(imageDataUrl);
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', image: imageDataUrl },
      { type: 'text', text: PROMPT },
    ],
  }];

  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(text, [image], { do_image_splitting: true });
  const output = await model.generate({
    ...inputs,
    do_sample: false,
    repetition_penalty: 1.08,
    max_new_tokens: 72,
  });
  const decoded = processor.batch_decode(output, {
    skip_special_tokens: true,
  })[0] || '';
  post('complete', { output: decoded });
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
