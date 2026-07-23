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
Return ONLY a compact valid JSON object in this exact shape:
{"code":"JPN","missing":[2,3],"uncertain":[]}

Rules:
- Mentally orient the album page correctly even if the photo is rotated.
- Identify the team from the large team heading and the repeated three-letter code printed inside that team's sticker placeholders.
- Ignore three-letter codes in group tables, schedules, flags, or side panels belonging to other teams.
- There are exactly 20 team sticker positions, numbered 1 through 20.
- A position is missing only when the printed empty placeholder is visible and no sticker covers it.
- A position is filled when a player, team, shirt, badge, or other sticker covers the placeholder.
- Inspect all 20 positions individually.
- Put only genuinely unreadable or cropped positions in uncertain.
- Never include a number outside 1 through 20. Never repeat a number.
- Do not explain the answer and do not use markdown.`;

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
    max_new_tokens: 120,
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
