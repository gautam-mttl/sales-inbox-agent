import { env } from "./config/env";
import app from "./app";

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`✅  Backend running on http://localhost:${PORT}`);
  console.log(`    candidate_id : ${env.CANDIDATE_ID}`);
  console.log(`    environment  : ${env.NODE_ENV}`);
  console.log(`    frontend_url : ${env.FRONTEND_URL}`);
});
