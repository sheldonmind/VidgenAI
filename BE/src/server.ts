import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { startGenerationPoller } from "./services/generationPoller";

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  startGenerationPoller();
});
