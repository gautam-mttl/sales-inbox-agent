import { GoogleGenerativeAI } from '@google/generative-ai';

async function run() {
  console.log('starting...');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  console.log('model init...');
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
  try {
    console.log('calling...');
    const result = await model.generateContent('Say hello');
    console.log('OK:', result.response.text());
    process.exit(0);
  } catch(e: any) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}

run();
