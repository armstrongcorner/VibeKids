import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '4321', 10);
const app = createApp();

app.listen(port, () => {
  console.log(`Vibe Kids listening on http://localhost:${port}`);
});
